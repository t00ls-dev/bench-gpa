import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

// Precisa rodar ANTES de `vite build`, não depois: o Nitro embute um mapa de
// assets estáticos (size/etag/mtime) direto no bundle do server a partir do
// conteúdo de public/ NO MOMENTO DO BUILD. Editar .output/public/manifest.json
// depois (postbuild) deixa o Content-Length declarado dessincronizado do
// arquivo real, truncando a resposta em produção. Por isso versiona a fonte
// (public/manifest.json) antes do build e scripts/postbuild-restore-manifest.mjs
// devolve ela ao estado original depois, pra não sujar o working tree local.
const manifestPath = resolve(import.meta.dir, "../public/manifest.json");

let commitHash = "dev";
try {
  commitHash = execSync("git rev-parse --short HEAD").toString().trim();
} catch {
  // sem git disponível: mantém "dev", igual ao fallback do vite.config.ts
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
for (const icon of manifest.icons ?? []) {
  icon.src = `${icon.src.split("?")[0]}?v=${commitHash}`;
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

console.log(`manifest.json: ícones versionados com ?v=${commitHash} (pré-build)`);
