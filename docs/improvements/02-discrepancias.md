# Discrepâncias entre Documentação e Implementação

Gaps encontrados entre o que está documentado (AGENTS.md, docs) e o código real.
Atualizado pós-migração Supabase → MariaDB.

> ⚠️ Docs obsoletas removidas: `migracao-sqlite.md`, `pereciveis-plano.md`, `analise-pereciveis.md`.

---

## AGENTS.md vs Código

| Item | Documentado | Real | Gravidade |
|---|---|---|---|
| Dark mode | "script inline anti-flash no SSR shell" | `styles.css` **tem `.dark` block**, mas tema travado em light; toggle removido | 🟡 MÉDIA (código pronto, inativo) |
| Env var name | `VITE_SUPABASE_ANON_KEY` | `VITE_SUPABASE_PUBLISHABLE_KEY` em `client.ts` | 🟡 MÉDIA (será removido na migração) |
| "Product filtering client-side" (área) | "busca tudo e filtra/ordena/pagina no cliente" | **Já é server-side** (paginação, sorting, search) | 🟡 MÉDIA (desatualizado) |
| RPC `products_in_decline` | Não mencionado | Existe no banco e types.ts, **sem UI** | 🟡 MÉDIA |
| `staging_sales` tabela | Não listada em "Tabelas Principais" | Existe e é usada no pipeline de import | 🟡 MÉDIA |
| `assertAdmin` | Mencionado como proteção server-side | Duplicado em 2 arquivos | 🟡 MÉDIA |

---

## Docs de Migração vs Realidade

### `docs/api-php-mariadb.md` (plano vigente)
- **Plano completo** para Vercel + PHP API + MariaDB
- Auth JWT próprio, zero Supabase
- **Ainda não executado** — app ainda roda com Supabase

### `docs/migracao-vps-autossuficiente.md`
- Alternativa Node.js + MariaDB puro, sem PHP
- **Compatível** com deploy Hestia VPS (`sv1.t00ls.dev`)

### `docs/deploy-hestia-vps.md` (novo)
- Plano específico para deploy em `sv1.t00ls.dev` com Hestia CP
- Template nginx `node-ssr` para proxy reverso
- **Ainda não executado** — aguardando autorização

---

## Inconsistências Internas no Código

| Onde | Problema |
|---|---|
| `kpi-card.tsx` exporta `fmtBRL` | `ranking-card.tsx` importa de `kpi-card` em vez de `utils.ts` |
| `safeError` | Não preserva `error.cause` — stack trace original perdido |
| `repairAggregations` (admin) vs fallback em `finalizeImport` (upload) | Lógica de rebuild de agregações duplicada |
| `assertAdmin` | Cópia idêntica em `admin.functions.ts:6` e `upload.functions.ts:6` |
| `parseWorkbook` | É um alias de `parseAnyWorkbook` sem razão de existir |
| `getServerConfig` em `config.server.ts` | Só retorna `nodeEnv` e **não é usado em lugar nenhum** |
| `FilterBar` re-clampa datas | Efeito colateral silencioso, sem notificação ao usuário |
| `LastUpdateInfo` busca todas as datas | Só precisa da mais recente |
| `.env` versionado com `SUPABASE_SERVICE_ROLE_KEY` | 🔴 Crítico — será resolvido na migração (remoção do Supabase) |

---

## Itens Resolvidos (julho/2026)

| Item | O que mudou |
|---|---|
| 18 erros TS no upload | ✅ Corrigidos (ParsedSalesFile, onFilesSelected, etc.) |
| Multi-drop upload | ✅ Corrigido (pendingQueue, confirm dialog) |
| `noUncheckedSideEffectImports` no tsconfig | ✅ Removido |
| 5 componentes UI não usados | ✅ Removidos (carousel, resizable, input-otp, command, drawer) |
| Code-review cron | ✅ Agora sobrescreve `07-analise-completa.md` |
| Doc obsoletas removidas | ✅ SQLite, Perecíveis — eliminadas |
| CSP incompleto | ✅ Completo com nonce (script-src, style-src, default-src, frame-ancestors) |
| Rate limiting ausente | ✅ Sliding window por IP + global (4 tiers: SSR, API, Upload, Auth) |
| Turnstile CAPTCHA | ✅ Integrado no login (fail-closed, bypass env) |
| Puppeteer em dependencies | ✅ Movido para devDependencies |
| Logs commitados | ✅ `logs/` no .gitignore, removidos do tracking |
| Atalhos de teclado | ✅ Implementados (g+letra, Cmd+K palette, Shift+/ help) |
| Navegação mobile | ✅ Bottom tab bar + vaul Drawer para admin |
| Paleta de comandos | ✅ Implementada com cmdk |
| View Transitions | ✅ View Transitions API + fallback opacity |
| Exportação PDF (Dashboard) | ✅ Implementado com jspdf |
| Exportação PDF (Produto) | ✅ Implementado com jspdf |
| Shared PDF utility | ✅ `src/lib/export-pdf.ts` — reusado pelo Área |
| Área componente reduzido | ✅ 773 → 295 linhas (AreaTable extraído) |
| HOWTO page | ✅ Rota `/howto` criada com guia do sistema |
