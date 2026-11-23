"use strict";

// Plesk/Passenger starts this file. No compilation or npm installation here.
const fs = require("node:fs");
const path = require("node:path");

process.env.NODE_ENV = "production";
const pointer = path.join(__dirname, "plesk-current.json");
if (!fs.existsSync(pointer)) {
  throw new Error(
    "Livraison Plesk absente. Exécutez l'action de déploiement scripts/plesk/install.cjs avant de redémarrer.",
  );
}
const { release } = JSON.parse(fs.readFileSync(pointer, "utf8"));
if (!/^[a-f0-9]{64}$/.test(release)) {
  throw new Error("Référence de livraison Plesk invalide.");
}
require(path.join(__dirname, ".plesk-releases", release, "server.cjs"));
