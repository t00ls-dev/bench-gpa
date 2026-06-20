
## Visão geral

Esta entrega cobre três blocos de trabalho:

1. **Ajustes gerais de UI/UX** em toda a aplicação.
2. **Expansão dos rankings do Dashboard** (Seções, Grupos, Subgrupos e Produtos, além de Departamentos).
3. **Nova funcionalidade "Análises Personalizadas"** dentro de Análise de Área, com persistência por usuário no backend.

---

## 1. Ajustes gerais

### 1.1 Remoção de travessões (—)
- Varredura em todo `src/` substituindo `—` por:
  - **dois pontos** (`:`) quando separa rótulo de valor (ex.: "1513 — Loja Centro" → "1513: Loja Centro");
  - **parênteses** quando é informação acessória;
  - **quebra de linha** ou separador visual (border/spacing) quando estrutural.

### 1.2 Filtros padronizados
- O `MultiSelect` do `FilterBar` (checkbox + "Selecionar todos" + "Limpar seleção") já é o padrão. Garantir que **todas as páginas** (Dashboard, Produto, Queda, Área) usem `FilterBar` ou o mesmo `MultiSelect`, sem variações locais.

### 1.3 Restrição de acesso administrativo
- Páginas **Importar** (`/upload`) e **Usuários** (`/admin`) só para administradores.
- Implementação: `beforeLoad` em cada rota chama `has_role(uid, 'admin')` via server function; usuários não-admin recebem `redirect({ to: '/' })`.
- Esconder também os itens do menu lateral para não-admins.

### 1.4 Tabelas: espaçamento e larguras
- Revisar paddings (`px-3`/`py-2`) e larguras mínimas em todas as tabelas do projeto.
- Em **Análise de Área**, aumentar a separação entre as colunas **Vendas** e **Part. %** (espaçamento maior + alinhamento à direita com largura fixa).

### 1.5 Exportar CSV
- Remover botão e função de export CSV da página Análise de Área. PDF permanece.

---

## 2. Dashboard: rankings expandidos

Hoje existe apenas **Top Departamentos**. Vamos adicionar, com o mesmo componente visual, filtros e ordenação:

- Top Seções
- Top Grupos
- Top Subgrupos
- Top Produtos

**Backend:** estender `dashboard_metrics` (ou criar `dashboard_rankings`) para retornar `bySecao`, `byGrupo`, `bySubgrupo`, `byProduto` (top N por `val_vda`).

**Frontend:** abstrair o card atual em um componente `RankingCard` reutilizável e renderizar 5 cards (Departamento, Seção, Grupo, Subgrupo, Produto).

---

## 3. Análises Personalizadas (nova funcionalidade)

### 3.1 Modelo de dados (migration)

```text
custom_analyses
  id uuid pk
  user_id uuid fk auth.users
  name text
  created_at, updated_at

custom_analysis_items
  id uuid pk
  analysis_id uuid fk custom_analyses on delete cascade
  prod_code text
  created_at
  unique(analysis_id, prod_code)
```

- RLS: `user_id = auth.uid()` em todas as operações.
- GRANTs para `authenticated` e `service_role`.
- Trigger `updated_at` em `custom_analyses` (inclusive quando itens mudam — atualizar via server fn).

### 3.2 Server functions (`src/lib/custom-analyses.functions.ts`)
- `listCustomAnalyses()` → nome, contagem de itens, updated_at.
- `createCustomAnalysis({ name })`.
- `renameCustomAnalysis({ id, name })`.
- `deleteCustomAnalysis({ id })`.
- `duplicateCustomAnalysis({ id })`.
- `getCustomAnalysis({ id })` → itens com info de produto (join `products` + última hierarquia conhecida em `sales`).
- `addProductToAnalysis({ id, prodCode })` → valida existência em `products`, retorna info; erro amigável se inexistente ou duplicado.
- `removeProductFromAnalysis({ id, prodCode })`.
- `customAnalysisResults({ id, dateFrom, dateTo, stores, ... })` → reaproveita lógica de `area_analysis`, filtrando por `prod_code IN (itens)`.

Todas com `requireSupabaseAuth`.

### 3.3 UI

Dentro de `/area`, adicionar um topo com duas abas: **Análise de Área** (atual) e **Análises Personalizadas**.

**Lista de análises personalizadas:**
- Botão "Nova Análise Personalizada" (modal pedindo nome).
- Cards/linhas: nome, qtd produtos, última atualização.
- Ações: Abrir, Renomear, Duplicar, Favoritar, Excluir (com `AlertDialog` de confirmação irreversível).
- Seção "Últimas acessadas" (persistida em `localStorage` por usuário).

**Editor da análise:**
- Cabeçalho: nome editável + contador de produtos em tempo real.
- Campo "Adicionar PLU" com validação inline (aparece descrição após inclusão).
- Campo de busca por PLU/descrição dentro da análise.
- Tabela: PLU, Descrição, Depto, Seção, Grupo, Subgrupo, ação Remover.
- Ordenação por PLU, descrição, venda, participação.
- Paginação (50/página).
- Indicador visual quando PLU não existe mais em `products` (badge "Inexistente").

**Visualização de resultados:**
- Mesma estrutura visual de Análise de Área (KPIs, tabela detalhada).
- Filtros: período + loja/depto/seção (cascata como hoje).
- Botão "Exportar PDF" (sem CSV).

### 3.4 Persistência e segurança
- RLS força isolamento por `user_id`.
- Frontend usa apenas server functions autenticadas; nenhuma query direta no client.

---

## Técnico (resumo)

- **Migrations:** 1 migration criando `custom_analyses`, `custom_analysis_items`, GRANTs, RLS, triggers; 1 migration atualizando `dashboard_metrics` (ou nova `dashboard_rankings`).
- **Server fns:** `src/lib/custom-analyses.functions.ts` + extensão de `analytics.functions.ts` para rankings.
- **Rotas:** mover gates em `_authenticated/upload.tsx` e `_authenticated/admin.tsx` (admin only); manter `/area` e adicionar subview de análises personalizadas (abas internas, não rota nova, para preservar filtros e estado).
- **Componentes:** `RankingCard` reutilizável; ajustes em `FilterBar`/tabelas.
- **Varredura:** script `rg "—"` em `src/` para localizar travessões e substituir caso a caso.

---

## Pontos para confirmação antes de iniciar

1. **Travessões:** confirmo a regra de substituição "X — Y" → "X: Y" (ex.: "1513 — Loja Centro" vira "1513: Loja Centro")?
2. **Top Produtos no Dashboard:** quantos itens por ranking? Sugiro top 10, igual ao padrão atual.
3. **Análises Personalizadas:** abas internas dentro de `/area`, ou rota separada `/area/personalizadas`? Sugiro abas para manter contexto.
4. **Favoritos / últimas acessadas:** ok manter em `localStorage` (sem persistência cross-device)?
