"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { assetName, sha256, sourceFingerprint, unpack } = require("./shared.cjs");
const repository = "Legenie21/Football-VIP-Tips";
const releaseUrl = `https://api.github.com/repos/${repository}/releases/tags/plesk-ready`;

class DeliveryError extends Error {
  constructor(message) {
    super(message);
    this.publicMessage = message;
  }
}
function checkArchive(bytes, digest) {
  try { return unpack(bytes, digest); }
  catch {
    throw new DeliveryError("Paquet précompilé invalide ou altéré. Aucune nouvelle version n’a été activée.");
  }
}
async function checkFiles(directory, archive) {
  for (const file of archive.files) {
    if (sha256(await fs.readFile(path.join(directory, file.path))) !== file.sha256) {
      throw new DeliveryError("Le cache de la livraison a été modifié. Aucune version altérée n’a été démarrée.");
    }
  }
}
async function readCache(root, fingerprint) {
  let pointer;
  try {
    pointer = JSON.parse(await fs.readFile(path.join(root, "plesk-current.json"), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError) return null;
    throw error;
  }
  if (!/^[a-f0-9]{64}$/.test(pointer.release || "") ||
      pointer.sourceFingerprint !== fingerprint) return null;
  const directory = path.join(root, ".plesk-releases", pointer.release);
  let bytes;
  try { bytes = await fs.readFile(path.join(directory, ".bundle.json.gz")); }
  catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  const archive = checkArchive(bytes, pointer.release);
  if (archive.sourceFingerprint !== fingerprint) return null;
  await checkFiles(directory, archive);
  return path.join(directory, "server.cjs");
}
async function fetchBytes(fetchImpl, url, maxBytes, { token, apiJson = false } = {}) {
  let response;
  try {
    response = await fetchImpl(url, {
      headers: {
        Accept: apiJson ? "application/vnd.github+json" : "application/octet-stream",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      throw new DeliveryError(
        `Paquet GitHub inaccessible (HTTP ${response.status}). Vérifiez la réussite de Build Plesk sur main et l’accès au dépôt.`,
      );
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > maxBytes) throw new DeliveryError("Paquet GitHub trop volumineux.");
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  } catch (error) {
    if (error instanceof DeliveryError) throw error;
    throw new DeliveryError("Accès HTTPS à GitHub impossible depuis Node.js. Vérifiez les connexions sortantes, les certificats TLS et les journaux de l’hébergeur.");
  }
}
async function fetchRelease(fetchImpl, token) {
  let release;
  try {
    release = JSON.parse((await fetchBytes(fetchImpl, releaseUrl, 1024 * 1024, {
      token, apiJson: true,
    })).toString("utf8"));
  } catch (error) {
    if (error instanceof DeliveryError) throw error;
    throw new DeliveryError("Réponse de livraison GitHub invalide.");
  }
  async function asset(name, maximum) {
    const selected = release.assets?.find(item => item.name === name);
    if (!selected || selected.size > maximum) {
      throw new DeliveryError("Paquet GitHub incomplet. Attendez la réussite de Build Plesk avant de redémarrer.");
    }
    const url = token ? selected.url : selected.browser_download_url;
    if (typeof url !== "string" ||
        !url.startsWith(token ? "https://api.github.com/" : "https://github.com/")) {
      throw new DeliveryError("Adresse de livraison GitHub inattendue.");
    }
    return fetchBytes(fetchImpl, url, maximum, { token });
  }
  const bytes = await asset(assetName, 25 * 1024 * 1024);
  const digest = (await asset(`${assetName}.sha256`, 1024)).toString("utf8").trim().split(/\s+/)[0];
  return { bytes, digest };
}
async function saveRelease(root, bytes, digest, archive) {
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
    await fs.writeFile(path.join(staging, ".bundle.json.gz"), bytes, { flag: "wx", mode: 0o600 });
    const final = path.join(releases, digest);
    try { await fs.rename(staging, final); }
    catch (error) {
      if (!["EEXIST", "ENOTEMPTY"].includes(error.code)) throw error;
      await checkFiles(final, archive);
      if (sha256(await fs.readFile(path.join(final, ".bundle.json.gz"))) !== digest) {
        throw new DeliveryError("Cache de livraison incohérent ; aucune nouvelle version activée.");
      }
    }
    pointerTemp = path.join(root, `.plesk-pointer-${crypto.randomUUID()}`);
    await fs.writeFile(pointerTemp, JSON.stringify({
      release: digest, revision: archive.revision, sourceFingerprint: archive.sourceFingerprint,
    }) + "\n", { flag: "wx" });
    await fs.rename(pointerTemp, path.join(root, "plesk-current.json"));
    return path.join(final, "server.cjs");
  } finally {
    await fs.rm(staging, { recursive: true, force: true });
    if (pointerTemp) await fs.rm(pointerTemp, { force: true });
  }
}
async function prepareRelease({ root, fetchImpl = globalThis.fetch, token = process.env.PLESK_GITHUB_TOKEN, file }) {
  if (Number(process.versions.node.split(".")[0]) < 22) {
    throw new DeliveryError("Node.js 22 ou supérieur est requis ; Node.js 24 LTS est recommandé.");
  }
  const fingerprint = await sourceFingerprint(root);
  if (!file) {
    const cached = await readCache(root, fingerprint);
    if (cached) return cached;
  }
  let payload;
  if (file) {
    payload = {
      bytes: await fs.readFile(file),
      digest: (await fs.readFile(`${file}.sha256`, "utf8")).trim().split(/\s+/)[0],
    };
  } else {
    payload = await fetchRelease(fetchImpl, token);
  }
  const archive = checkArchive(payload.bytes, payload.digest);
  if (archive.sourceFingerprint !== fingerprint) {
    throw new DeliveryError("Les sources Plesk ne correspondent pas au paquet compilé. Attendez la réussite de Build Plesk sur main, récupérez les changements puis redémarrez. Aucune ancienne version incompatible n’a été activée.");
  }
  return saveRelease(root, payload.bytes, payload.digest, archive);
}
module.exports = { prepareRelease, DeliveryError };
