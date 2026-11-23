/**
 * Préparation uniquement : aucun accès réseau, aucune migration et aucun
 * changement du fournisseur de connexion. Les futurs parcours d'authentification
 * devront appeler ce validateur avant d'utiliser ces paramètres.
 */
type Environment = Record<string, string | undefined>;

export const directAuthPolicy = Object.freeze({
  registrationFields: ["email", "username", "password"],
  loginIdentifiers: ["email"],
  verifyEmailBeforeActivation: false,
  registrationOtpChannel: null,
  loginOtpRequired: false,
  passwordResetOtpChannel: "email",
  smsRequired: false,
  otpLength: 6,
  otpLifetimeSeconds: 600,
  otpMaxAttempts: 5,
  otpResendDelaySeconds: 60,
  sessionCookie: { httpOnly: true, secure: true, sameSite: "lax" },
} as const);

export interface DirectAuthInfrastructureConfig {
  database: {
    client: "mysql" | "postgres";
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    tls: false | { rejectUnauthorized: true; ca?: string };
    poolSize: number;
  };
  smtp: {
    host: string;
    port: number;
    security: "starttls" | "tls";
    user: string;
    password: string;
    from: string;
  };
  publicOrigin: string;
  sessionSecret: string;
  otpSecret: string;
}

export class DirectAuthConfigurationError extends Error {
  public readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    // Ne jamais inclure de valeurs de configuration dans les erreurs.
    super(`Configuration incomplète ou invalide : ${issues.join(", ")}`);
    this.name = "DirectAuthConfigurationError";
    this.issues = issues;
  }
}

export function loadDirectAuthInfrastructureConfig(
  env: Environment,
): DirectAuthInfrastructureConfig {
  const issues: string[] = [];
  const text = (key: string): string => {
    const value = env[key]?.trim() ?? "";
    if (!value) issues.push(key);
    return value;
  };
  // Préserver exactement les espaces et caractères des mots de passe.
  const secret = (key: string, minimumLength = 1): string => {
    const value = env[key] ?? "";
    if (value.trim().length < minimumLength) issues.push(key);
    return value;
  };
  const integer = (key: string, fallback: number, maximum: number): number => {
    const raw = env[key]?.trim();
    if (!raw) return fallback;
    const value = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < 1 || value > maximum) {
      issues.push(key);
    }
    return value;
  };

  const client = text("CYBRANCEE_DB_CLIENT");
  if (client && client !== "mysql" && client !== "postgres") {
    issues.push("CYBRANCEE_DB_CLIENT");
  }
  const tlsValue = env.CYBRANCEE_DB_TLS?.trim() || "true";
  if (tlsValue !== "true" && tlsValue !== "false") issues.push("CYBRANCEE_DB_TLS");
  const ca = env.CYBRANCEE_DB_CA?.trim();
  const security = env.SMTP_SECURITY?.trim() || "starttls";
  if (security !== "starttls" && security !== "tls") issues.push("SMTP_SECURITY");
  const from = text("SMTP_FROM");
  if (from && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(from)) issues.push("SMTP_FROM");
  const publicOrigin = text("AUTH_PUBLIC_ORIGIN");
  try {
    const url = new URL(publicOrigin);
    if (
      url.protocol !== "https:" || url.username || url.password ||
      url.pathname !== "/" || url.search || url.hash
    ) issues.push("AUTH_PUBLIC_ORIGIN");
  } catch {
    if (publicOrigin) issues.push("AUTH_PUBLIC_ORIGIN");
  }

  const config: DirectAuthInfrastructureConfig = {
    database: {
      client: client as "mysql" | "postgres",
      host: text("CYBRANCEE_DB_HOST"),
      port: integer("CYBRANCEE_DB_PORT", client === "postgres" ? 5432 : 3306, 65535),
      database: text("CYBRANCEE_DB_NAME"),
      user: text("CYBRANCEE_DB_USER"),
      password: secret("CYBRANCEE_DB_PASSWORD"),
      tls: tlsValue === "false" ? false : { rejectUnauthorized: true, ...(ca ? { ca } : {}) },
      poolSize: integer("CYBRANCEE_DB_POOL_SIZE", 5, 20),
    },
    smtp: {
      host: text("SMTP_HOST"),
      port: integer("SMTP_PORT", security === "tls" ? 465 : 587, 65535),
      security: security as "starttls" | "tls",
      user: text("SMTP_USER"),
      password: secret("SMTP_PASSWORD"),
      from,
    },
    publicOrigin,
    sessionSecret: secret("SESSION_SECRET", 32),
    otpSecret: secret("AUTH_OTP_SECRET", 32),
  };
  if (config.sessionSecret && config.sessionSecret === config.otpSecret) {
    issues.push("AUTH_OTP_SECRET (doit différer de SESSION_SECRET)");
  }
  if (issues.length) throw new DirectAuthConfigurationError([...new Set(issues)]);
  return config;
}
