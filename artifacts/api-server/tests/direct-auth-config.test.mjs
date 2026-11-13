import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DirectAuthConfigurationError,
  directAuthPolicy,
  loadDirectAuthInfrastructureConfig,
} from "../src/config/direct-auth.ts";

// Données de test fictives uniquement, sans lecture des secrets de l'environnement.
const valid = () => ({
  CYBRANCEE_DB_CLIENT: "mysql",
  CYBRANCEE_DB_HOST: "database.example.test",
  CYBRANCEE_DB_NAME: "football",
  CYBRANCEE_DB_USER: "football_app",
  CYBRANCEE_DB_PASSWORD: "fake-database-password",
  SMTP_HOST: "mail.example.test",
  SMTP_USER: "mail-user",
  SMTP_PASSWORD: "fake-mail-password",
  SMTP_FROM: "no-reply@example.test",
  AUTH_PUBLIC_ORIGIN: "https://football.example.test",
  SESSION_SECRET: "s".repeat(48),
  AUTH_OTP_SECRET: "o".repeat(48),
});

test("une configuration vide est refusée sans accéder au réseau", () => {
  assert.throws(() => loadDirectAuthInfrastructureConfig({}), DirectAuthConfigurationError);
});
test("MySQL utilise le port 3306 et TLS vérifié", () => {
  const config = loadDirectAuthInfrastructureConfig(valid());
  assert.equal(config.database.port, 3306);
  assert.deepEqual(config.database.tls, { rejectUnauthorized: true });
  assert.equal(config.smtp.port, 587);
  assert.equal(config.smtp.security, "starttls");
});
test("PostgreSQL utilise le port 5432", () => {
  const config = loadDirectAuthInfrastructureConfig({ ...valid(), CYBRANCEE_DB_CLIENT: "postgres" });
  assert.equal(config.database.port, 5432);
});
test("le SMTP TLS implicite utilise le port 465", () => {
  assert.equal(loadDirectAuthInfrastructureConfig({ ...valid(), SMTP_SECURITY: "tls" }).smtp.port, 465);
});
test("les ports invalides, moteurs inconnus et TLS ambigu sont refusés", () => {
  for (const [key, value] of [
    ["CYBRANCEE_DB_CLIENT", "sqlite"], ["CYBRANCEE_DB_PORT", "70000"],
    ["SMTP_PORT", "NaN"], ["CYBRANCEE_DB_POOL_SIZE", "0"],
    ["CYBRANCEE_DB_TLS", "yes"], ["SMTP_SECURITY", "none"],
  ]) {
    assert.throws(() => loadDirectAuthInfrastructureConfig({ ...valid(), [key]: value }),
      DirectAuthConfigurationError);
  }
});
test("les erreurs ne contiennent pas les mots de passe", () => {
  const env = { ...valid(), SMTP_HOST: "" };
  assert.throws(() => loadDirectAuthInfrastructureConfig(env), (error) => {
    assert.ok(error instanceof DirectAuthConfigurationError);
    assert.ok(!error.message.includes(env.CYBRANCEE_DB_PASSWORD));
    assert.ok(!error.message.includes(env.SMTP_PASSWORD));
    return true;
  });
});
test("les mots de passe sont conservés sans modification", () => {
  const config = loadDirectAuthInfrastructureConfig({ ...valid(), CYBRANCEE_DB_PASSWORD: " secret " });
  assert.equal(config.database.password, " secret ");
});
test("l'origine doit être HTTPS, sans chemin ni identifiants", () => {
  for (const origin of ["http://example.test", "https://example.test/app", "https://u:p@example.test"]) {
    assert.throws(() => loadDirectAuthInfrastructureConfig({ ...valid(), AUTH_PUBLIC_ORIGIN: origin }),
      DirectAuthConfigurationError);
  }
});
test("les secrets faibles ou réutilisés sont refusés", () => {
  assert.throws(() => loadDirectAuthInfrastructureConfig({ ...valid(), SESSION_SECRET: "short" }),
    DirectAuthConfigurationError);
  const env = valid();
  assert.throws(() => loadDirectAuthInfrastructureConfig({ ...env, AUTH_OTP_SECRET: env.SESSION_SECRET }),
    DirectAuthConfigurationError);
});
test("la politique prévoit l'OTP e-mail à l'inscription et à la récupération uniquement", () => {
  assert.equal(directAuthPolicy.verifyEmailBeforeActivation, true);
  assert.equal(directAuthPolicy.registrationOtpChannel, "email");
  assert.equal(directAuthPolicy.passwordResetOtpChannel, "email");
  assert.equal(directAuthPolicy.loginOtpRequired, false);
  assert.equal(directAuthPolicy.smsRequired, false);
  assert.deepEqual(directAuthPolicy.loginIdentifiers, ["email", "phoneE164"]);
});
