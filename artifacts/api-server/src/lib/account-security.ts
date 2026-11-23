import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const parameters = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const derive = (password: string, salt: string): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    scrypt(password, salt, 64, parameters, (error, key) => error ? reject(error) : resolve(key));
  });

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  return `scrypt-v1$${salt}$${(await derive(password, salt)).toString("hex")}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [version, salt, hex, extra] = encoded.split("$");
  if (version !== "scrypt-v1" || extra || !/^[a-f0-9]{32}$/.test(salt ?? "") ||
    !/^[a-f0-9]{128}$/.test(hex ?? "")) return false;
  const actual = await derive(password, salt);
  return timingSafeEqual(actual, Buffer.from(hex, "hex"));
}

// Opaque, independently random tokens: only their SHA-256 digest is stored.
export const newSessionToken = () => randomBytes(32).toString("hex");
export const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export const validSessionToken = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

// Constant work for nonexistent accounts, without a plaintext dummy password.
export const dummyPasswordHash = `scrypt-v1$${"0".repeat(32)}$${"0".repeat(128)}`;
