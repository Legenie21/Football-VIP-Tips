import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const outfile = path.join(root, "generated-artifacts/tests/accounts.test.cjs");
await build({
  entryPoints: [path.join(root, "artifacts/api-server/tests/accounts.test.ts")],
  outfile, bundle: true, platform: "node", target: "node22", format: "cjs",
});
const result = spawnSync(process.execPath, ["--test", outfile], { cwd: root, stdio: "inherit" });
process.exitCode = result.status ?? 1;
