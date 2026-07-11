## Diagnóstico

A RPC `area_analysis` (ramo com paginação) monta o array final com:

```sql
SELECT jsonb_agg(jsonb_build_object(...))   -- SEM ORDER BY interno
FROM paged p LEFT JOIN last_sale ls ...
```

Apesar da CTE `paged` estar ordenada corretamente, o `LEFT JOIN` e o `jsonb_agg` sem `ORDER BY` **não preservam a ordem** das linhas. O Postgres é livre para embaralhar — é exatamente por isso que às vezes um item de venda menor aparece acima de um maior, sem lógica aparente. A ordenação da CTE só afeta o `LIMIT/OFFSET`, não a saída do `jsonb_agg`.

Além disso, a coluna "Dias sem venda" (`sortKey = "daysSince"`) é enviada pelo cliente, mas a RPC não tem `CASE` para ela — ordenação por essa coluna cai no fallback `prod_code`, dando a impressão de "ordem aleatória".

## Correção (migration única)

Recriar `public.area_analysis` com dois ajustes no ramo paginado:

1. Adicionar `ORDER BY` **dentro** do `jsonb_agg`, replicando a mesma expressão de ordenação usada em `paged` (val/prod_code/prod_name/daysSince + tiebreaker por `prod_code`). Isso garante que a ordem retornada ao cliente é exatamente a que foi paginada.
2. Suportar `p_sort_by = 'daysSince'`:
   - Calcular `last_sale_date` **antes** da paginação (mover `last_sale` para rodar em cima de `filtered`, não de `paged`).
   - Adicionar branches `CASE WHEN p_sort_by = 'daysSince' ...` ordenando por `last_sale_date` (asc = mais dias sem venda primeiro → `last_sale_date ASC NULLS FIRST`; desc = inverso).
3. Aplicar o mesmo `ORDER BY` interno também no ramo sem paginação (`p_page IS NULL`), por consistência (já tem `ORDER BY` no agg, mas fica documentado).

Assinatura, parâmetros e shape do JSON de retorno permanecem idênticos — nenhuma alteração no cliente ou em `types.ts`.

## Arquivos alterados

- **Nova migration**: recria `public.area_analysis(...)` com as correções acima.

Nenhuma mudança em código TS/React.
