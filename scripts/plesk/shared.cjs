"use strict";
const { createHash } = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { gunzipSync } = require("node:zlib");

const assetName = "maestro-plesk.json.gz";
const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const sourceRoots = [
  "artifacts/api-server/src", "artifacts/pronostics-foot/src",
  "artifacts/pronostics-foot/public", "lib", "scripts/plesk",
];
const sourceFiles = [
  "app.js", "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml",
  "tsconfig.json", "tsconfig.base.json", ".npmrc",
  "artifacts/api-server/package.json", "artifacts/api-server/build.mjs",
  "artifacts/pronostics-foot/package.json",
  "artifacts/pronostics-foot/index.html", "artifacts/pronostics-foot/vite.config.ts",
  ".github/workflows/plesk.yml",
];
async function walk(root, relative) {
  const entries = await fs.readdir(path.join(root, relative), { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".") || ["node_modules", "dist"].includes(entry.name) ||
        entry.name.endsWith(".tsbuildinfo")) continue;
    const name = `${relative}/${entry.name}`;
    if (entry.isDirectory()) results.push(...await walk(root, name));
    else if (entry.isFile()) results.push(name);
    else throw new Error("Lien symbolique non accepté dans les sources de livraison.");
  }
  return results;
}
async function sourceFingerprint(root) {
  const files = [...sourceFiles];
  for (const directory of sourceRoots) files.push(...await walk(root, directory));
  const hash = createHash("sha256");
  for (const filename of [...new Set(files)].sort()) {
    hash.update(filename).update("\0").update(await fs.readFile(path.join(root, filename))).update("\0");
  }
  return hash.digest("hex");
}
function unpack(buffer, expectedDigest) {
  if (!/^[a-f0-9]{64}$/.test(expectedDigest) || sha256(buffer) !== expectedDigest) {
    throw new Error("La somme SHA-256 de la livraison ne correspond pas.");
  }
  const archive = JSON.parse(gunzipSync(buffer, { maxOutputLength: 80 * 1024 * 1024 }));
  if (archive.format !== 1 || !/^[a-f0-9]{64}$/.test(archive.sourceFingerprint) ||
      !/^[a-f0-9]{40}$/.test(archive.revision) || !Array.isArray(archive.files) ||
      archive.files.length < 2 || archive.files.length > 2000) {
    throw new Error("Format de livraison invalide.");
  }
  const names = new Set();
  let size = 0;
  for (const file of archive.files) {
    if (typeof file.path !== "string" ||
        !(file.path === "server.cjs" || file.path.startsWith("public/")) ||
        file.path.split("/").some(part => !part || part.startsWith(".")) ||
        /[\\:\x00-\x1f]/.test(file.path) || names.has(file.path) ||
        typeof file.content !== "string" || !/^[a-f0-9]{64}$/.test(file.sha256)) {
      throw new Error("Chemin ou contenu interdit dans la livraison.");
    }
    names.add(file.path);
    const bytes = Buffer.from(file.content, "base64");
    size += bytes.length;
    if (sha256(bytes) !== file.sha256 || size > 50 * 1024 * 1024) {
      throw new Error("Fichier de livraison altéré ou trop volumineux.");
    }
  }
  if (!names.has("server.cjs") || !names.has("public/index.html")) {
    throw new Error("Serveur ou page d'accueil manquant.");
  }
  return archive;
}
module.exports = { assetName, sha256, walk, sourceRoots, sourceFiles, sourceFingerprint, unpack };
