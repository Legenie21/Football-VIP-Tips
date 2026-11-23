import {
  DirectAuthConfigurationError,
  loadDirectAuthInfrastructureConfig,
} from "../src/config/direct-auth.ts";

// N'affiche jamais l'objet de configuration : il contient des secrets.
try {
  loadDirectAuthInfrastructureConfig(process.env);
  process.stdout.write(
    "Paramètres valides. Aucune connexion à la base ou au SMTP n'a été tentée.\n" +
    "Ce contrôle historique concerne la préparation SMTP/récupération. Pour les comptes membres, consulter docs/member-accounts-plesk.md.\n",
  );
} catch (error) {
  if (!(error instanceof DirectAuthConfigurationError)) throw error;
  process.stderr.write(
    "Configuration en attente. Paramètres manquants ou invalides :\n" +
    error.issues.map((key) => `- ${key}`).join("\n") + "\n",
  );
  process.exitCode = 1;
}
