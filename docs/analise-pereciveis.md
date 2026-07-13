# Análise: Manter Somente Perecíveis

## Cenário atual (Jul/2026)

| Item | Valor |
|---|---|
| DB total | ~600 MB (acima do limite Free de 500 MB) |
| `sales_prod_daily_agg` | 523 MB (237 dados + 287 índices) |
| `sales_daily_agg` | ~95 MB |
| Crescimento diário (28 dias, 4/DOW) | ~18,7 MB/dia |

## Distribuição por departamento (sales_daily_agg)

| Depto | Linhas | % |
|---|---|---|
| MERCEARIA | 222.719 | 56,6% |
| **PERECIVEIS** | **155.150** | **39,5%** |
| BAZAR | 13.643 | 3,5% |
| PROJETOS ESPECIAIS | 1.039 | 0,3% |
| TEXTIL | 660 | 0,2% |
| **Total** | **393.211** | **100%** |

## Após manter só PERECIVEIS

| Item | Depois |
|---|---|
| DB total | ~227 MB ✅ (abaixo dos 500 MB) |
| `sales_prod_daily_agg` | ~207 MB (economia de 316 MB) |
| `sales_daily_agg` | ~37 MB (economia de 57 MB) |
| Economia total | ~373 MB |
| Crescimento diário | ~7,4 MB/dia |
| Limite Free (500 MB) | Nunca atingido em regime permanente |

## Observações

- A proporção de 39,5% foi obtida por varredura completa de `sales_daily_agg` (393.211 linhas).
- `sales_prod_daily_agg` (1.373.123 linhas) deve seguir distribuição similar pois representa os mesmos dados em granularidade por produto.
- Estimativas consideram tamanho de registro proporcional; índices foram rateados pela mesma proporção.
- Para implementar, seria necessário:
  1. Deletar os registros não-PERECIVEIS de `sales_prod_daily_agg` e `sales_daily_agg`
  2. Ajustar o pipeline de import (`finalize_import` RPC ou `scripts/import.ts`) para filtrar apenas `depto = 'PERECIVEIS'`
  3. Possivelmente limpar `products` e `stores` órfãos

## Metodologia

Tamanhos de tabela obtidos via `pg_total_relation_size`. Distribuição por departamento via paginação completa de `sales_daily_agg`. Tamanho de `sales_daily_agg` estimado por proporção de colunas vs `sales_prod_daily_agg`.
