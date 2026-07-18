# Análise Completa

> Data: 18/07/2026 13:04

Snapshot automático do estado do código em 18/07/2026 às 13:04.
_Análise abrangente seguindo o framework AGENTS.md (segurança, performance, UX, BD, IA, dívida técnica)._

---

## 📊 Métricas Gerais

| Métrica | Valor |
|---|---|
| Arquivos .ts/.tsx | 126 |
| Total de arquivos no projeto | 158 |
| Linhas de código (src) | 12.462 |
| Linhas totais (projeto) | 17.591 |
| Arquivos grandes (>300 linhas) | 3 |
| Erros de lint | 0 |
| Avisos de lint | 0 |
| Build | ✅ OK |
| TODOs/FIXMEs | 0 |
| Scripts | 11 |
| Migrações SQL | 67 |
| RPCs distintas usadas | 10 |

---

## ⚙️ Lint

Nenhum problema encontrado.
---

## 🔒 Segurança

### Credenciais e Exposição

- **.env versionado**: 🔴 SIM — service_role key exposta no repositório! (⚠️ .env não está no .gitignore)
- **.env no gitignore**: 🔴 Não
- **Arquivo .env existe localmente**: ⚠️ Sim

### Content Security Policy

- **frame-ancestors**: ✅ Configurado
- **script-src**: ✅ Configurado
- **style-src**: ✅ Configurado

### Riscos Identificados

🔴 **CRÍTICO**: `SUPABASE_SERVICE_ROLE_KEY` e `SUPABASE_ANON_KEY` estão no `.env` versionado.
   Qualquer pessoa com acesso ao git pode ler/escrever todo o banco (service_role bypassa RLS).
   **Ação**: `echo '.env' >> .gitignore && git rm --cached .env && rotacionar chaves no Supabase`

✅ **Rate limiting ativo** — 5 server functions protegidas (lib/mw).

✅ **Logs fora do git** — `logs/` no .gitignore, nenhum arquivo rastreado.

---

## 🗄️ Banco de Dados

- **Migrações**: 67 arquivos SQL
- **RPCs em uso**: `has_role` (4x), `dashboard_metrics` (1x), `product_search` (1x), `get_product_by_code` (1x), `product_analysis` (1x), `area_analysis` (1x), `area_filter_hierarchy` (1x), `filter_options` (1x), `dashboard_rankings` (1x), `imported_dates` (1x)
- **Import log**: Não encontrado

### Problemas Conhecidos

🔴 **DB ~600 MB acima do Free tier (500 MB)** — risco de suspensão.
   - `sales_prod_daily_agg`: ~523 MB (237 dados + 287 índices)
   - `sales_daily_agg`: ~95 MB
   - **Ação**: migrar para MariaDB no VPS (`docs/migracao-vps-autossuficiente.md`)

🟡 **Sem seed data** — nenhum `seed.sql` para popular ambiente dev.

🟡 **Duas versões de `purge_old_aggs`** coexistiram em migrations — a 00001 sobrescreve a 00000.

---

## ⚡ Performance

### Arquivos Grandes (>300 linhas)

- `src/components/ui/sidebar.tsx` — 745 linhas
- `src/integrations/supabase/types.ts` — 504 linhas
- `src/components/ui/chart.tsx` — 321 linhas

### Oportunidades

✅ **Lazy loading de rotas** — true páginas splitadas (\`.tsx\` + \`.page.tsx\`).

🟢 **Chunks de servidor** — Nitro separa automaticamente libs grandes em chunks dedicados.
🟡 **Sem virtualização em tabelas** — `area-table.tsx` renderiza todas as linhas no DOM.
   `@tanstack/react-virtual` pode reduzir nodes renderizados em 90%+.

🟢 **Código duplicado**: verificar padrões de `supabase.rpc(...)` com mesmos parâmetros.
   10 RPCs diferentes em uso — verificar se alguma é chamada redundantemente.

---

## 🎨 UX/UI

✅ **Atalhos de teclado** — `useGotoHotkey` disponível (g+d, g+p, g+a, etc). Help overlay com Shift+/.

✅ **Skeleton loaders** presentes nas páginas de rota.

✅ **Command Palette** ativa (Cmd+K) — busca entre rotas e produtos.

🟡 **Dark mode** — tema travado em light por decisão de projeto, `.dark` CSS mantido para futuro.

🟢 **Navegação mobile** — Bottom tab bar com 4 abas + vaul Drawer para admin.

---

## 🧪 Testes

🔴 **Zero testes unitários** — só scripts Puppeteer E2E (sem assertions robustas).
   Qualquer refactor pode quebrar funcionalidades sem detecção.
   **Ação**: integrar Vitest + @testing-library/react + mocks Supabase.

✅ **Puppeteer movido para devDependencies** — puppeteer (~300 MB) não entra mais no build de produção.

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

## 🏗️ Dívida Técnica

- `admin-utils.ts` duplica lógica de `has_role` que já existe em `auth-middleware.ts`
- Duas versões de `purge_old_aggs` (00000 e 00001) — a 00000 deveria ser dropada
- `sales` table dropada deixou RPCs órfãs que foram limpos na migration 20260718000001
- Import-watch faz `git pull --rebase --autostash` — risco de conflito se houver commits locais
- `filter_hierarchy` com 22K linhas e 5 índices separados — poderia ser índice composto único
- `client.ts` singleton pattern frágil — erro no init fica silencioso até primeiro acesso

---

## ⚡ Quick Wins

| # | Ação | Tempo | Prioridade |
|---|---|---|---|
| 1 | `echo '.env' >> .gitignore && git rm --cached .env` | 2 min | 🔴 |
| 2 | Rotacionar chaves Supabase (service_role + anon) | 5 min | 🔴 |
| 3 | Mover puppeteer/jspdf para devDependencies | 2 min | 🟡 |
| 4 | Título `<title>` dinâmico por rota | 10 min | 🟢 |
| 5 | Aumentar staleTime de 5min para 10min | 5 min | 🟢 |
| 6 | Adicionar `default-src 'self'` ao CSP | 10 min | 🟡 |
| 7 | ✅ Skeleton loaders | ✅ Feito | ✅ |
| 8 | ✅ Atalho `/` + g+letra | ✅ Feito | ✅ |

---

## 📋 Recomendações por Prioridade

### 🔴 Críticas (agir imediatamente)

1. **Remover .env do git + rotacionar chaves** — exposição de service_role key
2. **Migrar banco para MariaDB (VPS)** — DB 20% acima do Free tier (~600 MB)
3. **Adicionar testes unitários** — Vitest + @testing-library/react
4. ✅ **Rate limiting** — já ativo em ${rateLimitInUse} server functions

### 🟠 Alta (próxima sprint)

5. **CSP completo** — default-src, script-src, style-src com nonce
6. **Separar server functions** — camada services/ para lógica de negócio
7. **Retenção de dados reduzida** — 14 dias em vez de 28 para economizar DB
8. **Deploy Hestia VPS** — `gpa.t00ls.dev` com MariaDB + JWT próprio

### 🟡 Média (próximas semanas)

9. ✅ Lazy loading de rotas
10. Virtualização de tabelas (react-virtual)
11. ✅ Skeleton loaders
12. ✅ Atalhos de teclado (g+letra)
13. Banner de cookies LGPD para analytics
14. ✅ Paleta de comandos (Cmd+K)
15. ✅ Busca global (Cmd+K com cmdk)

### 🟢 Baixa (melhorias contínuas)

16. Exportar CSV em todas as páginas
17. PWA manifest + service worker
18. Gestos swipe para navegação mobile
19. SEO meta tags por rota

---

## 🚀 Próxima Funcionalidade Recomendada

**🔴 MIGRAÇÃO VPS AUTOSSUFICIENTE — sair do Supabase**

O DB está 20% acima do limite de 500 MB. Plano definido:

| Rota | Prós | Contras |
|---|---|---|
| **VPS Autossuficiente** | MariaDB local, JWT próprio, sem rate limit, zero custo extra de DB | Requer deploy manual (templates nginx, SSL, Bun, PM2) |

**Recomendação**: seguir `docs/migracao-vps-autossuficiente.md` — deploy em `gpa.t00ls.dev`.

---

## Observações

Análise gerada automaticamente via framework AGENTS.md em 18/07/2026.

- 🟡 3 arquivos com mais de 300 linhas — considerar refatoração.
- 🔴 .env com service_role key está versionado no git!
