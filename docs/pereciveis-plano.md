# Plano: Filtrar Plataforma para Somente Perecíveis

## Objetivo

Reduzir o banco de dados de ~600 MB para ~227 MB, resolvendo o estouro do Free tier do Supabase (limite 500 MB), mantendo apenas dados do departamento **PERECIVEIS**.

---

## Cenário Atual (Jul/2026)

| Item | Valor |
|---|---|
| DB total | ~600 MB (acima do limite Free de 500 MB) |
| `sales_prod_daily_agg` | 523 MB (237 dados + 287 índices) |
| `sales_daily_agg` | ~95 MB |
| Crescimento diário | ~18,7 MB/dia |

## Distribuição por Departamento

| Depto | Linhas | % |
|---|---|---|
| MERCEARIA | 222.719 | 56,6% |
| **PERECIVEIS** | **155.150** | **39,5%** |
| BAZAR | 13.643 | 3,5% |
| PROJETOS ESPECIAIS | 1.039 | 0,3% |
| TEXTIL | 660 | 0,2% |

## Resultado Esperado

| Item | Depois |
|---|---|
| DB total | ~227 MB ✅ (abaixo dos 500 MB) |
| `sales_prod_daily_agg` | ~207 MB (economia de 316 MB) |
| `sales_daily_agg` | ~37 MB (economia de 57 MB) |
| Economia total | ~373 MB |
| Crescimento diário | ~7,4 MB/dia |
| Limite Free (500 MB) | Nunca atingido em regime permanente |

---

## Etapas de Implementação

### 1. Deletar dados não-PERECIVEIS existentes

SQL único a ser executado no banco:

```sql
DELETE FROM sales_prod_daily_agg WHERE depto != 'PERECIVEIS';
DELETE FROM sales_daily_agg      WHERE depto != 'PERECIVEIS';
```

### 2. Filtrar pipeline de import — RPC `finalize_import`

Arquivo: `supabase/migrations/20260711220000_eliminate_sales_dependency.sql`

Adicionar `AND s.depto = 'PERECIVEIS'` nos INSERTs de `sales_daily_agg` e `sales_prod_daily_agg`.

```sql
-- sales_daily_agg
INSERT INTO sales_daily_agg (...)
SELECT ...
FROM staging_sales s
WHERE s.batch_id = p_batch_id
  AND s.depto = 'PERECIVEIS'    -- <-- adicionar
GROUP BY ...;

-- sales_prod_daily_agg
INSERT INTO sales_prod_daily_agg (...)
SELECT ...
FROM staging_sales s
WHERE s.batch_id = p_batch_id
  AND s.depto = 'PERECIVEIS'    -- <-- adicionar
GROUP BY ...;
```

### 3. Filtrar pipeline de import — RPC `refresh_sales_daily_agg`

Mesmo arquivo, mesma lógica: adicionar `AND depto = 'PERECIVEIS'` nos WHERE dos INSERTs.

### 4. Filtrar pipeline de import — `scripts/import.ts`

Adicionar filtro de departamento no laço de agregação (linhas ~124-158):

```ts
if (r.depto !== 'PERECIVEIS') continue;  // <-- adicionar
```

### 5. Frontend: fixar departamento PERECIVEIS

Em `src/components/filter-bar.tsx`:

- Pré-selecionar `deptos: ['PERECIVEIS']` no estado inicial
- Opcionalmente ocultar/desabilitar o `MultiSelect` de departamento

```tsx
const defaultDeptos = ['PERECIVEIS'];
```

### 6. (Opcional) Limpar produtos órfãos

```sql
DELETE FROM products
WHERE prod_code NOT IN (
  SELECT DISTINCT prod_code FROM sales_prod_daily_agg
);
```

---

## O Que NÃO Precisa Mudar

- Schema do banco (zero migrations novas; as alterações são nas RPCs existentes)
- Parser XLSX (`src/lib/xlsx-parser.ts`)
- `purge_old_aggs` (opera por data, não por depto)
- `filter_hierarchy` (se `sales_daily_agg` só tiver perecíveis, o refresh automático reflete)
- RPCs analíticas (`dashboard_metrics`, `dashboard_rankings`, `product_analysis`, `area_analysis`, etc. — continuam funcionando; o cliente preenche `p_deptos`)
- Autenticação / RLS
- Cron job `import-watch.ts` (chama `cli:import` que será modificado)

## Risco

**Baixo.** A coluna `depto` já existe em todas as tabelas como `text`, tem índice (`spda_hier_idx`, `sda_hier_idx`), e o filtro `depto = 'PERECIVEIS'` é uma operação banal para o PostgreSQL. Nenhuma mudança de schema é necessária.

## Metodologia da Estimativa

Tamanhos de tabela obtidos via `pg_total_relation_size`. Distribuição por departamento via paginação completa de `sales_daily_agg` (393.211 linhas). Tamanho de `sales_daily_agg` estimado por proporção de colunas vs `sales_prod_daily_agg`. `sales_prod_daily_agg` (1.373.123 linhas) assume distribuição similar.
