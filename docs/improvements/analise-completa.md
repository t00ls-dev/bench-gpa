# 🔍 Análise Completa — 17/07/2026 23:47

Snapshot automático do estado do código em 17/07/2026 às 23:47.
_Análise abrangente seguindo o framework AGENTS.md (segurança, performance, UX, BD, IA, dívida técnica)._

---

## 📊 Métricas Gerais

| Métrica | Valor |
|---|---|
| Arquivos .ts/.tsx | 109 |
| Total de arquivos no projeto | 143 |
| Linhas de código (src) | 10.754 |
| Linhas totais (projeto) | 18.678 |
| Arquivos grandes (>300 linhas) | 3 |
| Erros de lint | 0 |
| Avisos de lint | 0 |
| Build | ✅ OK |
| TODOs/FIXMEs | 0 |
| Scripts | 10 |
| Migrações SQL | 64 |
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
- **script-src**: 🟡 Ausente (permite inline scripts)
- **style-src**: 🟡 Ausente (permite inline styles)

### Riscos Identificados

🔴 **CRÍTICO**: `SUPABASE_SERVICE_ROLE_KEY` e `SUPABASE_ANON_KEY` estão no `.env` versionado.
   Qualquer pessoa com acesso ao git pode ler/escrever todo o banco (service_role bypassa RLS).
   **Ação**: `echo '.env' >> .gitignore && git rm --cached .env && rotacionar chaves no Supabase`

🟡 CSP incompleto: sem restrição de script-src/style-src.
   Risco de XSS — scripts maliciosos podem executar no contexto da página.
   **Ação**: adicionar `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'`

🔴 **Sem rate limiting server-side** — Supabase Free tier tem 60 req/min, mas o servidor não controla.
   Cliente pode disparar N requisições simultâneas.

🟡 **Logs commitados** — `logs/import.log` e `logs/cron.log` vão para o git.
   Se alguma exceção vazar dados de vendas, fica no histórico para sempre.

---

## 🗄️ Banco de Dados

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

🔴 **Dark mode não implementado** — `styles.css` só tem `:root` (light).
   shadcn/ui gera `.dark` automaticamente se configurado.
   Usuários que preferem tema escuro não têm suporte.

🟡 **Sem skeleton loaders** nas páginas de dashboard/área/produto.
   Upload tem progress bar, mas demais páginas mostram blank durante carregamento.

🟡 **Sem atalhos de teclado** — navegação 100% mouse.
   Sugestão: `g+d` dashboard, `g+p` produto, `/` focus search, `?` atalhos.

🟡 **Sem feedback visual em operações longas** — dashboard/área sem loading state explícito.

🟢 **Busca global** — `cmdk` já está nas deps, mas não há CommandPalette.
   Poderia buscar produtos, lojas, documentação.

🟢 **Navegação mobile** — sidebar funciona mas sem gestos swipe.
   `vaul` já instalado — usar Drawer para navegação mobile.

---

## 🧪 Testes

🔴 **Zero testes unitários** — só scripts Puppeteer E2E (sem assertions robustas).
   Qualquer refactor pode quebrar funcionalidades sem detecção.
   **Ação**: integrar Vitest + @testing-library/react + mocks Supabase.

🟡 **Puppeteer em produção** — `puppeteer` (~300 MB) está em `dependencies` (não `devDependencies`).
   Aumenta desnecessariamente o tamanho do build/deploy.

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
- `sales` table dropada deixou 3+ RPCs órfãs que precisaram migração separada
- Import-watch faz `git pull --rebase --autostash` — risco de conflito se houver commits locais
- `filter_hierarchy` com 22K linhas e 5 índices separados — poderia ser índice composto único
- `.env` não está no `.gitignore` — risco de exposição de secrets
- `client.ts` singleton pattern frágil — erro no init fica silencioso até primeiro acesso

---

## ⚡ Quick Wins

| # | Ação | Tempo | Prioridade |
|---|---|---|---|
| 1 | `echo '.env' >> .gitignore && git rm --cached .env` | 2 min | 🔴 |
| 2 | Rotacionar chaves Supabase (service_role + anon) | 5 min | 🔴 |
| 3 | Mover puppeteer/jspdf para devDependencies | 2 min | 🟡 |
| 4 | Adicionar skeleton loaders nos charts do dashboard | 15 min | 🟡 |
| 5 | Título `<title>` dinâmico por rota | 10 min | 🟢 |
| 6 | Atalho `/` para focus no search de produto | 5 min | 🟢 |
| 7 | Aumentar staleTime de 5min para 10min | 5 min | 🟢 |
| 8 | Adicionar `default-src 'self'` ao CSP | 10 min | 🟡 |

---

## 📋 Recomendações por Prioridade

### 🔴 Críticas (agir imediatamente)

1. **Remover .env do git + rotacionar chaves** — exposição de service_role key
2. **Migrar banco para SQLite ou MariaDB** — DB 20% acima do Free tier
3. **Adicionar testes unitários** — Vitest + @testing-library/react
4. **Rate limiting server-side** — proteger contra abuso do Free tier

### 🟠 Alta (próxima sprint)

5. **Dark mode completo** — bloco `.dark` no CSS + toggle no sidebar
6. **CSP completo** — default-src, script-src, style-src com nonce
7. **Separar server functions** — camada services/ para lógica de negócio
8. **Retenção de dados reduzida** — 14 dias em vez de 28 para economizar DB

### 🟡 Média (próximas semanas)

9. Lazy loading de rotas
10. Virtualização de tabelas (react-virtual)
11. Skeleton loaders
12. Atalhos de teclado
13. Banner de cookies LGPD para analytics
14. Paleta de comandos (cmd+k com cmdk)

### 🟢 Baixa (melhorias contínuas)

16. Exportar CSV em todas as páginas
17. PWA manifest + service worker
18. Gestos swipe para navegação mobile
19. Busca global (cmd+k)
20. SEO meta tags por rota

---

## 🚀 Próxima Funcionalidade Recomendada

**🔴 MIGRAÇÃO DO BANCO — sair do Supabase Free tier**

O DB está 20% acima do limite de 500 MB. Duas rotas:

| Rota | Prós | Contras |
|---|---|---|
| **SQLite** | Zero custo, backup = copiar arquivo, perf excelente para leitura | Sem escrita concorrente (já é o caso — 1 import por vez) |
| **MariaDB (PHP Slim 4)** | Controle total, sem rate limit, ~$10/mês VPS | Reescrever RPCs em PHP, perder Supabase Auth |

**Recomendação**: SQLite + manter Supabase Auth. Vendas em SQLite no servidor.
Docs existentes em `docs/migracao-sqlite.md` e `docs/api-php-mariadb.md`.

---

## Observações

Análise gerada automaticamente via framework AGENTS.md em 17/07/2026.

- 🟡 3 arquivos com mais de 300 linhas — considerar refatoração.
- 🔴 .env com service_role key está versionado no git!
- 🟡 CSP sem script-src — risco de XSS.
