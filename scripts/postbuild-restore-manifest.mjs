import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

// Contraparte de scripts/prebuild-version-manifest.mjs: depois que o Nitro já
// leu e embutiu public/manifest.json no bundle do build, remove o `?v=` de
// volta da fonte versionada em git, pra não deixar o working tree local sujo
// depois de um `bun run build`.
const manifestPath = resolve(import.meta.dir, "../public/manifest.json");

const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
for (const icon of manifest.icons ?? []) {
  icon.src = icon.src.split("?")[0];
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

console.log("manifest.json: restaurado ao estado sem versão (pós-build)");
