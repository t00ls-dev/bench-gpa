import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

// Needs to run BEFORE `vite build`, not after: Nitro embeds a static-asset
// map (size/etag/mtime) directly into the server bundle from public/'s
// content AT BUILD TIME. Editing .output/public/manifest.json afterward
// (postbuild) leaves the declared Content-Length out of sync with the real
// file, truncating the response in production. That's why it versions the
// source (public/manifest.json) before the build and
// scripts/postbuild-restore-manifest.mjs restores it to its original state
// afterward, so it doesn't leave the local working tree dirty.
const manifestPath = resolve(import.meta.dir, "../public/manifest.json");

let commitHash = "dev";
try {
  commitHash = execSync("git rev-parse --short HEAD").toString().trim();
} catch {
  // no git available: keeps "dev", same as vite.config.ts's fallback
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
for (const icon of manifest.icons ?? []) {
  icon.src = `${icon.src.split("?")[0]}?v=${commitHash}`;
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

console.log(`manifest.json: ícones versionados com ?v=${commitHash} (pré-build)`);
