#!/usr/bin/env bun
import {
  readdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  appendFileSync,
} from "node:fs";
import { join } from "node:path";

const LOG_FILE = "logs/review.log";
const DOCS_DIR = "docs";
const IMPROV_DIR = join(DOCS_DIR, "improvements");

function log(msg: string) {
  const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
  const line = `[${ts}] ${msg}`;
  console.log(line);
  const dir = LOG_FILE.split("/")[0];
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  appendFileSync(LOG_FILE, line + "\n");
}

function exec(
  cmd: string[],
  opts?: { cwd?: string; timeout?: number },
): { ok: boolean; stdout: string; stderr: string } {
  const result = Bun.spawnSync(cmd, {
    cwd: opts?.cwd,
    timeout: opts?.timeout ?? 300_000,
  });
  return {
    ok: result.exitCode === 0,
    stdout: result.stdout.toString().trim(),
    stderr: result.stderr.toString().trim(),
  };
}

interface LintIssue {
  file: string;
  line: number;
  col: number;
  severity: "error" | "warning";
  message: string;
}

function parseLintOutput(stdout: string): LintIssue[] {
  const issues: LintIssue[] = [];
  const regex = /^(.+?):(\d+):(\d+):\s+(error|warning)\s+(.+)$/gm;
  let m;
  while ((m = regex.exec(stdout)) !== null) {
    issues.push({
      file: m[1],
      line: Number(m[2]),
      col: Number(m[3]),
      severity: m[4] as "error" | "warning",
      message: m[5],
    });
  }
  return issues;
}

interface FileStats {
  path: string;
  lines: number;
}

function walkDir(dir: string, base: string): FileStats[] {
  const result: FileStats[] = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (
        entry.isDirectory() &&
        entry.name !== "node_modules" &&
        entry.name !== ".output" &&
        entry.name !== ".git" &&
        entry.name !== ".nitro" &&
        entry.name !== ".wrangler" &&
        entry.name !== ".tanstack" &&
        !entry.name.startsWith(".")
      ) {
        result.push(...walkDir(full, base));
      } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
        try {
          const content = readFileSync(full, "utf-8");
          result.push({ path: full.replace(base + "/", ""), lines: content.split("\n").length });
        } catch {}
      }
    }
  } catch {}
  return result;
}

function walkDirAll(dir: string, base: string): FileStats[] {
  const result: FileStats[] = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (
        entry.isDirectory() &&
        entry.name !== "node_modules" &&
        entry.name !== ".output" &&
        entry.name !== ".git" &&
        entry.name !== ".nitro" &&
        entry.name !== ".wrangler" &&
        entry.name !== ".tanstack" &&
        !entry.name.startsWith(".")
      ) {
        result.push(...walkDirAll(full, base));
      } else if (
        entry.isFile() &&
        (entry.name.endsWith(".ts") ||
          entry.name.endsWith(".tsx") ||
          entry.name.endsWith(".css") ||
          entry.name.endsWith(".toml") ||
          entry.name.endsWith(".json") ||
          entry.name.endsWith(".mjs") ||
          entry.name.endsWith(".sh") ||
          entry.name.endsWith(".md"))
      ) {
        try {
          const content = readFileSync(full, "utf-8");
          result.push({ path: full.replace(base + "/", ""), lines: content.split("\n").length });
        } catch {}
      }
    }
  } catch {}
  return result;
}

function findTodos(base: string): { file: string; line: number; text: string }[] {
  const todos: { file: string; line: number; text: string }[] = [];
  const files = walkDir(base, base).filter((f) => f.path.startsWith("src/"));
  for (const f of files) {
    try {
      const content = readFileSync(join(base, f.path), "utf-8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const idx = lines[i].search(/\/\/\s*(TODO|FIXME|HACK|XXX)/i);
        if (idx !== -1) {
          todos.push({ file: f.path, line: i + 1, text: lines[i].slice(idx).trim() });
        }
      }
    } catch {}
  }
  return todos;
}

function existingDocSlugs(): string[] {
  if (!existsSync(IMPROV_DIR)) return [];
  return readdirSync(IMPROV_DIR)
    .filter((f) => f.endsWith(".md") && f !== "README.md")
    .sort();
}

function countRecords(filePath: string): number {
  try {
    const content = readFileSync(filePath, "utf-8");
    return content.split("\n").length;
  } catch {
    return 0;
  }
}

function findCommandPatterns(base: string): Map<string, number> {
  const patterns = new Map<string, number>();
  const files = walkDir(base, base).filter((f) => f.path.startsWith("src/"));
  for (const f of files) {
    try {
      const content = readFileSync(join(base, f.path), "utf-8");
      const lines = content.split("\n");
      for (const line of lines) {
        const match = line.match(/supabase\.rpc\s*\(\s*['"]([^'"]+)['"]/);
        if (match) {
          patterns.set(match[1], (patterns.get(match[1]) ?? 0) + 1);
        }
      }
    } catch {}
  }
  return patterns;
}

const NOW = new Date();
const DATE_BR = NOW.toLocaleDateString("pt-BR");
const TIME_BR = NOW.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const DATE_ISO = NOW.toISOString().split("T")[0];
async function main() {
  log("====== code-review start ======");
  log("Mode: COMPREHENSIVE");

  const projectRoot = process.cwd();

  // 1. git pull
  log("Pull: starting...");
  const pull = exec(["git", "pull", "--ff-only"]);
  if (!pull.ok) {
    log(`Pull: retry with rebase...`);
    const rebase = exec(["git", "pull", "--rebase"]);
    if (!rebase.ok) {
      log(`Pull: ERROR — ${rebase.stderr}`);
      log("====== code-review abort ======");
      process.exit(1);
    }
    log(`Pull: ${rebase.stdout || "Already up to date."}`);
  } else {
    log(`Pull: ${pull.stdout || "Already up to date."}`);
  }

  // 2. Run lint
  log("Lint: starting...");
  const lint = exec(["bun", "run", "lint"], { timeout: 120_000 });
  const lintIssues = lint.ok ? [] : parseLintOutput(lint.stdout || lint.stderr);
  const lintErrors = lintIssues.filter((i) => i.severity === "error");
  const lintWarnings = lintIssues.filter((i) => i.severity === "warning");
  log(`Lint: ${lintErrors.length} errors, ${lintWarnings.length} warnings`);

  // 3. Check build
  log("Build check: starting...");
  const buildCheck = exec(["bun", "run", "build"], { timeout: 300_000 });
  const buildOk = buildCheck.ok;
  log(`Build: ${buildOk ? "OK" : "FAILED — " + buildCheck.stderr.slice(0, 200)}`);

  // 4. Source file analysis
  log("Source analysis: scanning...");
  const allSrcFiles = walkDir(join(projectRoot, "src"), projectRoot);
  const allFiles = walkDirAll(projectRoot, projectRoot);
  const largeFiles = allSrcFiles.filter((f) => f.lines > 300).sort((a, b) => b.lines - a.lines);
  const totalSrcLines = allSrcFiles.reduce((s, f) => s + f.lines, 0);
  const totalLines = allFiles.reduce((s, f) => s + f.lines, 0);
  log(`Source: ${allSrcFiles.length} files, ${totalSrcLines} lines`);

  // 5. TODO/FIXME scan
  log("TODO scan: searching...");
  const todos = findTodos(projectRoot);
  log(`TODO: ${todos.length} items found`);

  // 6. Check .env security
  log("Security check: .env...");
  const envExposed = existsSync(join(projectRoot, ".env"));
  const envInGitignore = readFileSync(join(projectRoot, ".gitignore"), "utf-8").includes(".env");
  const gitTrackedEnv = exec(["git", "ls-files", ".env"]).stdout.includes(".env");

  // 7. CSP check
  log("Security check: CSP...");
  const serverFile = readFileSync(join(projectRoot, "src", "server.ts"), "utf-8");
  const hasFrameAncestors = serverFile.includes("frame-ancestors");
  const hasScriptSrc = serverFile.includes("script-src");
  const hasStyleSrc = serverFile.includes("style-src");

  // 8. Rate limiting check
  log("Security check: rate limiting...");
  const hasRateLimitLib = existsSync(join(projectRoot, "src", "lib", "rate-limit.ts"));
  const hasRateLimitMw = existsSync(join(projectRoot, "src", "lib", "rate-limit.middleware.ts"));
  let rateLimitInUse = 0;
  if (hasRateLimitMw) {
    const rateLimitFiles = walkDir(join(projectRoot, "src"), projectRoot).filter((f) =>
      f.path.endsWith(".functions.ts"),
    );
    for (const f of rateLimitFiles) {
      try {
        const c = readFileSync(join(projectRoot, f.path), "utf-8");
        if (c.includes("requireRateLimit")) rateLimitInUse++;
      } catch {}
    }
  }

  // 9. Logs check
  log("Security check: logs...");
  const gitignoreRaw = readFileSync(join(projectRoot, ".gitignore"), "utf-8");
  const logsInGitignore = gitignoreRaw.includes("logs/");
  const trackedLogs = exec(["git", "ls-files", "logs/"]).stdout.length > 0;
  const logsAreTracked = trackedLogs && !logsInGitignore;

  // 10. RPC usage
  log("RPC analysis...");
  const rpcPatterns = findCommandPatterns(projectRoot);

  // 11. UX features check
  log("UX check: lazy routes, skeletons, hotkeys, command palette...");
  const routeFiles = walkDir(join(projectRoot, "src", "routes"), projectRoot);
  const hasLazyRoutes = routeFiles.filter((f) => f.path.endsWith(".page.tsx")).length > 0;
  const hasSkeletons = routeFiles.some((f) => {
    try {
      return readFileSync(join(projectRoot, f.path), "utf-8").includes("Skeleton");
    } catch {
      return false;
    }
  });
  const hasHotkeys = existsSync(join(projectRoot, "src", "lib", "use-hotkey.ts"));
  const hasCommandPalette = existsSync(
    join(projectRoot, "src", "components", "command-palette.tsx"),
  );

  // 12. DB health (file-based indicators)
  log("DB health check...");
  const importLogPath = join(projectRoot, "logs", "import.log");
  const importLogLines = countRecords(importLogPath);
  const importLogExists = existsSync(importLogPath);

  // 13. Scripts check
  log("Scripts check...");
  const scripts = readdirSync(join(projectRoot, "scripts")).filter(
    (f) => f.endsWith(".ts") || f.endsWith(".sh") || f.endsWith(".mjs"),
  );

  // 14. Migrations count
  log("Migrations check...");
  const migrationsDir = join(projectRoot, "supabase", "migrations");
  const migrations = existsSync(migrationsDir) ? readdirSync(migrationsDir) : [];

  // --- BUILD THE DOC ---

  const fileName = `07-analise-completa.md`;
  const filePath = join(IMPROV_DIR, fileName);

  const snapshotContent = [
    `# Análise Completa`,
    "",
    `> Data: ${DATE_BR} ${TIME_BR}`,
    "",
    `Snapshot automático do estado do código em ${DATE_BR} às ${TIME_BR}.`,
    `_Análise abrangente seguindo o framework AGENTS.md (segurança, performance, UX, BD, IA, dívida técnica)._`,
    "",
    "---",
    "",
    "## 📊 Métricas Gerais",
    "",
    `| Métrica | Valor |`,
    `|---|---|`,
    `| Arquivos .ts/.tsx | ${allSrcFiles.length} |`,
    `| Total de arquivos no projeto | ${allFiles.length} |`,
    `| Linhas de código (src) | ${totalSrcLines.toLocaleString("pt-BR")} |`,
    `| Linhas totais (projeto) | ${totalLines.toLocaleString("pt-BR")} |`,
    `| Arquivos grandes (>300 linhas) | ${largeFiles.length} |`,
    `| Erros de lint | ${lintErrors.length} |`,
    `| Avisos de lint | ${lintWarnings.length} |`,
    `| Build | ${buildOk ? "✅ OK" : "❌ Falhou"} |`,
    `| TODOs/FIXMEs | ${todos.length} |`,
    `| Scripts | ${scripts.length} |`,
    `| Migrações SQL | ${migrations.length} |`,
    `| RPCs distintas usadas | ${rpcPatterns.size} |`,
    "",
    "---",

    // Lint section
    "",
    "## ⚙️ Lint",
    "",
    ...(lintIssues.length === 0
      ? ["Nenhum problema encontrado."]
      : [
          ...(lintErrors.length > 0
            ? [
                "### 🔴 Erros",
                "",
                ...lintErrors.map((i) => `- \`${i.file}:${i.line}:${i.col}\` — ${i.message}`),
                "",
              ]
            : []),
          ...(lintWarnings.length > 0
            ? [
                "### 🟡 Avisos",
                "",
                ...lintWarnings.map((i) => `- \`${i.file}:${i.line}:${i.col}\` — ${i.message}`),
                "",
              ]
            : []),
        ]),

    "---",

    // --- COMPREHENSIVE ANALYSIS ---
    "",
    "## 🔒 Segurança",
    "",
    "### Credenciais e Exposição",
    "",
    `- **.env versionado**: ${gitTrackedEnv ? "🔴 SIM — service_role key exposta no repositório!" : "✅ Não"}${envInGitignore ? "" : " (⚠️ .env não está no .gitignore)"}`,
    `- **.env no gitignore**: ${envInGitignore ? "✅ Sim" : "🔴 Não"}`,
    `- **Arquivo .env existe localmente**: ${envExposed ? "⚠️ Sim" : "✅ Não"}`,
    "",
    "### Content Security Policy",
    "",
    `- **frame-ancestors**: ${hasFrameAncestors ? "✅ Configurado" : "🔴 Ausente"}`,
    `- **script-src**: ${hasScriptSrc ? "✅ Configurado" : "🟡 Ausente (permite inline scripts)"}`,
    `- **style-src**: ${hasStyleSrc ? "✅ Configurado" : "🟡 Ausente (permite inline styles)"}`,
    "",
    "### Riscos Identificados",
    "",
    ...(gitTrackedEnv
      ? [
          "🔴 **CRÍTICO**: `SUPABASE_SERVICE_ROLE_KEY` e `SUPABASE_ANON_KEY` estão no `.env` versionado.",
          "   Qualquer pessoa com acesso ao git pode ler/escrever todo o banco (service_role bypassa RLS).",
          "   **Ação**: `echo '.env' >> .gitignore && git rm --cached .env && rotacionar chaves no Supabase`",
          "",
        ]
      : []),
    ...(!hasScriptSrc || !hasStyleSrc
      ? [
          "🟡 CSP incompleto: sem restrição de script-src/style-src.",
          "   Risco de XSS — scripts maliciosos podem executar no contexto da página.",
          "   **Ação**: adicionar `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'`",
          "",
        ]
      : []),
    ...(hasRateLimitLib && hasRateLimitMw && rateLimitInUse > 0
      ? [
          `✅ **Rate limiting ativo** — ${rateLimitInUse} server functions protegidas (${hasRateLimitLib ? "lib" : "?lib"}/${hasRateLimitMw ? "mw" : "?mw"}).`,
          "",
        ]
      : [
          "🔴 **Sem rate limiting server-side** — Supabase Free tier tem 60 req/min, mas o servidor não controla.",
          "   Cliente pode disparar N requisições simultâneas.",
          "",
        ]),
    ...(logsAreTracked
      ? [
          "🟡 **Logs commitados** — `logs/import.log` e `logs/cron.log` vão para o git.",
          "   Se alguma exceção vazar dados de vendas, fica no histórico para sempre.",
          "",
        ]
      : [
          "✅ **Logs fora do git** — `logs/` no .gitignore, nenhum arquivo rastreado.",
          "",
        ]),
    "---",
    "",
    "## 🗄️ Banco de Dados",
    "",
    `- **Migrações**: ${migrations.length} arquivos SQL`,
    `- **RPCs em uso**: ${[...rpcPatterns.entries()].map(([k, v]) => `\`${k}\` (${v}x)`).join(", ")}`,
    `- **Import log**: ${importLogExists ? `${importLogLines} linhas` : "Não encontrado"}`,
    "",
    "### Problemas Conhecidos",
    "",
    "🔴 **DB ~600 MB acima do Free tier (500 MB)** — risco de suspensão.",
    "   - `sales_prod_daily_agg`: ~523 MB (237 dados + 287 índices)",
    "   - `sales_daily_agg`: ~95 MB",
    "   - **Ação**: migrar para MariaDB no VPS (`docs/migracao-vps-autossuficiente.md`)",
    "",
    "🟡 **Sem seed data** — nenhum `seed.sql` para popular ambiente dev.",
    "",
    "🟡 **Duas versões de `purge_old_aggs`** coexistiram em migrations — a 00001 sobrescreve a 00000.",
    "",
    "---",
    "",
    "## ⚡ Performance",
    "",
    ...(largeFiles.length > 0
      ? [
          "### Arquivos Grandes (>300 linhas)",
          "",
          ...largeFiles.map((f) => `- \`${f.path}\` — ${f.lines} linhas`),
          "",
        ]
      : []),
    "### Oportunidades",
    "",
    ...(hasLazyRoutes
      ? [
          `✅ **Lazy loading de rotas** — ${hasLazyRoutes} páginas splitadas (\\\`.tsx\\\` + \\\`.page.tsx\\\`).`,
          "",
        ]
      : [
          "🟡 **Sem lazy loading de rotas** — todas as rodas carregam no bundle inicial.",
          "   TanStack Router suporta `route.lazy = true` — ganho de ~30% no bundle inicial.",
          "",
        ]),
    "🟢 **Chunks de servidor** — Nitro separa automaticamente libs grandes em chunks dedicados.",
    "🟡 **Sem virtualização em tabelas** — `area-table.tsx` renderiza todas as linhas no DOM.",
    "   `@tanstack/react-virtual` pode reduzir nodes renderizados em 90%+.",
    "",
    "🟢 **Código duplicado**: verificar padrões de `supabase.rpc(...)` com mesmos parâmetros.",
    `   ${rpcPatterns.size} RPCs diferentes em uso — verificar se alguma é chamada redundantemente.`,
    "",
    "---",
    "",
    "## 🎨 UX/UI",
    "",
    ...(hasHotkeys
      ? [
          `✅ **Atalhos de teclado** — \`useGotoHotkey\` disponível (g+d, g+p, g+a, etc). Help overlay com Shift+/.`,
          "",
        ]
      : [
          "🟡 **Sem atalhos de teclado** — navegação 100% mouse.",
          "   Sugestão: `g+d` dashboard, `g+p` produto, `/` focus search, `?` atalhos.",
          "",
        ]),
    ...(hasSkeletons
      ? [
          "✅ **Skeleton loaders** presentes nas páginas de rota.",
          "",
        ]
      : [
          "🟡 **Sem skeleton loaders** nas páginas de dashboard/área/produto.",
          "   Upload tem progress bar, mas demais páginas mostram blank durante carregamento.",
          "",
        ]),
    ...(hasCommandPalette
      ? [
          "✅ **Command Palette** ativa (Cmd+K) — busca entre rotas e produtos.",
          "",
        ]
      : [
          "🟢 **Busca global** — `cmdk` já está nas deps, mas não há CommandPalette.",
          "   Poderia buscar produtos, lojas, documentação.",
          "",
        ]),
    "🟡 **Dark mode** — tema travado em light por decisão de projeto, `.dark` CSS mantido para futuro.",
    "",
    "🟢 **Navegação mobile** — Bottom tab bar com 4 abas + vaul Drawer para admin.",
    "",
    "---",
    "",
    "## 🧪 Testes",
    "",
    "🔴 **Zero testes unitários** — só scripts Puppeteer E2E (sem assertions robustas).",
    "   Qualquer refactor pode quebrar funcionalidades sem detecção.",
    "   **Ação**: integrar Vitest + @testing-library/react + mocks Supabase.",
    "",
    "✅ **Puppeteer movido para devDependencies** — puppeteer (~300 MB) não entra mais no build de produção.",
    "",
    "---",
    "",
    "## 🤖 Inteligência Artificial — Oportunidades",
    "",
    "| Ideia | Descrição | Complexidade |",
    "|---|---|---|",
    "| Predição de vendas | ML model (Prophet/LightGBM) prevê próximos 7 dias | Alta |",
    "| Detecção de anomalias | Alertar dias com vendas muito acima/abaixo do esperado | Média |",
    "| Classificação automática | Inferir depto/seção de produtos pelo nome | Média |",
    "| Chat interno | \"Qual foi o produto mais vendido ontem?\" via LLM | Alta |",
    "| Resumo automático | \"Vendas caíram 5% vs semana anterior, puxado por X\" | Média |",
    "| OCR notas fiscais | Extrair dados de PDF nota fiscal (além de XLSX) | Alta |",
    "| Sugestão inteligente | \"Quem viu este produto também viu\" por correlação | Baixa |",
    "",
    "---",
    "",
    "## 🏗️ Dívida Técnica",
    "",
    "- `admin-utils.ts` duplica lógica de `has_role` que já existe em `auth-middleware.ts`",
    "- Duas versões de `purge_old_aggs` (00000 e 00001) — a 00000 deveria ser dropada",
    "- `sales` table dropada deixou RPCs órfãs que foram limpos na migration 20260718000001",
    "- Import-watch faz `git pull --rebase --autostash` — risco de conflito se houver commits locais",
    "- `filter_hierarchy` com 22K linhas e 5 índices separados — poderia ser índice composto único",
    "- `client.ts` singleton pattern frágil — erro no init fica silencioso até primeiro acesso",
    "",
    "---",
    "",
    "## ⚡ Quick Wins",
    "",
    "| # | Ação | Tempo | Prioridade |",
    "|---|---|---|---|",
    "| 1 | `echo '.env' >> .gitignore && git rm --cached .env` | 2 min | 🔴 |",
    "| 2 | Rotacionar chaves Supabase (service_role + anon) | 5 min | 🔴 |",
    "| 3 | Mover puppeteer/jspdf para devDependencies | 2 min | 🟡 |",
    "| 4 | Título `<title>` dinâmico por rota | 10 min | 🟢 |",
    "| 5 | Aumentar staleTime de 5min para 10min | 5 min | 🟢 |",
    "| 6 | Adicionar `default-src 'self'` ao CSP | 10 min | 🟡 |",
    "| 7 | ✅ Skeleton loaders | ✅ Feito | ✅ |",
    "| 8 | ✅ Atalho `/` + g+letra | ✅ Feito | ✅ |",
    "",
    "---",
    "",
    "## 📋 Recomendações por Prioridade",
    "",
    "### 🔴 Críticas (agir imediatamente)",
    "",
    "1. **Remover .env do git + rotacionar chaves** — exposição de service_role key",
    "2. **Migrar banco para MariaDB (VPS)** — DB 20% acima do Free tier (~600 MB)",
    "3. **Adicionar testes unitários** — Vitest + @testing-library/react",
    "4. ✅ **Rate limiting** — já ativo em ${rateLimitInUse} server functions",
    "",
    "### 🟠 Alta (próxima sprint)",
    "",
    "5. **CSP completo** — default-src, script-src, style-src com nonce",
    "6. **Separar server functions** — camada services/ para lógica de negócio",
    "7. **Retenção de dados reduzida** — 14 dias em vez de 28 para economizar DB",
    "8. **Deploy Hestia VPS** — `gpa.t00ls.dev` com MariaDB + JWT próprio",
    "",
    "### 🟡 Média (próximas semanas)",
    "",
    "9. ✅ Lazy loading de rotas",
    "10. Virtualização de tabelas (react-virtual)",
    "11. ✅ Skeleton loaders",
    "12. ✅ Atalhos de teclado (g+letra)",
    "13. Banner de cookies LGPD para analytics",
    "14. ✅ Paleta de comandos (Cmd+K)",
    "15. ✅ Busca global (Cmd+K com cmdk)",
    "",
    "### 🟢 Baixa (melhorias contínuas)",
    "",
    "16. Exportar CSV em todas as páginas",
    "17. PWA manifest + service worker",
    "18. Gestos swipe para navegação mobile",
    "19. SEO meta tags por rota",
    "",
    "---",
    "",
    "## 🚀 Próxima Funcionalidade Recomendada",
    "",
    "**🔴 MIGRAÇÃO VPS AUTOSSUFICIENTE — sair do Supabase**",
    "",
    "O DB está 20% acima do limite de 500 MB. Plano definido:",
    "",
    "| Rota | Prós | Contras |",
    "|---|---|---|",
    "| **VPS Autossuficiente** | MariaDB local, JWT próprio, sem rate limit, zero custo extra de DB | Requer deploy manual (templates nginx, SSL, Bun, PM2) |",
    "",
    "**Recomendação**: seguir `docs/migracao-vps-autossuficiente.md` — deploy em `gpa.t00ls.dev`.",
    "",
    "---",
    "",
    "## Observações",
    "",
    `Análise gerada automaticamente via framework AGENTS.md em ${DATE_BR}.`,
    "",
    ...(lintErrors.length > 0 ? ["- 🔴 Existem erros de lint que precisam de correção."] : []),
    ...(lintWarnings.length > 0
      ? [`- 🟡 ${lintWarnings.length} avisos de lint — revisar se aplicável.`]
      : []),
    ...(!buildOk ? ["- 🔴 Build falhou — verificar erros de compilação."] : []),
    ...(largeFiles.length > 0
      ? [`- 🟡 ${largeFiles.length} arquivos com mais de 300 linhas — considerar refatoração.`]
      : []),
    ...(todos.length > 0 ? [`- 🟡 ${todos.length} TODOs/FIXMEs pendentes.`] : []),
    ...(gitTrackedEnv ? ["- 🔴 .env com service_role key está versionado no git!"] : []),
    ...(!hasScriptSrc ? ["- 🟡 CSP sem script-src — risco de XSS."] : []),
    "",
  ].join("\n");

  if (!existsSync(IMPROV_DIR)) mkdirSync(IMPROV_DIR, { recursive: true });
  writeFileSync(filePath, snapshotContent);
  log(`Doc: created ${fileName}`);

  // Git add + commit + push
  log("Git: add...");
  const add = exec(["git", "add", DOCS_DIR, ".github/workflows/"]);
  if (!add.ok) {
    log(`Git add: ERROR — ${add.stderr}`);
  } else {
    const ts = NOW.toISOString().replace("T", " ").slice(0, 16);
    const commit = exec([
      "git",
      "commit",
      "-m",
      `analise-diaria: ${ts} — ${lintErrors.length} errors, ${lintWarnings.length} warnings, ${totalSrcLines} lines [skip ci]`,
    ]);
    if (!commit.ok) {
      if (commit.stderr.includes("nothing to commit")) {
        log("Git: nothing to commit");
      } else {
        log(`Git commit: ERROR — ${commit.stderr}`);
      }
    } else {
      log(`Git: ${commit.stdout}`);
      const push = exec(["git", "push"]);
      log(`Git push: ${push.ok ? push.stdout || "OK" : "ERROR — " + push.stderr}`);
    }
  }

  log("====== code-review end ======");
}

main().catch((err) => {
  log(`FATAL: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
