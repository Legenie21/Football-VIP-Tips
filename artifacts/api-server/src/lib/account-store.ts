import mysql, { type Pool, type RowDataPacket } from "mysql2/promise";
import type { AccountUser } from "@workspace/api-zod";

export type StoredAccount = AccountUser & { passwordHash: string };
export interface AccountStore {
  consumeLimit(key: string, maximum: number, seconds: number): Promise<boolean>;
  findByEmail(email: string): Promise<StoredAccount | null>;
  createAccount(user: StoredAccount, sessionHash: string, oldSessionHash?: string): Promise<void>;
  openSession(userId: string, sessionHash: string, oldSessionHash?: string): Promise<void>;
  readSession(sessionHash: string): Promise<AccountUser | null>;
  revokeSession(sessionHash: string): Promise<void>;
}
export const sessionLifetimeSeconds = 7 * 24 * 60 * 60;

let pool: Pool | undefined;

export class AccountConfigurationError extends Error {
  constructor() { super("Account database configuration is incomplete."); }
}

export function accountPool(): Pool {
  if (pool) return pool;
  const env = process.env;
  if (["CYBRANCEE_DB_HOST", "CYBRANCEE_DB_NAME", "CYBRANCEE_DB_USER", "CYBRANCEE_DB_PASSWORD"]
    .some(key => !env[key]?.trim())) throw new AccountConfigurationError();
  const host = env.CYBRANCEE_DB_HOST!.trim();
  const port = Number(env.CYBRANCEE_DB_PORT || "3306");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new AccountConfigurationError();
  if (env.CYBRANCEE_DB_CLIENT && env.CYBRANCEE_DB_CLIENT !== "mysql") throw new AccountConfigurationError();
  const local = ["localhost", "127.0.0.1", "::1"].includes(host.toLowerCase());
  const tls = env.CYBRANCEE_DB_TLS?.trim() || (local ? "false" : "true");
  // Unencrypted SQL traffic is allowed only on the loopback interface.
  if (!["true", "false"].includes(tls) || (tls === "false" && !local)) throw new AccountConfigurationError();
  pool = mysql.createPool({
    host, port, user: env.CYBRANCEE_DB_USER!.trim(),
    database: env.CYBRANCEE_DB_NAME!.trim(), password: env.CYBRANCEE_DB_PASSWORD,
    ...(tls === "true" ? { ssl: {
      rejectUnauthorized: true,
      ...(env.CYBRANCEE_DB_CA ? { ca: env.CYBRANCEE_DB_CA } : {}),
    } } : {}),
    connectionLimit: 5, waitForConnections: true, queueLimit: 20,
    connectTimeout: 5000, enableKeepAlive: true,
    charset: "utf8mb4", timezone: "Z", dateStrings: true,
    multipleStatements: false,
  });
  return pool;
}

type AccountRow = RowDataPacket & {
  id: string; email: string; username: string; role: "member" | "admin";
  email_verified: number; created_at: string; password_hash?: string;
};

function publicAccount(row: AccountRow): AccountUser {
  return {
    id: row.id, email: row.email, username: row.username, role: row.role,
    emailVerified: Boolean(row.email_verified),
    createdAt: new Date(`${row.created_at.replace(" ", "T")}Z`),
  };
}

// No DDL or automatic migration at runtime. Apply the supplied SQL in phpMyAdmin.
export const accountStore: AccountStore = {
  async consumeLimit(key, maximum, seconds) {
    const db = accountPool();
    await db.execute(
      `INSERT INTO maestro_auth_limits (bucket_key, attempts, expires_at)
       VALUES (?, 1, TIMESTAMPADD(SECOND, ?, UTC_TIMESTAMP(3)))
       ON DUPLICATE KEY UPDATE
         attempts = IF(expires_at <= UTC_TIMESTAMP(3), 1, attempts + 1),
         expires_at = IF(expires_at <= UTC_TIMESTAMP(3), TIMESTAMPADD(SECOND, ?, UTC_TIMESTAMP(3)), expires_at)`,
      [key, seconds, seconds],
    );
    const [rows] = await db.execute<RowDataPacket[]>(
      "SELECT attempts FROM maestro_auth_limits WHERE bucket_key = ?", [key],
    );
    // Bounded maintenance; no timers/background worker required in Passenger.
    await db.execute("DELETE FROM maestro_auth_limits WHERE expires_at < UTC_TIMESTAMP(3) LIMIT 100");
    return Number(rows[0]?.attempts ?? maximum + 1) <= maximum;
  },
  async findByEmail(email) {
    const [rows] = await accountPool().execute<AccountRow[]>(
      "SELECT id, email, username, role, email_verified, created_at, password_hash FROM maestro_users WHERE email = ? LIMIT 1",
      [email],
    );
    return rows[0] ? { ...publicAccount(rows[0]), passwordHash: rows[0].password_hash! } : null;
  },
  async createAccount(user, sessionHash, oldSessionHash) {
    const connection = await accountPool().getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(
        `INSERT INTO maestro_users (id, email, username, password_hash, role, email_verified, created_at)
         VALUES (?, ?, ?, ?, 'member', 0, UTC_TIMESTAMP(3))`,
        [user.id, user.email, user.username, user.passwordHash],
      );
      await connection.execute(
        `INSERT INTO maestro_sessions (token_hash, user_id, expires_at)
         VALUES (?, ?, TIMESTAMPADD(SECOND, ?, UTC_TIMESTAMP(3)))`,
        [sessionHash, user.id, sessionLifetimeSeconds],
      );
      if (oldSessionHash) await connection.execute("DELETE FROM maestro_sessions WHERE token_hash = ?", [oldSessionHash]);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally { connection.release(); }
  },
  async openSession(userId, sessionHash, oldSessionHash) {
    const connection = await accountPool().getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(
        "DELETE FROM maestro_sessions WHERE user_id = ? AND expires_at <= UTC_TIMESTAMP(3)", [userId],
      );
      await connection.execute(
        `INSERT INTO maestro_sessions (token_hash, user_id, expires_at)
         VALUES (?, ?, TIMESTAMPADD(SECOND, ?, UTC_TIMESTAMP(3)))`,
        [sessionHash, userId, sessionLifetimeSeconds],
      );
      if (oldSessionHash) await connection.execute("DELETE FROM maestro_sessions WHERE token_hash = ?", [oldSessionHash]);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally { connection.release(); }
  },
  async readSession(sessionHash) {
    const [rows] = await accountPool().execute<AccountRow[]>(
      `SELECT u.id, u.email, u.username, u.role, u.email_verified, u.created_at
       FROM maestro_sessions s JOIN maestro_users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP(3) LIMIT 1`,
      [sessionHash],
    );
    return rows[0] ? publicAccount(rows[0]) : null;
  },
  async revokeSession(sessionHash) {
    await accountPool().execute("DELETE FROM maestro_sessions WHERE token_hash = ?", [sessionHash]);
  },
};
