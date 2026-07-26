# Medição de performance das procs de análise

Este documento existe porque a primeira tentativa de otimizar as procs parou num
problema anterior ao código: **não havia como medir**. No MariaDB local o mesmo
bloco variou de 8,6s a 0,9s entre execuções, um índice de teste apareceu sem ter
sido criado, e um índice de cobertura em `depto` não mudou nada. Sem chão, "ficou
mais rápido" é opinião.

A ferramenta é `scripts/bench-procs.sh`. O critério de validade é a **dispersão**
(`max/min`): acima de ~1,3 a medição se declara inválida.

```bash
ssh -i ~/.ssh/gpa-key -p 9767 debian@sv1.t00ls.dev \
  'sudo -u admin bash -s -- --out /tmp/bench-depois' < scripts/bench-procs.sh
```

Ele é somente leitura, recusa rodar sob carga (1 núcleo, 2 usuários) e grava dois
hashes por cenário. Depois de mexer numa proc os hashes **têm** de bater — ganho
de tempo que muda resultado não é ganho.

---

## Baseline — 2026-07-26, 10:20 UTC

Domingo de manhã, `load` 0,00 antes de começar. Dataset: 56 datas
(27/05 a 21/07/2026), 2.750.601 linhas em `sales_prod_daily_agg`.

| Cenário | Mediana | Dispersão |
| --- | ---: | ---: |
| `area_7d_sem_filtro` | 2.114 ms | 1,08x |
| `area_28d_sem_filtro` | 23.011 ms | 1,04x |
| `area_28d_depto` | 24.025 ms | 1,14x |
| `area_28d_loja` | 21.716 ms | 1,03x |
| `area_28d_export` | 23.345 ms | 1,16x |
| `area_28d_busca` | 23.278 ms | 1,07x |
| `rankings_28d` | 32.373 ms | 1,07x |
| `metrics_28d` | **46.342 ms** | 1,11x |
| `filtros_28d` | 222 ms | 1,13x |

Todas as dispersões abaixo de 1,2 — a bateria é válida.

### O que estes números dizem

**1. `dashboard_metrics` é a proc mais cara, não a de Área.** 46s numa janela de
28 dias. Os docs registravam `getDashboardRankings` como "3,8s"; esse valor era
da janela padrão de 7 dias. Em 28 dias são 32s.

**2. Filtrar não alivia — às vezes piora.** Filtrar por departamento custa
*mais* (24,0s) do que não filtrar (23,0s). O padrão
`NOT EXISTS (...) OR col IN (...)`, que aparece 75 vezes no schema, nunca reduz o
conjunto varrido: só acrescenta uma subconsulta por dimensão. O usuário que
restringe a busca esperando alívio paga mais caro.

**3. O custo é superlinear na janela.** 7 dias → 2,1s; 28 dias → 23,0s. Quatro
vezes o dado, onze vezes o tempo.

**4. `pageSize` não é o custo.** A página de 50 linhas (23,0s) e o export de
50.000 (23,3s) custam o mesmo. O teto de `pageSize` limita payload, não CPU.

**5. A causa é varrer a mesma tabela várias vezes por chamada.** Contando no
schema: `dashboard_metrics` faz 4 varreduras de `sales_prod_daily_agg` por
chamada, `dashboard_rankings` faz 5 (uma por agrupamento: depto, seção, grupo,
subgrupo, produto) e `area_analysis` faz 3. Dividindo, dá ~6,5s a ~11,6s por
varredura — consistente entre as três procs.

### O ambiente por trás dos números

| | |
| --- | ---: |
| `sales_prod_daily_agg` — dados | 538 MB |
| `sales_prod_daily_agg` — índices | 714 MB |
| `innodb_buffer_pool_size` | **128 MB** |
| RAM total da VPS | 1.931 MB |
| Swap em uso | 379 MB |

Duas coisas saltam:

- **O buffer pool é o default de fábrica do MariaDB, 128 MB, contra uma tabela de
  1,25 GB.** Razão de 10:1. É a explicação mais provável do item 3: a janela de 7
  dias cabe na memória, a de 28 não, e a partir daí cada varredura volta ao
  disco. `innodb_buffer_pool_size` é ajustável a quente no MariaDB 11.4, mas a
  VPS já tem 379 MB em swap — não é memória livre esperando ser usada.
- **Os índices custam mais que a tabela** (714 contra 538 MB). Quatro deles são
  de categoria (`depto`, `secao`, `grupo`, `subgrupo`), e o item 2 mostra que
  eles não estão sendo usados para filtrar. Vale investigar removê-los — mas
  atenção: derrubar índice secundário **não** acelera varredura da chave
  primária. O ganho esperado é indireto (menos disputa pelo buffer pool, import
  mais rápido, backup menor), e portanto precisa ser medido, não presumido.

### Como comparar depois de uma mudança

```bash
diff <(cut -f1,3,7,8,9 antes/results.tsv) <(cut -f1,3,7,8,9 depois/results.tsv)
```

As colunas de hash têm de ser idênticas. As de tempo são o resultado.
