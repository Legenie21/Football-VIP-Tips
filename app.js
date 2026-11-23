"use strict";

// Plesk starts this file. Only Node built-ins are needed before the bundle loads.
// No shell, child process, npm installation or compilation runs on this host.
const { prepareRelease } = require("./scripts/plesk/delivery.cjs");

process.env.NODE_ENV = "production";
prepareRelease({ root: __dirname })
  .then(filename => require(filename))
  .catch(error => {
    // The bundled logger is not available if bootstrapping failed.
    // Never print environment objects, network errors, tokens or stacks.
    const message = error.publicMessage ||
      "Démarrage impossible. Vérifiez les droits d’accès du dossier de l’application et les journaux Plesk.";
    process.stderr.write(`[Maestro Plesk] ${message}\n`);
    process.exitCode = 1;
  });
