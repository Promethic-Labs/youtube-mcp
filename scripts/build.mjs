// Bundles the server into one file and assembles dist/ for `mcpb pack`.
// Keeps manifest.json version in sync with package.json.
import { build } from "esbuild";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
manifest.version = pkg.version;
writeFileSync("manifest.json", JSON.stringify(manifest, null, 2) + "\n");

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist/server", { recursive: true });

await build({
  entryPoints: ["src/index.js"],
  outfile: "dist/server/index.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node18",
  define: { __VERSION__: JSON.stringify(pkg.version) },
  banner: { js: "import{createRequire}from'module';const require=createRequire(import.meta.url);" },
  logLevel: "warning",
});

cpSync("manifest.json", "dist/manifest.json");
cpSync("icon.png", "dist/icon.png");
console.log(`Built v${pkg.version} into dist/`);
