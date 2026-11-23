"use strict";
// Node.js built-ins only. This script downloads; it NEVER compiles or runs npm.
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { assetName, sourceFingerprint, unpack } = require("./shared.cjs");
const root = path.resolve(__dirname, "../..");
const repository = "Legenie21/Football-VIP-Tips";

async function download(url, maxBytes, token) {
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}`, Accept: "application/octet-stream" } : {},
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`Téléchargement GitHub impossible (HTTP ${response.status}). Attendez la fin du workflow Plesk.`);
  const chunks = [];
  let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.length;
    if (bytes > maxBytes) throw new Error("Livraison distante trop volumineuse.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
async function install() {
  if (Number(process.versions.node.split(".")[0]) < 22) throw new Error("Node.js 22 ou supérieur requis.");
  const args = process.argv.slice(2);
  let data, checksum;
  if (args.length === 2 && args[0] === "--file") {
    const filename = path.resolve(args[1]);
    data = await fs.readFile(filename);
    checksum = await fs.readFile(`${filename}.sha256`, "utf8");
  } else if (args.length === 0) {
    // The workflow replaces this tag only after all build/smoke checks pass.
    const token = process.env.PLESK_GITHUB_TOKEN;
    const response = await fetch(`https://api.github.com/repos/${repository}/releases/tags/plesk-ready`, {
      headers: {
        Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`Livraison GitHub absente ou inaccessible (HTTP ${response.status}). Vérifiez le workflow Plesk.`);
    const release = await response.json();
    async function asset(name, maxBytes) {
      const selected = release.assets?.find(item => item.name === name);
      if (!selected || selected.size > maxBytes) throw new Error("Livraison incomplète ; attendez la fin du workflow Plesk.");
      const url = token ? selected.url : selected.browser_download_url;
      if (!url?.startsWith(token ? "https://api.github.com/" : "https://github.com/")) {
        throw new Error("Adresse de livraison inattendue.");
      }
      return download(url, maxBytes, token);
    }
    data = await asset(assetName, 25 * 1024 * 1024);
    checksum = (await asset(`${assetName}.sha256`, 1024)).toString("utf8");
  } else {
    throw new Error("Usage : node scripts/plesk/install.cjs [--file chemin-livraison]");
  }
  const digest = checksum.trim().split(/\s+/)[0];
  const archive = unpack(data, digest);
  if (archive.sourceFingerprint !== await sourceFingerprint(root)) {
    throw new Error("Les sources déployées ne correspondent pas au build. Attendez le workflow GitHub, récupérez la même version dans Plesk puis relancez Deploy Now. La livraison précédente est conservée.");
  }
  const releases = path.join(root, ".plesk-releases");
  await fs.mkdir(releases, { recursive: true });
  const staging = await fs.mkdtemp(path.join(releases, "staging-"));
  let pointerTemp;
  try {
    for (const file of archive.files) {
      const filename = path.join(staging, file.path);
      await fs.mkdir(path.dirname(filename), { recursive: true });
      await fs.writeFile(filename, Buffer.from(file.content, "base64"), { flag: "wx", mode: 0o644 });
    }
    const final = path.join(releases, digest);
    try { await fs.rename(staging, final); }
    catch (error) {
      if (!["EEXIST", "ENOTEMPTY"].includes(error.code)) throw error;
      // Do not silently trust a previously installed but modified directory.
      for (const file of archive.files) {
        const installed = await fs.readFile(path.join(final, file.path));
        if (crypto.createHash("sha256").update(installed).digest("hex") !== file.sha256) {
          throw new Error("Une livraison existante a été modifiée. Intervention nécessaire.");
        }
      }
    }
    pointerTemp = path.join(root, `.plesk-pointer-${crypto.randomUUID()}`);
    await fs.writeFile(pointerTemp, JSON.stringify({ release: digest, revision: archive.revision }) + "\n", { flag: "wx" });
    await fs.rename(pointerTemp, path.join(root, "plesk-current.json"));
    console.info("Livraison précompilée installée. Aucun build ni installation npm exécuté. Vous pouvez redémarrer Node.js dans Plesk.");
  } finally {
    await fs.rm(staging, { recursive: true, force: true });
    if (pointerTemp) await fs.rm(pointerTemp, { force: true });
  }
}
install().catch(error => {
  // Never print URLs, token values, environment objects or stacks.
  console.error(`Déploiement interrompu : ${error.message}`);
  process.exitCode = 1;
});
