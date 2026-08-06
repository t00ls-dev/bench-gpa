import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

// Counterpart to scripts/prebuild-version-manifest.mjs: after Nitro has
// already read and embedded public/manifest.json into the build bundle,
// removes the `?v=` back from the git-versioned source, so it doesn't
// leave the local working tree dirty after a `bun run build`.
const manifestPath = resolve(import.meta.dir, "../public/manifest.json");

const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
for (const icon of manifest.icons ?? []) {
  icon.src = icon.src.split("?")[0];
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

console.log("manifest.json: restored to unversioned state (post-build)");
