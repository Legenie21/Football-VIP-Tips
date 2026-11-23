"use strict";
// Retained only for explicit offline recovery, not a Plesk deployment action.
const path = require("node:path");
const { prepareRelease } = require("./delivery.cjs");
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== "--file") {
  process.stderr.write("Aucune action d’installation Plesk n’est nécessaire. Redémarrez simplement app.js après la réussite du build GitHub.\n");
  process.exitCode = 1;
} else {
  prepareRelease({ root: path.resolve(__dirname, "../.."), file: path.resolve(args[1]) })
    .then(() => process.stdout.write("Paquet hors ligne vérifié et préparé.\n"))
    .catch(error => {
      process.stderr.write(`${error.publicMessage || "Préparation hors ligne impossible."}\n`);
      process.exitCode = 1;
    });
}
