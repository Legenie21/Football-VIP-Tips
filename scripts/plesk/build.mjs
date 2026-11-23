import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import { gzipSync } from "node:zlib";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);
const { assetName, sha256, walk, sourceFingerprint } = require("./shared.cjs");
const apiRequire = createRequire(path.join(root, "artifacts/api-server/package.json"));
const { build } = apiRequire("esbuild");
const output = path.join(root, "generated-artifacts/plesk");
await fs.mkdir(output, { recursive: true });
const revision = process.env.GITHUB_SHA || execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error("Révision Git invalide.");

// No server secrets or VITE_* values are inherited by the public build.
const env = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith("VITE_")),
);
// Vite still reads .env files; forbid them instead of risking a secret-bearing build.
for (const directory of [root, path.join(root, "artifacts/pronostics-foot")]) {
  if ((await fs.readdir(directory)).some(name => /^\.env(?:\.|$)/.test(name) && !name.endsWith(".example"))) {
    throw new Error("Retirez les fichiers .env locaux avant le build Plesk ; utilisez les variables du serveur.");
  }
}
execFileSync("pnpm", ["--filter", "@workspace/pronostics-foot", "run", "build"], {
  cwd: root, stdio: "inherit", env: { ...env, PORT: "3000", BASE_PATH: "/", NODE_ENV: "production" },
});
const result = await build({
  entryPoints: [path.join(root, "artifacts/api-server/src/plesk.ts")],
  outfile: path.join(output, "server.cjs"),
  platform: "node", target: "node22", bundle: true, format: "cjs",
  minify: true, sourcemap: false, metafile: true,
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [{
    name: "production-no-terminal-colors",
    // debug optionally loads supports-color in a try/catch. Production logs
    // are JSON; disable that optional terminal feature instead of requiring npm.
    setup(plugin) {
      // mysql2 optionally loads cardinal for SQL debug highlighting. It is not
      // needed in production and must not become an external npm dependency.
      plugin.onResolve({ filter: /^cardinal$/ }, () => ({
        path: "cardinal", namespace: "production-no-sql-colors",
      }));
      plugin.onLoad({ filter: /.*/, namespace: "production-no-sql-colors" }, () => ({
        contents: "module.exports = { highlight: function (source) { return source; } };", loader: "js",
      }));
      plugin.onResolve({ filter: /^supports-color$/ }, () => ({
        path: "supports-color", namespace: "production-no-color",
      }));
      plugin.onLoad({ filter: /.*/, namespace: "production-no-color" }, () => ({
        contents: "module.exports = false;", loader: "js",
      }));
    },
  }],
});
// Reject undeclared runtime dependencies: Plesk must not need node_modules.
const { builtinModules } = require("node:module");
const builtins = new Set(builtinModules.flatMap(name => [name, `node:${name}`]));
for (const entry of Object.values(result.metafile.outputs)) {
  for (const imported of entry.imports) {
    if (imported.external && !builtins.has(imported.path)) {
      throw new Error(`Dépendance non embarquée : ${imported.path}`);
    }
  }
}
const publicSource = path.join(root, "artifacts/pronostics-foot/dist/public");
const files = [{ path: "server.cjs", bytes: await fs.readFile(path.join(output, "server.cjs")) }];
for (const relative of await walk(publicSource, ".")) {
  const name = relative.slice(2);
  if (name.endsWith(".map") || /(^|\/)\.env/.test(name)) throw new Error("Fichier public interdit.");
  files.push({ path: `public/${name}`, bytes: await fs.readFile(path.join(publicSource, name)) });
}
const archive = {
  format: 1, revision, sourceFingerprint: await sourceFingerprint(root),
  files: files.map(file => ({ path: file.path, sha256: sha256(file.bytes), content: file.bytes.toString("base64") })),
};
const compressed = gzipSync(JSON.stringify(archive), { level: 9 });
await fs.writeFile(path.join(output, assetName), compressed);
await fs.writeFile(path.join(output, `${assetName}.sha256`), `${sha256(compressed)}  ${assetName}\n`);
console.info(`Livraison Plesk créée (${files.length} fichiers, ${compressed.length} octets).`);
