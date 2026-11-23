import { Router, type IRouter, type Request, type Response } from "express";
import cookieParser from "cookie-parser";
import { randomUUID } from "node:crypto";
import {
  RegisterAccountBody, LoginAccountBody, RegisterAccountResponse, LoginAccountResponse,
  GetAccountSessionResponse, GetMemberDashboardResponse,
} from "@workspace/api-zod";
import { accountStore, sessionLifetimeSeconds, type AccountStore } from "../lib/account-store";
import {
  digest, dummyPasswordHash, hashPassword, newSessionToken, validSessionToken, verifyPassword,
} from "../lib/account-security";

const cookieName = "__Host-maestro_session";
const cookieOptions = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/" };

function tokenFrom(req: Request): string | undefined {
  const token: unknown = req.cookies?.[cookieName];
  return validSessionToken(token) ? token : undefined;
}

// A non-simple header prevents cross-site form submissions. Exact origin checks
// also protect login/signup (including when the browser has no session yet).
export function trustedAccountOrigin(req: Request): boolean {
  if (req.get("X-Maestro-Action") !== "1") return false;
  const origin = req.get("Origin");
  if (!origin || origin === "null") return false;
  const configured = process.env.AUTH_PUBLIC_ORIGIN?.trim();
  if (configured) {
    try {
      const parsed = new URL(configured);
      return parsed.protocol === "https:" && !parsed.username && !parsed.password &&
        parsed.pathname === "/" && !parsed.search && !parsed.hash && origin === parsed.origin;
    } catch { return false; }
  }
  // This is the owner's actual production domain, not a caller-controlled Host.
  if (process.env.NODE_ENV === "production") return origin === "https://teamprono.com";
  try {
    const parsed = new URL(origin);
    return ["http:", "https:"].includes(parsed.protocol) && parsed.host === req.get("host");
  } catch { return false; }
}

export function createAccountRouter(store: AccountStore = accountStore): IRouter {
  const router: IRouter = Router();
  router.use(cookieParser());
  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("X-Content-Type-Options", "nosniff");
    next();
  });
  router.use((req, res, next) => {
    if (!req.path.startsWith("/auth/") || req.method !== "POST" || trustedAccountOrigin(req)) { next(); return; }
    res.status(403).json({ error: "Cette demande n’est pas autorisée. Rechargez la page puis réessayez." });
  });

  async function limited(req: Request, res: Response, action: string, maximum: number, seconds: number) {
    const allowed = await store.consumeLimit(digest(`${action}:ip:${req.ip ?? "unknown"}`), maximum, seconds);
    if (!allowed) {
      res.setHeader("Retry-After", String(seconds));
      res.status(429).json({ error: "Trop de tentatives. Veuillez patienter avant de réessayer." });
    }
    return !allowed;
  }

  router.post("/auth/register", async (req, res): Promise<void> => {
    const input = typeof req.body === "object" && req.body !== null ? {
      ...req.body,
      email: typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : req.body.email,
      username: typeof req.body.username === "string" ? req.body.username.trim() : req.body.username,
    } : req.body;
    const parsed = RegisterAccountBody.strict().safeParse(input);
    if (!parsed.success) {
      res.status(400).json({ error: "Indiquez un e-mail valide, un nom d’utilisateur de 3 à 30 caractères (lettres, chiffres, . _ -) et un mot de passe de 12 à 128 caractères." });
      return;
    }
    if (!/^[\x21-\x7e]+$/.test(parsed.data.email)) {
      res.status(400).json({ error: "Utilisez une adresse e-mail sans caractères accentués." }); return;
    }
    if (await limited(req, res, "signup", 10, 3600)) return;
    const token = newSessionToken();
    const old = tokenFrom(req);
    const user = {
      id: randomUUID(), email: parsed.data.email, username: parsed.data.username,
      role: "member" as const, emailVerified: false, createdAt: new Date(),
    };
    try {
      await store.createAccount(
        { ...user, passwordHash: await hashPassword(parsed.data.password) },
        digest(token), old ? digest(old) : undefined,
      );
    } catch (error) {
      if ((error as { code?: string }).code === "ER_DUP_ENTRY") {
        res.status(409).json({ error: "Cette adresse e-mail ou ce nom d’utilisateur est déjà utilisé." });
        return;
      }
      throw error;
    }
    res.cookie(cookieName, token, { ...cookieOptions, maxAge: sessionLifetimeSeconds * 1000 });
    res.status(201).json(RegisterAccountResponse.parse({ user }));
  });

  router.post("/auth/login", async (req, res): Promise<void> => {
    const parsed = LoginAccountBody.strict().safeParse(
      typeof req.body === "object" && req.body !== null
        ? { ...req.body, email: typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : req.body.email }
        : req.body,
    );
    if (!parsed.success) {
      res.status(400).json({ error: "Indiquez votre adresse e-mail et votre mot de passe." }); return;
    }
    if (await limited(req, res, "login", 30, 600)) return;
    if (!await store.consumeLimit(digest(`login:email:${parsed.data.email}`), 10, 600)) {
      res.setHeader("Retry-After", "600");
      res.status(429).json({ error: "Trop de tentatives. Veuillez patienter avant de réessayer." }); return;
    }
    const account = await store.findByEmail(parsed.data.email);
    const matches = await verifyPassword(parsed.data.password, account?.passwordHash ?? dummyPasswordHash);
    if (!account || !matches) {
      res.status(401).json({ error: "E-mail ou mot de passe incorrect." }); return;
    }
    const token = newSessionToken();
    const old = tokenFrom(req);
    await store.openSession(account.id, digest(token), old ? digest(old) : undefined);
    const { passwordHash: _passwordHash, ...user } = account;
    res.cookie(cookieName, token, { ...cookieOptions, maxAge: sessionLifetimeSeconds * 1000 });
    res.json(LoginAccountResponse.parse({ user }));
  });

  router.get("/auth/session", async (req, res): Promise<void> => {
    const token = tokenFrom(req);
    const user = token ? await store.readSession(digest(token)) : null;
    if (token && !user) res.clearCookie(cookieName, cookieOptions);
    res.json(GetAccountSessionResponse.parse({ user }));
  });

  router.post("/auth/logout", async (req, res): Promise<void> => {
    const token = tokenFrom(req);
    if (token) await store.revokeSession(digest(token));
    res.clearCookie(cookieName, cookieOptions);
    res.status(204).end();
  });

  router.get("/member/dashboard", async (req, res): Promise<void> => {
    const token = tokenFrom(req);
    const user = token ? await store.readSession(digest(token)) : null;
    if (!user) {
      res.clearCookie(cookieName, cookieOptions);
      res.status(401).json({ error: "Connectez-vous pour accéder à votre tableau de bord." }); return;
    }
    res.json(GetMemberDashboardResponse.parse({ user }));
  });

  router.use((error: unknown, req: Request, res: Response, _next: (error?: unknown) => void) => {
    // Never log SQL statements, parameters, passwords, cookies or raw DB errors.
    const code = (error as { code?: string })?.code;
    const safe = ["ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "ER_ACCESS_DENIED_ERROR", "ER_BAD_DB_ERROR", "ER_NO_SUCH_TABLE"];
    req.log?.warn({ code: code && safe.includes(code) ? code : "AUTH_STORAGE_ERROR" }, "Stockage des comptes indisponible");
    res.status(503).json({
      error: "Le service des comptes est temporairement indisponible. Vérifiez la configuration de la base et la création des tables dans Plesk.",
      code: "AUTH_STORAGE_UNAVAILABLE",
    });
  });
  return router;
}

export default createAccountRouter();
