# Discrepâncias entre Documentação e Implementação

Gaps encontrados entre o que está documentado (AGENTS.md, docs) e o código real.
Atualizado pós-migração Supabase → MariaDB.

> ⚠️ Docs obsoletas removidas: `migracao-sqlite.md`, `pereciveis-plano.md`, `analise-pereciveis.md`.

---

## AGENTS.md vs Código

| Item | Documentado | Real | Gravidade |
|---|---|---|---|
| `src/hooks/use-theme.ts` | Existe (toggle light/dark) | **Arquivo não existe** | 🔴 ALTA |
| Dark mode | "script inline anti-flash no SSR shell" | `styles.css` **não tem variáveis `.dark`**; hook não existe | 🔴 ALTA |
| Env var name | `VITE_SUPABASE_ANON_KEY` | `VITE_SUPABASE_PUBLISHABLE_KEY` em `client.ts` | 🟡 MÉDIA (será removido na migração) |
| "Product filtering client-side" (área) | "busca tudo e filtra/ordena/pagina no cliente" | **Já é server-side** (paginação, sorting, search) | 🟡 MÉDIA (desatualizado) |
| RPC `products_in_decline` | Não mencionado | Existe no banco e types.ts, **sem UI** | 🟡 MÉDIA |
| `staging_sales` tabela | Não listada em "Tabelas Principais" | Existe e é usada no pipeline de import | 🟡 MÉDIA |
| `auth-attacher.ts` | Descrito como middleware | Confirmado, registrado em `start.ts` | ✅ OK (será adaptado para JWT local) |
| `error-capture.ts` / h3 detection | Não mencionado | Implementado e referenciado por `server.ts` | ✅ OK |
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
| 18 erros TS no upload | ✅ Corrigidos (ParsedSalesFile, onFilesSelected, getImportedOrder, etc.) |
| Multi-drop upload | ✅ Corrigido (pendingQueue, confirm dialog com N arquivos) |
| `noUncheckedSideEffectImports` no tsconfig | ✅ Removido |
| 5 componentes UI não usados | ✅ Removidos (carousel, resizable, input-otp, command, drawer) |
| Code-review cron | ✅ Agora sobrescreve `analise-completa.md` em vez de acumular |
| Doc obsoletas removidas | ✅ SQLite, Perecíveis — eliminadas |
