# Discrepâncias entre Documentação e Implementação

Gaps encontrados entre o que está documentado (AGENTS.md, docs) e o código real.
Atualizado pós-migração Supabase → MariaDB.

> ⚠️ Docs obsoletas removidas: `migracao-sqlite.md`, `pereciveis-plano.md`, `analise-pereciveis.md`.

---

## AGENTS.md vs Código

| Item                                   | Documentado                                    | Real                                                                           | Gravidade                            |
| -------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------ |
| Dark mode                              | "script inline anti-flash no SSR shell"        | `styles.css` **tem `.dark` block**, mas tema travado em light; toggle removido | 🟡 MÉDIA (código pronto, inativo)    |
| Env var name                           | `VITE_SUPABASE_ANON_KEY`                       | `VITE_SUPABASE_PUBLISHABLE_KEY` em `client.ts`                                 | 🟡 MÉDIA (será removido na migração) |
| "Product filtering client-side" (área) | "busca tudo e filtra/ordena/pagina no cliente" | **Já é server-side** (paginação, sorting, search)                              | 🟡 MÉDIA (desatualizado)             |
| RPC `products_in_decline`              | Não mencionado                                 | Foi removido do banco (18/07/2026) — RPC órfão sem UI                          | 🟢 RESOLVIDO                         |
| `staging_sales` tabela                 | Não listada em "Tabelas Principais"            | Existe e é usada no pipeline de import                                         | 🟡 MÉDIA                             |
| `assertAdmin`                          | Mencionado como proteção server-side           | Duplicado em 2 arquivos                                                        | 🟡 MÉDIA                             |

---

## Docs de Migração vs Realidade

### `docs/migracao-vps-autossuficiente.md`

- Plano executado — deploy ativo em `gpa.t00ls.dev` com MariaDB + JWT próprio

---

## Inconsistências Internas no Código

| Onde                                                                  | Problema                                                           |
| --------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------ |
| `kpi-card.tsx` exporta `fmtBRL`                                       | `ranking-card.tsx` importa de `kpi-card` em vez de `utils.ts`      |
| `safeError`                                                           | Não preserva `error.cause` — stack trace original perdido          |
| `repairAggregations` (admin) vs fallback em `finalizeImport` (upload) | Lógica de rebuild de agregações duplicada                          |
| `assertAdmin`                                                         | Cópia idêntica em `admin.functions.ts:6` e `upload.functions.ts:6` |
| ~~`parseWorkbook`~~                                                   | ~~Alias removido~~                                                 | ✅ Resolvido |
| ~~`getServerConfig`~~                                                 | ~~Função removida~~                                                | ✅ Resolvido |
| `FilterBar` re-clampa datas                                           | Efeito colateral silencioso, sem notificação ao usuário            |
| ~~`LastUpdateInfo`~~                                                  | ~~Componente removido~~                                            | ✅ Resolvido |
| `.env` com `SUPABASE_SERVICE_ROLE_KEY` (histórico)                   | ✅ Resolvido — removido na migração                                |

---

## Itens Resolvidos (julho/2026)

| Item                                       | O que mudou                                                                 |
| ------------------------------------------ | --------------------------------------------------------------------------- |
| 18 erros TS no upload                      | ✅ Corrigidos (ParsedSalesFile, onFilesSelected, etc.)                      |
| Multi-drop upload                          | ✅ Corrigido (pendingQueue, confirm dialog)                                 |
| `noUncheckedSideEffectImports` no tsconfig | ✅ Removido                                                                 |
| 5 componentes UI não usados                | ✅ Removidos (carousel, resizable, input-otp, command, drawer)              |
| Code-review cron                           | ✅ Agora sobrescreve `analise-completa.md`                               |
| Doc obsoletas removidas                    | ✅ SQLite, Perecíveis — eliminadas                                          |
| CSP incompleto                             | ✅ Completo com nonce (script-src, style-src, default-src, frame-ancestors) |
| Rate limiting ausente                      | ✅ Sliding window por IP + global (4 tiers: SSR, API, Upload, Auth)         |
| Turnstile CAPTCHA                          | ✅ Integrado no login (fail-closed, bypass env)                             |
| Puppeteer em dependencies                  | ✅ Movido para devDependencies                                              |
| Logs commitados                            | ✅ `logs/` no .gitignore, removidos do tracking                             |
| Atalhos de teclado                         | ✅ Implementados (g+letra, Cmd+K palette, Shift+/ help)                     |
| Navegação mobile                           | ✅ Bottom tab bar + vaul Drawer para admin                                  |
| Paleta de comandos                         | ✅ Implementada com cmdk                                                    |
| View Transitions                           | ✅ View Transitions API + fallback opacity                                  |
| Exportação PDF (Dashboard)                 | ✅ Implementado com jspdf                                                   |
| Exportação PDF (Produto)                   | ✅ Implementado com jspdf                                                   |
| Shared PDF utility                         | ✅ `src/lib/export-pdf.ts` — reusado pelo Área                              |
| Área componente reduzido                   | ✅ 773 → 295 linhas (AreaTable extraído)                                    |
| HOWTO page                                 | ✅ Rota `/howto` criada com guia do sistema                                 |
