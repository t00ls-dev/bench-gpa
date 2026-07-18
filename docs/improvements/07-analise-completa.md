# Análise Completa

> Data: 17/07/2026 — Atualizado manualmente

Snapshot automático do estado do código (gerado pelo cron `code-review` às 06:00 diário).
_Análise abrangente seguindo o framework AGENTS.md (segurança, performance, UX, BD, IA, dívida técnica)._

---

## Métricas Gerais

| Métrica | Valor |
|---|---|
| Arquivos .ts/.tsx | 125 |
| Total de arquivos no projeto | 243 |
| Linhas de código (src) | ~11.500 |
| Linhas totais (projeto) | ~19.500 |
| Arquivos grandes (>300 linhas) | 2 (sidebar.tsx, types.ts) |
| Erros de lint | 0 |
| Avisos de lint | 0 |
| Build | ✅ OK |
| TODOs/FIXMEs | 0 |
| Scripts | 10 |
| Migrações SQL | 64 |
| RPCs distintas usadas | 10 |

---

## Lint

Nenhum problema encontrado.
---

## Segurança

### Credenciais e Exposição

- **.env versionado**: 🔴 SIM — service_role key exposta no repositório! (⚠️ .env não está no .gitignore)
- **.env no gitignore**: 🔴 Não
- **Arquivo .env existe localmente**: ⚠️ Sim

### Content Security Policy

- **default-src**: ✅ `'self'`
- **script-src**: ✅ Nonce + `strict-dynamic`
- **style-src**: ✅ `'self' 'unsafe-inline'`
- **frame-ancestors**: ✅ `'none'`
- **frame-src**: ✅ `challenges.cloudflare.com` (Turnstile)
- **X-Frame-Options**: ✅ `DENY`

### Riscos Identificados

🔴 **CRÍTICO**: `SUPABASE_SERVICE_ROLE_KEY` e `SUPABASE_ANON_KEY` estão no `.env` versionado.
   **Ação**: `echo '.env' >> .gitignore && git rm --cached .env && rotacionar chaves no Supabase`

🔴 **DB ~600 MB acima do Free tier (500 MB)** — risco de suspensão.
   **Ação**: migrar para MariaDB (planejado) ou reduzir retenção para 14 dias.

🟡 **Turnstile Bypass ativo** — `TURNSTILE_BYPASS` permite login sem CAPTCHA em dev.
   Verificar se não está setado em produção.

---

## Banco de Dados

- **Migrações**: 64 arquivos SQL
- **RPCs em uso**: `has_role` (4x), `dashboard_metrics` (1x), `product_search` (1x), `get_product_by_code` (1x), `product_analysis` (1x), `area_analysis` (1x), `area_filter_hierarchy` (1x), `imported_dates` (1x), `filter_options` (1x), `dashboard_rankings` (1x)
- **Import log**: 4092 linhas

### Problemas Conhecidos

🔴 **DB ~600 MB acima do Free tier (500 MB)** — risco de suspensão.
   - `sales_prod_daily_agg`: ~523 MB (237 dados + 287 índices)
   - `sales_daily_agg`: ~95 MB
   - **Ação**: migrar para SQLite ou MariaDB, ou reduzir retenção para 14 dias.

🟡 **Sem seed data** — nenhum `seed.sql` para popular ambiente dev.

🟡 **Duas versões de `purge_old_aggs`** coexistiram em migrations — a 00001 sobrescreve a 00000.

---

## ⚡ Performance

### Arquivos Grandes (>300 linhas)

- `src/components/ui/sidebar.tsx` — 745 linhas
- `src/integrations/supabase/types.ts` — 504 linhas
- `src/components/ui/chart.tsx` — 321 linhas

### Oportunidades

🟡 **Sem lazy loading de rotas** — todas as rotas carregam no bundle inicial.
   TanStack Router suporta `route.lazy = true` — ganho de ~30% no bundle inicial.

🟡 **Sem virtualização em tabelas** — `area-table.tsx` renderiza todas as linhas no DOM.
   `@tanstack/react-virtual` pode reduzir nodes renderizados em 90%+.

🟢 **Código duplicado**: verificar padrões de `supabase.rpc(...)` com mesmos parâmetros.
   10 RPCs diferentes em uso — verificar se alguma é chamada redundantemente.

---

## 🎨 UX/UI

🟡 **Dark mode implementado mas inativo** — `styles.css` tem `.dark` block completo, mas tema travado em light (toggle removido).
   Faltam ajustes em componentes com cores hardcoded (KpiCard, ImportCalendar).

🟡 **Sem skeleton loaders** nas páginas de dashboard/área/produto primeiro load.

🟡 **Sem feedback visual em operações longas** — dashboard/área sem loading state explícito.

✅ **Atalhos de teclado implementados** — `g+d/p/a/u/o/n/h` navegam, `Shift+/` help, `Cmd+K` palette.
✅ **Command palette** — `cmdk` integrado com busca de produtos.
✅ **Navegação mobile** — bottom tab bar fixa (Dashboard, Produto, Área, Como usar) + "Mais" admin via vaul Drawer.
✅ **View Transitions API** — transições suaves entre páginas.
✅ **HOWTO page** — `/howto` com guia do sistema.

---

## 🧪 Testes

🔴 **Zero testes unitários** — só scripts Puppeteer E2E (sem assertions robustas).
   Qualquer refactor pode quebrar funcionalidades sem detecção.
   **Ação**: integrar Vitest + @testing-library/react + mocks Supabase.

✅ **Puppeteer movido para devDependencies** — não entra no build de produção.

---

## 🤖 Inteligência Artificial — Oportunidades

| Ideia | Descrição | Complexidade |
|---|---|---|
| Predição de vendas | ML model (Prophet/LightGBM) prevê próximos 7 dias | Alta |
| Detecção de anomalias | Alertar dias com vendas muito acima/abaixo do esperado | Média |
| Classificação automática | Inferir depto/seção de produtos pelo nome | Média |
| Chat interno | "Qual foi o produto mais vendido ontem?" via LLM | Alta |
| Resumo automático | "Vendas caíram 5% vs semana anterior, puxado por X" | Média |
| OCR notas fiscais | Extrair dados de PDF nota fiscal (além de XLSX) | Alta |
| Sugestão inteligente | "Quem viu este produto também viu" por correlação | Baixa |

---

## Dívida Técnica

- `admin-utils.ts` duplica lógica de `has_role` que já existe em `auth-middleware.ts`
- Duas versões de `purge_old_aggs` (00000 e 00001) — a 00000 deveria ser dropada
- `sales` table dropada deixou 3+ RPCs órfãs que precisaram migração separada
- Import-watch faz `git pull --rebase --autostash` — risco de conflito se houver commits locais
- `filter_hierarchy` com 22K linhas e 5 índices separados — poderia ser índice composto único
- `.env` não está no `.gitignore` — risco de exposição de secrets
- `client.ts` singleton pattern frágil — erro no init fica silencioso até primeiro acesso

---

## ⚡ Quick Wins

| # | Ação | Tempo | Prioridade | Status |
|---|---|---|---|---|
| 1 | `echo '.env' >> .gitignore && git rm --cached .env` | 2 min | 🔴 | ❌ Pendente |
| 2 | Rotacionar chaves Supabase | 5 min | 🔴 | ❌ Pendente |
| 3 | Mover puppeteer para devDependencies | 2 min | 🟡 | ✅ Feito |
| 4 | Adicionar skeleton loaders nos charts | 15 min | 🟡 | ❌ Pendente |
| 5 | Título `<title>` dinâmico por rota | 10 min | 🟢 | ❌ Pendente |
| 6 | Atalho `/` para focus no search de produto | 5 min | 🟢 | ❌ Pendente |
| 7 | Aumentar staleTime para 10min | 5 min | 🟢 | ❌ Pendente |
| 8 | CSP completo (default-src, script-src, style-src) | 10 min | 🟡 | ✅ Feito |
| 9 | Rate limiting server-side | 30 min | 🟡 | ✅ Feito |
| 10 | Turnstile CAPTCHA no login | 20 min | 🟡 | ✅ Feito |
| 11 | Atalhos de teclado (g+letra, Cmd+K, Shift+/) | 60 min | 🟡 | ✅ Feito |
| 12 | Navegação mobile (bottom tab + vaul Drawer) | 45 min | 🟡 | ✅ Feito |
| 13 | Remover logs do git | 5 min | 🟡 | ✅ Feito |
| 14 | Exportação PDF (Dashboard + Produto + Área) | 90 min | 🟡 | ✅ Feito |

---

## 📋 Recomendações por Prioridade

### 🔴 Críticas (agir imediatamente)

1. **Remover .env do git + rotacionar chaves** — exposição de service_role key
2. **Migrar banco para MariaDB** — DB 20% acima do Free tier
3. **Adicionar testes unitários** — Vitest + @testing-library/react
4. **Deploy Hestia VPS** — executar plano em `docs/deploy-hestia-vps.md`

### 🟠 Alta (próxima sprint)

5. **Dark mode completo** — ativar toggle, corrigir cores hardcoded
6. **Separar server functions** — camada services/ para lógica de negócio
7. **Retenção de dados reduzida** — 14 dias em vez de 28 para economizar DB
8. **Unificar `getDashboard`** — 1 RPC em vez de 2

### 🟡 Média (próximas semanas)

9. Skeleton loaders consistente em toda app
10. Banner de cookies LGPD para analytics
11. Exportar XLSX (SheetJS já é dependência)
12. Histórico de buscas de produto (localStorage)
13. Confirmação em ações destrutivas no Admin
14. `placeholderData` em Dashboard e Produto

### 🟢 Baixa (melhorias contínuas)

15. Título `<title>` dinâmico por rota
16. Atalho `/` para focus search
17. PWA manifest + service worker
18. SEO meta tags por rota
19. Remover `getServerConfig` morto
20. Remover `parseWorkbook` alias

---

## 🚀 Próxima Funcionalidade Recomendada

**🔴 MIGRAÇÃO DO BANCO + DEPLOY VPS — sair do Supabase Free tier**

O DB está 20% acima do limite de 500 MB. Rota definida:

| Rota | Status |
|---|---|
| **MariaDB no VPS + Node.js (Bun SSR)** | Plano em `docs/deploy-hestia-vps.md` e `docs/migracao-vps-autossuficiente.md` |
| **Auth JWT próprio** (bcrypt + jsonwebtoken) | Plano documentado |
| **Deploy**: `gpa.t00ls.dev` via Hestia CP | Template nginx `node-ssr` pronto |

**Recomendação**: Executar deploy Hestia VPS conforme checklist em `docs/deploy-hestia-vps.md`.

---

## Observações

Análise gerada via framework AGENTS.md em 17/07/2026 (atualizada manualmente).

- 🟡 2 arquivos com mais de 300 linhas (sidebar.tsx, types.ts) — considerar refatoração.
- 🔴 .env com service_role key está versionado no git!
- ✅ CSP completo com nonce e strict-dynamic.
- ✅ Rate limiting sliding window (4 tiers) implementado.
- ✅ Turnstile CAPTCHA integrado no login.
- ✅ Atalhos de teclado, command palette, navegação mobile implementados.
- ✅ Exportação PDF disponível em Dashboard, Produto e Área.
