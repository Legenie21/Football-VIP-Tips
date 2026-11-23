import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { createAccountRouter } from "../src/routes/accounts";
import { accountPool, accountStore, type AccountStore, type StoredAccount } from "../src/lib/account-store";
import { digest, hashPassword, verifyPassword } from "../src/lib/account-security";

// Test double only. Never imported by the application or used as a DB fallback.
class FixtureStore implements AccountStore {
  users = new Map<string, StoredAccount>();
  sessions = new Map<string, string>();
  attempts = new Map<string, number>();
  sessionReads = 0;
  unavailable = false;
  async consumeLimit(key: string, max: number) {
    if (this.unavailable) throw Object.assign(new Error("database password must never leak"), { code: "ER_ACCESS_DENIED_ERROR" });
    const attempts = (this.attempts.get(key) ?? 0) + 1;
    this.attempts.set(key, attempts);
    return attempts <= max;
  }
  async findByEmail(email: string) { return [...this.users.values()].find(u => u.email === email) ?? null; }
  async createAccount(user: StoredAccount, hash: string, old?: string) {
    if ([...this.users.values()].some(u => u.email === user.email || u.username.toLowerCase() === user.username.toLowerCase())) {
      throw Object.assign(new Error("duplicate details must not leak"), { code: "ER_DUP_ENTRY" });
    }
    this.users.set(user.id, user);
    this.sessions.set(hash, user.id);
    if (old) this.sessions.delete(old);
  }
  async openSession(id: string, hash: string, old?: string) {
    this.sessions.set(hash, id);
    if (old) this.sessions.delete(old);
  }
  async readSession(hash: string) {
    this.sessionReads++;
    const user = this.users.get(this.sessions.get(hash) ?? "");
    if (!user) return null;
    const { passwordHash: _hash, ...result } = user;
    return result;
  }
  async revokeSession(hash: string) { this.sessions.delete(hash); }
}

const valid = { email: "member@example.test", username: "Supporter_237", password: "Un-long-mot-de-passe-237" };
const cookie = (res: globalThis.Response) => res.headers.get("set-cookie")!.split(";")[0];

async function fixture<T>(callback: (request: ReturnType<typeof requests>, store: FixtureStore) => Promise<T>) {
  const store = new FixtureStore();
  return withServer(store, (request) => callback(request, store));
}

function requests(base: string) {
  return (route: string, options: { data?: unknown; cookie?: string; headers?: Record<string, string>; method?: string } = {}) =>
    fetch(base + route, {
      method: options.method ?? (options.data === undefined ? "GET" : "POST"),
      headers: {
        ...(options.data === undefined ? {} : { "Content-Type": "application/json" }),
        "Origin": base, "X-Maestro-Action": "1",
        ...(options.cookie ? { Cookie: options.cookie } : {}), ...options.headers,
      },
      ...(options.data === undefined ? {} : { body: JSON.stringify(options.data) }),
    });
}

async function withServer<T>(store: AccountStore, callback: (request: ReturnType<typeof requests>) => Promise<T>) {
  const app = express();
  app.use(express.json());
  app.use("/api", createAccountRouter(store));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.on("listening", resolve));
  try {
    return await callback(requests(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api`.replace("/api", "")));
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

test("scrypt sale chaque mot de passe, respecte les espaces et refuse une empreinte invalide", async () => {
  const hash = await hashPassword(" un mot de passe assez long ");
  assert.notEqual(hash, await hashPassword(" un mot de passe assez long "));
  assert.ok(await verifyPassword(" un mot de passe assez long ", hash));
  assert.equal(await verifyPassword("un mot de passe assez long", hash), false);
  assert.equal(await verifyPassword(valid.password, "scrypt-v1$bad$bad"), false);
});

test("un visiteur ne lit pas le tableau de bord et ne déclenche aucun accès SQL sans cookie", () => fixture(async (request, store) => {
  const session = await request("/api/auth/session");
  assert.equal(session.status, 200);
  assert.deepEqual(await session.json(), { user: null });
  assert.equal((await request("/api/member/dashboard")).status, 401);
  assert.equal(store.sessionReads, 0);
}));

test("l'inscription active le compte sans e-mail et ouvre une session HttpOnly sécurisée", () => fixture(async (request, store) => {
  const response = await request("/api/auth/register", { data: { ...valid, email: " MEMBER@example.test " } });
  assert.equal(response.status, 201);
  const { user } = await response.json();
  assert.equal(user.email, "member@example.test");
  assert.equal(user.username, valid.username);
  assert.equal(user.role, "member");
  assert.equal(user.emailVerified, false);
  assert.equal(user.passwordHash, undefined);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(response.headers.get("set-cookie")!, /__Host-maestro_session=.*; Max-Age=604800; Path=\/;.*HttpOnly; Secure; SameSite=Lax/);
  assert.equal(store.users.size, 1);
  assert.notEqual(store.users.get(user.id)!.passwordHash, valid.password);
  assert.ok(await verifyPassword(valid.password, store.users.get(user.id)!.passwordHash));
  const authCookie = cookie(response);
  assert.ok(store.sessions.has(digest(authCookie.split("=")[1])));
  const dashboard = await request("/api/member/dashboard", { cookie: authCookie });
  assert.equal(dashboard.status, 200);
  assert.deepEqual((await dashboard.json()).user, user);
  assert.equal((await (await request("/api/auth/session", { cookie: authCookie })).json()).user.id, user.id);
}));

test("les champs invalides et l'injection du rôle administrateur sont refusés", () => fixture(async (request, store) => {
  for (const data of [
    { ...valid, password: "court" }, { ...valid, email: "invalide" },
    { ...valid, username: "<script>" }, { ...valid, role: "admin" },
    { ...valid, password: "x".repeat(129) },
  ]) assert.equal((await request("/api/auth/register", { data })).status, 400);
  assert.equal(store.users.size, 0);
}));

test("les doublons d'e-mail et de nom d'utilisateur sont refusés sans créer de session", () => fixture(async (request, store) => {
  assert.equal((await request("/api/auth/register", { data: valid })).status, 201);
  for (const data of [{ ...valid, username: "other" }, { ...valid, email: "other@example.test", username: valid.username.toLowerCase() }]) {
    const duplicate = await request("/api/auth/register", { data });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.headers.get("set-cookie"), null);
    assert.doesNotMatch(JSON.stringify(await duplicate.json()), /duplicate details/);
  }
  assert.equal(store.users.size, 1);
  assert.equal(store.sessions.size, 1);
}));

test("connexion, rotation de session, déconnexion et refus d'un cookie révoqué", () => fixture(async (request, store) => {
  const signup = await request("/api/auth/register", { data: valid });
  const oldCookie = cookie(signup);
  const login = await request("/api/auth/login", { data: { email: "MEMBER@example.test", password: valid.password }, cookie: oldCookie });
  assert.equal(login.status, 200);
  const currentCookie = cookie(login);
  assert.notEqual(currentCookie, oldCookie);
  assert.equal((await request("/api/member/dashboard", { cookie: oldCookie })).status, 401);
  assert.equal((await request("/api/member/dashboard", { cookie: currentCookie })).status, 200);
  assert.equal((await request("/api/auth/logout", { method: "POST", cookie: currentCookie })).status, 204);
  assert.equal((await request("/api/member/dashboard", { cookie: currentCookie })).status, 401);
  assert.equal(store.sessions.size, 0);
  assert.deepEqual(await (await request("/api/auth/session", { cookie: currentCookie })).json(), { user: null });
}));

test("une mauvaise connexion donne la même erreur pour un compte absent ou un mauvais mot de passe", () => fixture(async (request) => {
  await request("/api/auth/register", { data: valid });
  const wrong = await request("/api/auth/login", { data: { email: valid.email, password: "mauvais" } });
  const absent = await request("/api/auth/login", { data: { email: "absent@example.test", password: valid.password } });
  assert.equal(wrong.status, 401);
  assert.equal(absent.status, 401);
  assert.equal(wrong.headers.get("set-cookie"), null);
  assert.deepEqual(await wrong.json(), await absent.json());
}));

test("les requêtes intersites et sans en-tête d'action sont refusées avant toute écriture", () => fixture(async (request, store) => {
  for (const headers of [
    { Origin: "https://attacker.example" }, { Origin: "null" },
    { Origin: "" }, { "X-Maestro-Action": "" },
  ]) {
    assert.equal((await request("/api/auth/register", { data: valid, headers })).status, 403);
    assert.equal((await request("/api/auth/login", { data: valid, headers })).status, 403);
    assert.equal((await request("/api/auth/logout", { method: "POST", headers })).status, 403);
  }
  assert.equal(store.attempts.size, 0);
}));

test("un cookie malformé ne déclenche aucune lecture de session", () => fixture(async (request, store) => {
  assert.deepEqual(await (await request("/api/auth/session", { cookie: "__Host-maestro_session=bad" })).json(), { user: null });
  assert.equal(store.sessionReads, 0);
}));

test("le service refuse explicitement une base indisponible sans divulguer ses erreurs", () => fixture(async (request, store) => {
  store.unavailable = true;
  const response = await request("/api/auth/register", { data: valid });
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.code, "AUTH_STORAGE_UNAVAILABLE");
  assert.doesNotMatch(JSON.stringify(body), /database password|ER_ACCESS_DENIED_ERROR/);
  assert.equal(response.headers.get("set-cookie"), null);
}));

test("les tentatives de connexion sont limitées avant tout hachage supplémentaire", () => fixture(async (request) => {
  for (let i = 0; i < 10; i++) {
    assert.equal((await request("/api/auth/login", { data: { email: "missing@example.test", password: "wrong" } })).status, 401);
  }
  const limited = await request("/api/auth/login", { data: { email: "missing@example.test", password: "wrong" } });
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "600");
}));

test("MariaDB réel : SQL, inscription, unicité, sessions persistantes, limites et révocation", {
  skip: process.env.MAESTRO_SQL_TESTS !== "1",
}, async () => {
  // CI-only database. Never execute DDL/test writes against a user's database.
  assert.equal(process.env.CYBRANCEE_DB_NAME, "maestro_auth_test");
  assert.equal(process.env.CYBRANCEE_DB_HOST, "127.0.0.1");
  const db = accountPool();
  try {
    const ddl = (await readFile("scripts/sql/001-member-accounts.sql", "utf8")).replace(/^--.*$/gm, "");
    for (const statement of ddl.split(";").map(s => s.trim()).filter(Boolean)) await db.query(statement);
    await withServer(accountStore, async request => {
      const signup = await request("/api/auth/register", { data: valid });
      assert.equal(signup.status, 201, await signup.clone().text());
      const sessionCookie = cookie(signup);
      const user = (await signup.json()).user;
      const duplicate = await request("/api/auth/register", { data: valid });
      assert.equal(duplicate.status, 409);
      const dashboard = await request("/api/member/dashboard", { cookie: sessionCookie });
      assert.equal(dashboard.status, 200);
      assert.equal((await dashboard.json()).user.id, user.id);
      const login = await request("/api/auth/login", { data: { email: valid.email, password: valid.password }, cookie: sessionCookie });
      assert.equal(login.status, 200);
      const nextCookie = cookie(login);
      assert.equal((await request("/api/member/dashboard", { cookie: sessionCookie })).status, 401);
      assert.equal((await request("/api/auth/logout", { method: "POST", cookie: nextCookie })).status, 204);
      assert.equal((await request("/api/member/dashboard", { cookie: nextCookie })).status, 401);
      const limitKey = digest("sql-test-limit");
      assert.equal(await accountStore.consumeLimit(limitKey, 1, 600), true);
      assert.equal(await accountStore.consumeLimit(limitKey, 1, 600), false);
      await db.execute("UPDATE maestro_auth_limits SET expires_at = '2000-01-01' WHERE bucket_key = ?", [limitKey]);
      assert.equal(await accountStore.consumeLimit(limitKey, 1, 600), true);
      const [rows] = await db.query<import("mysql2/promise").RowDataPacket[]>("SELECT email_verified, role, password_hash FROM maestro_users");
      assert.equal(rows[0].email_verified, 0);
      assert.equal(rows[0].role, "member");
      assert.match(rows[0].password_hash, /^scrypt-v1\$/);
    });
  } finally { await db.end(); }
});
