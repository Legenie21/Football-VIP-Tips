"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const net = require("node:net");
const { gzipSync } = require("node:zlib");
const { assetName, sha256, sourceRoots, sourceFiles, unpack } = require("./shared.cjs");
const root = path.resolve(__dirname, "../..");
const output = path.join(root, "generated-artifacts/plesk");

test("La livraison refuse les sommes invalides et les chemins dangereux", () => {
  const base = {
    format: 1, revision: "a".repeat(40), sourceFingerprint: "b".repeat(64),
    files: [
      { path: "server.cjs", content: "", sha256: sha256("") },
      { path: "public/index.html", content: "", sha256: sha256("") },
    ],
  };
  const archive = gzipSync(JSON.stringify(base));
  assert.equal(unpack(archive, sha256(archive)).files.length, 2);
  assert.throws(() => unpack(archive, "c".repeat(64)), /SHA-256/);
  for (const illegal of ["../secret", "public/../secret", "public/.env", "public\\index.html", "/etc/passwd"]) {
    const bad = gzipSync(JSON.stringify({
      ...base, files: [...base.files, { path: illegal, content: "", sha256: sha256("") }],
    }));
    assert.throws(() => unpack(bad, sha256(bad)), /interdit/);
  }
  const changed = gzipSync(JSON.stringify({
    ...base, files: [{ ...base.files[0], sha256: "0".repeat(64) }, base.files[1]],
  }));
  assert.throws(() => unpack(changed, sha256(changed)), /altéré/);
});

test("Le build démarre sans node_modules et conserve la livraison en cas d'erreur", { timeout: 30000 }, async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "maestro-plesk-test-"));
  let child;
  try {
    for (const name of [...sourceFiles, ...sourceRoots]) {
      await fs.mkdir(path.dirname(path.join(temporary, name)), { recursive: true });
      await fs.cp(path.join(root, name), path.join(temporary, name), {
        recursive: true,
        filter: filename => !filename.split(path.sep).some(part => ["node_modules", "dist"].includes(part)) &&
          !filename.endsWith(".tsbuildinfo"),
      });
    }
    const cleanEnv = { PATH: process.env.PATH, NODE_ENV: "production" };
    const installer = path.join(temporary, "scripts/plesk/install.cjs");
    const archivePath = path.join(output, assetName);
    const runInstall = filename => spawnSync(process.execPath, [installer, "--file", filename], {
      cwd: temporary, env: cleanEnv, encoding: "utf8", timeout: 10000,
    });
    const install = runInstall(archivePath);
    assert.equal(install.status, 0, install.stderr);
    const pointer = await fs.readFile(path.join(temporary, "plesk-current.json"), "utf8");
    assert.equal(runInstall(archivePath).status, 0, "La réinstallation doit être idempotente");

    const probe = net.createServer();
    await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve));
    const port = probe.address().port;
    await new Promise(resolve => probe.close(resolve));
    child = spawn(process.execPath, ["app.js"], {
      cwd: temporary, env: { ...cleanEnv, PORT: String(port), LOG_LEVEL: "error" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let errors = "";
    child.stderr.on("data", chunk => { errors += chunk.toString(); });
    child.stdout.on("data", chunk => { errors += chunk.toString(); });
    const base = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error(`Le serveur ne démarre pas : ${errors}`);
      try {
        if ((await fetch(`${base}/api/healthz`)).status === 200) { ready = true; break; }
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.ok(ready, "Le serveur doit être disponible sans installation");
    for (const route of ["/", "/vip", "/admin", "/dashboard", "/sign-in", "/sign-up", "/sign-in/continue"]) {
      const response = await fetch(base + route);
      assert.equal(response.status, 200, `${route}: ${errors}`);
      assert.match(response.headers.get("content-type"), /text\/html/);
      assert.equal(response.headers.get("cache-control"), "no-store");
    }
    assert.equal((await fetch(`${base}/api/predictions`)).status, 503);
    assert.deepEqual(await (await fetch(`${base}/api/auth/session`)).json(), { user: null });
    assert.equal((await fetch(`${base}/api/member/dashboard`)).status, 401);
    const home = await (await fetch(base)).text();
    const asset = home.match(/src="([^"]+\/assets\/[^"]+\.js)"/)?.[1] ||
      home.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
    assert.ok(asset, "Un fichier JavaScript compilé doit être présent");
    const javascript = await fetch(base + asset);
    assert.equal(javascript.status, 200);
    assert.match(javascript.headers.get("cache-control"), /immutable/);
    const script = await javascript.text();
    assert.doesNotMatch(script, /spock\.replit\.dev/);
    for (const route of ["/app.js", "/package.json", "/plesk-current.json", "/.env", "/assets/missing.js", "/unknown"]) {
      const response = await fetch(base + route);
      assert.equal(response.status, 404, route);
    }
    const bad = path.join(temporary, "broken.gz");
    await fs.writeFile(bad, "not a build");
    await fs.writeFile(`${bad}.sha256`, "0".repeat(64));
    assert.notEqual(runInstall(bad).status, 0);
    assert.equal(await fs.readFile(path.join(temporary, "plesk-current.json"), "utf8"), pointer);
    await fs.appendFile(path.join(temporary, "app.js"), "\n// sources changed\n");
    const mismatch = runInstall(archivePath);
    assert.notEqual(mismatch.status, 0);
    assert.match(mismatch.stderr, /ne correspondent pas/);
    assert.equal(await fs.readFile(path.join(temporary, "plesk-current.json"), "utf8"), pointer);
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      await new Promise(resolve => child.once("exit", resolve));
    }
    await fs.rm(temporary, { recursive: true, force: true });
  }
});

test("app.js récupère automatiquement le paquet puis redémarre sans réseau ni action Git", { timeout: 30000 }, async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "maestro-cold-start-"));
  let child;
  try {
    for (const name of [...sourceFiles, ...sourceRoots]) {
      await fs.mkdir(path.dirname(path.join(temporary, name)), { recursive: true });
      await fs.cp(path.join(root, name), path.join(temporary, name), {
        recursive: true,
        filter: filename => !filename.split(path.sep).some(part => ["node_modules", "dist"].includes(part)) &&
          !filename.endsWith(".tsbuildinfo"),
      });
    }
    await assert.rejects(fs.access(path.join(temporary, "plesk-current.json")));
    const archivePath = path.join(output, assetName);
    const preload = path.join(temporary, "test-network.cjs");
    const calls = path.join(temporary, "test-network-calls");
    // Substitute GitHub HTTP responses, not delivery code. No real release is
    // required before CI has built and published this source revision.
    await fs.writeFile(preload, `
      const fs = require("node:fs");
      const archivePath = ${JSON.stringify(archivePath)};
      const calls = ${JSON.stringify(calls)};
      globalThis.fetch = async url => {
        fs.appendFileSync(calls, "request\\n");
        if (url === "https://api.github.com/repos/Legenie21/Football-VIP-Tips/releases/tags/plesk-ready") {
          return new Response(JSON.stringify({assets: [
            {name: ${JSON.stringify(assetName)}, size: fs.statSync(archivePath).size, browser_download_url: "https://github.com/test/bundle"},
            {name: ${JSON.stringify(assetName + ".sha256")}, size: 100, browser_download_url: "https://github.com/test/checksum"}
          ]}));
        }
        if (url === "https://github.com/test/bundle") return new Response(fs.readFileSync(archivePath));
        if (url === "https://github.com/test/checksum") return new Response(fs.readFileSync(archivePath + ".sha256"));
        throw new Error("Unexpected network call");
      };
    `);
    const probe = net.createServer();
    await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve));
    const port = probe.address().port;
    await new Promise(resolve => probe.close(resolve));
    const env = {
      PATH: process.env.PATH, NODE_ENV: "production", LOG_LEVEL: "error",
      PORT: String(port), NODE_OPTIONS: `--require=${preload}`,
    };
    async function launch() {
      child = spawn(process.execPath, ["app.js"], {
        cwd: temporary, env, stdio: ["ignore", "pipe", "pipe"],
      });
      let errors = "";
      child.stdout.on("data", chunk => { errors += chunk.toString(); });
      child.stderr.on("data", chunk => { errors += chunk.toString(); });
      for (let attempt = 0; attempt < 100; attempt++) {
        if (child.exitCode !== null) throw new Error(`Échec du démarrage automatique : ${errors}`);
        try {
          const response = await fetch(`http://127.0.0.1:${port}/api/healthz`);
          if (response.status === 200) return;
        } catch {}
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      throw new Error(`Serveur indisponible : ${errors}`);
    }
    async function stop() {
      if (child && child.exitCode === null && child.signalCode === null) {
        const stopped = new Promise(resolve => child.once("exit", resolve));
        child.kill("SIGTERM");
        await stopped;
      }
    }
    await launch(); // No installer or pre-existing pointer/cache.
    const pointer = JSON.parse(await fs.readFile(path.join(temporary, "plesk-current.json"), "utf8"));
    assert.match(pointer.release, /^[a-f0-9]{64}$/);
    assert.match(pointer.sourceFingerprint, /^[a-f0-9]{64}$/);
    assert.equal((await fs.readFile(calls, "utf8")).trim().split("\n").length, 3);
    assert.equal((await fetch(`http://127.0.0.1:${port}/`)).status, 200);
    await stop();
    await fs.writeFile(preload, "globalThis.fetch = async () => { throw new Error('Network must not be used for a valid cache'); };");
    await launch();
    assert.equal((await fetch(`http://127.0.0.1:${port}/vip`)).status, 200);
    await stop();
    assert.equal((await fs.readFile(calls, "utf8")).trim().split("\n").length, 3);
    // A valid pointer must never allow a modified executable to run.
    await fs.appendFile(path.join(temporary, ".plesk-releases", pointer.release, "server.cjs"), "\n// tampered\n");
    const rejected = spawnSync(process.execPath, ["app.js"], {
      cwd: temporary, env, encoding: "utf8", timeout: 10000,
    });
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /cache.*modifié/i);
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      const stopped = new Promise(resolve => child.once("exit", resolve));
      child.kill("SIGTERM");
      await stopped;
    }
    await fs.rm(temporary, { recursive: true, force: true });
  }
});

test("Un échec HTTPS au premier démarrage est explicite et ne crée pas de version active", async () => {
  const { prepareRelease } = require("./delivery.cjs");
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "maestro-no-network-"));
  try {
    for (const name of [...sourceFiles, ...sourceRoots]) {
      await fs.mkdir(path.dirname(path.join(temporary, name)), { recursive: true });
      await fs.cp(path.join(root, name), path.join(temporary, name), {
        recursive: true,
        filter: filename => !filename.split(path.sep).some(part => ["node_modules", "dist"].includes(part)) &&
          !filename.endsWith(".tsbuildinfo"),
      });
    }
    await assert.rejects(
      prepareRelease({
        root: temporary, token: "test-credential-not-for-logs",
        fetchImpl: async () => { throw new Error("test-credential-not-for-logs"); },
      }),
      error => /Accès HTTPS/.test(error.publicMessage) && !error.message.includes("test-credential"),
    );
    await assert.rejects(fs.access(path.join(temporary, "plesk-current.json")));
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
});
