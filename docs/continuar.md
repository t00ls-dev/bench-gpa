# Onde parar e por onde retomar

Estado em **2026-07-26**. Este documento existe para a próxima sessão não ter de
reconstruir contexto a partir do histórico do git.

## Como trabalhar aqui

- **Branch + PR, nunca commit direto na `main`.** Push na `main` dispara deploy em
  produção; PR roda o CI sem deployar. Não existe ambiente de teste ainda.
- **Testar antes de commitar:** `bun run check`, e validação contra o MariaDB
  local quando a mudança tocar banco ou auth.
- **Se mexer nas procs de análise**, as duas ferramentas são um par e nenhuma
  basta sozinha: `scripts/bench-procs.sh` mede o custo em prod e
  `scripts/validate-procs.sh` prova que o resultado não mudou (37 cenários, dois
  hashes cada). Uma proc mais rápida que devolve outro número é um bug mais
  rápido. Detalhes em `docs/medicao-performance.md`.
- Merges próximos no tempo colapsam em um deploy só (o CI da `main` tem
  `cancel-in-progress: true`), o que reduz a janela de indisponibilidade.

## O que foi feito nesta rodada

Sete PRs mergeados. Os quatro primeiros (#4 a #6) fecharam segurança e
centralização de constantes. Os três últimos foram o trabalho de performance:

| PR | O quê | Resultado |
| --- | --- | --- |
| #7 | Protocolo de medição (`scripts/bench-procs.sh`) + baseline | Base de tudo o que veio depois |
| #9 | Uma varredura em vez de N nas três procs de análise | Duas acertaram, uma regrediu |
| #10 | Reverte só `area_analysis` | Regressão desfeita |

Ganhos que **ficaram em produção**, medidos com o harness:

| proc | antes | depois |
| --- | ---: | ---: |
| `dashboard_metrics` | 46,3s | **10,1s** |
| `dashboard_rankings` | 32,4s | **19,0s** |

`area_analysis` continua em ~23s numa janela de 28 dias, e há um aviso no
cabeçalho da proc explicando por que a reescrita óbvia não funciona ali.

**PR #11 está aberto e não mergeado** — corrige comentários com números
obsoletos. Docs apenas, sem mudança de comportamento.

## Aberto, em ordem de valor

### 1. O piso de I/O (decisão do usuário, não técnica)

`sales_prod_daily_agg` tem 1,25 GB (538 MB de dados + 714 MB de índices) contra
`innodb_buffer_pool_size` de **128 MB — o default de fábrica, nunca ajustado**.

O sintoma medido: a mesma operação custa 2,0 µs por linha na janela de 7 dias e
5,5 µs na de 28. É o conjunto deixando de caber na memória. Enquanto isso existir,
toda proc opera sobre um piso de disco.

`innodb_buffer_pool_size` é ajustável a quente no MariaDB 11.4. **Mas** a VPS tem
1,9 GB, já usa 379 MB de swap, e o page cache do SO está absorvendo parte do I/O —
não é memória livre esperando. O usuário optou por não seguir com isto por ora.

### 2. Os quatro índices de categoria

`depto`, `secao`, `grupo`, `subgrupo` em `sales_prod_daily_agg`. A medição mostra
que **não filtram** (filtrar por departamento custa *mais* que não filtrar). Os
índices somam mais que os dados.

⚠️ Derrubá-los **não** acelera varredura de chave primária. O ganho seria indireto
— menos disputa pelo buffer pool, import mais rápido, backup menor — e continua
**não medido**. Medir antes, com `scripts/bench-procs.sh`, e comparar os hashes.

### 3. `product_analysis` faz 7 varreduras

Nunca entrou no baseline. Provavelmente não sofre do mesmo problema porque filtra
por um `prod_code` só, o que usa índice — mas isso é suposição, não medição.
Acrescentar um cenário ao harness antes de qualquer conclusão.

### 4. Constantes que ficaram de fora do PR #6

Foram adiadas para não conflitar com PRs em revisão na época:

- `admin.functions.ts:358` — `schedule: "diária, 03h"` é transcrição manual da
  expressão em `scripts/setup-crons.sh`. Mudar a cron não atualiza o painel.
- `migrate-schema.sql` — `COALESCE(p_days, 180)` em `purge_old_aggs` é a outra
  ponta de `RETENTION_DAYS`, do lado do SQL.

### 5. Constantes de UI

17 ocorrências de `staleTime`/`gcTime` formando uma escala implícita sem nome; as
opções de paginação duplicadas como union type (`area.page.tsx:144`) e como
literais JSX em `area-table.tsx`; debounce 300 na paleta contra 250 na busca de
produto, mesmo propósito. Nota: os dois `60_000` da query `["me"]` são duplicação
**deliberada e comentada** — precisam concordar.

### 6. Refresh incremental por `sale_date`

`refresh_product_universe` e `refresh_filter_hierarchy` regeneram a tabela inteira
a cada import. É redesenho, não ajuste.

### 7. Reescrita de histórico

~41 MiB de XLSX em blobs permanentes no `.git`. Aprovado pelo usuário, mas o valor
caiu quando a proteção de branch foi descartada. Mais seguro agora que nenhuma
cron faz `git pull`.

## Decidido NÃO fazer

- **Proteção de branch** — exige GitHub Pro (repo privado em plano grátis) e
  quebraria o auto-push do `import-watch`. Descartado por custo.
- **Alerta de dado obsoleto** — o footer já mostra a data da última venda.
- **Badges no README.**
- **"Erro de módulo" e "servidor off"** — diagnóstico fechado (é a janela de
  deploy: `.output.old` apagado no `ci.yml` e restart do PM2 em fork mode não é
  zero-downtime). Correção não aplicada por decisão do usuário.
- **SEO/OG** — já removidos; o `robots.txt` fica, porque bloquear indexação é o
  objetivo.

## Armadilhas conhecidas

Estão em `docs/medicao-performance.md`, mas as duas que mais custaram:

1. **Índice não resolve a janela de 28 dias.** São metade das datas do banco;
   nenhum índice ajuda quem precisa de metade das linhas. Varrer é o plano certo.
2. **O controle de um experimento tem de reproduzir a consulta inteira**,
   predicados de filtro incluídos. Foi o erro que levou à regressão do #9: o
   controle omitia os mesmos predicados que a variante candidata, bateu com a proc
   real dentro de 7% no cenário onde as duas se comportam igual, e eu li isso como
   fidelidade. Se replicar a proc inteira for inviável, criar a proc candidata com
   outro nome e medi-la pelo harness.
3. **Medições locais não são confiáveis** para estas procs — o mesmo bloco variou
   de 8,6s a 0,9s. Medir em prod, em janela de baixo uso, com o harness.
