# Medição de performance das procs de análise

Este documento existe porque a primeira tentativa de otimizar as procs parou num
problema anterior ao código: **não havia como medir**. No MariaDB local o mesmo
bloco variou de 8,6s a 0,9s entre execuções, um índice de teste apareceu sem ter
sido criado, e um índice de cobertura em `depto` não mudou nada. Sem chão, "ficou
mais rápido" é opinião.

## As duas ferramentas

São um par, e nenhuma das duas basta sozinha. Tempo sem correção não vale nada:
uma proc mais rápida que devolve outro número é um bug mais rápido.

### `scripts/bench-procs.sh`: quanto custa

Mede em produção, com o cronômetro dentro da sessão SQL. O critério de validade é
a **dispersão** (`max/min`): acima de ~1,3 a medição se declara inválida. Somente
leitura, e recusa rodar sob carga (1 núcleo, 2 usuários).

```bash
ssh -i ~/.ssh/gpa-key -p 9767 debian@sv1.t00ls.dev \
  'sudo -u admin bash -s -- --out /tmp/bench-depois' < scripts/bench-procs.sh
```

### `scripts/validate-procs.sh`: se o resultado mudou

37 cenários sobre as três procs, cada um com dois hashes. Roda no banco local.

```bash
scripts/validate-procs.sh /tmp/antes.txt          # com o schema atual
# edite migrate-schema.sql e reaplique no banco local
scripts/validate-procs.sh /tmp/depois.txt
diff /tmp/antes.txt /tmp/depois.txt               # vazio = aprovado
```

Os cenários não são "alguns casos": cada um cobre um caminho que já quebrou ou
que a reescrita de 26/07 tocou: datas nulas, período vazio, as quatro
ordenações mais um `p_sort_by` inválido, e busca com e sem match, que exercita os
**dois ramos do PREPARE** de `area_analysis` (contagens de placeholder
diferentes, e contagem de placeholder é erro de execução, não de compilação).

Dois hashes por cenário porque empate de ordenação é não-determinístico: se
`ordem` divergir mas `conjunto` bater, é empate; se `conjunto` divergir, é dado
diferente, e isso é sério.

### Como testar uma variante de proc

**Não** comparar SQL avulso que imita a proc: foi exatamente esse atalho que
levou à regressão de 26/07 (ver adiante). O caminho certo:

1. criar a proc candidata com **outro nome**, com o corpo completo;
2. medir com `bench-procs.sh` (aceita `--scenario`);
3. provar correção com `validate-procs.sh`;
4. derrubar a candidata.

---

## Baseline: 2026-07-26, 10:20 UTC

Domingo de manhã, `load` 0,00 antes de começar. Dataset: 56 datas
(27/05 a 21/07/2026), 2.750.601 linhas em `sales_prod_daily_agg`.

| Cenário               |       Mediana | Dispersão |
| --------------------- | ------------: | --------: |
| `area_7d_sem_filtro`  |      2.114 ms |     1,08x |
| `area_28d_sem_filtro` |     23.011 ms |     1,04x |
| `area_28d_depto`      |     24.025 ms |     1,14x |
| `area_28d_loja`       |     21.716 ms |     1,03x |
| `area_28d_export`     |     23.345 ms |     1,16x |
| `area_28d_busca`      |     23.278 ms |     1,07x |
| `rankings_28d`        |     32.373 ms |     1,07x |
| `metrics_28d`         | **46.342 ms** |     1,11x |
| `filtros_28d`         |        222 ms |     1,13x |

Todas as dispersões abaixo de 1,2: a bateria é válida.

### O que estes números dizem

**1. `dashboard_metrics` é a proc mais cara, não a de Área.** 46s numa janela de
28 dias. Os docs registravam `getDashboardRankings` como "3,8s"; esse valor era
da janela padrão de 7 dias. Em 28 dias são 32s.

**2. Filtrar não alivia, às vezes piora.** Filtrar por departamento custa
_mais_ (24,0s) do que não filtrar (23,0s). O padrão
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
varredura, consistente entre as três procs.

### O ambiente por trás dos números

|                                 |            |
| ------------------------------- | ---------: |
| `sales_prod_daily_agg`: dados   |     538 MB |
| `sales_prod_daily_agg`: índices |     714 MB |
| `innodb_buffer_pool_size`       | **128 MB** |
| RAM total da VPS                |   1.931 MB |
| Swap em uso                     |     379 MB |

Duas coisas saltam:

- **O buffer pool é o default de fábrica do MariaDB, 128 MB, contra uma tabela de
  1,25 GB.** Razão de 10:1. É a explicação mais provável do item 3: a janela de 7
  dias cabe na memória, a de 28 não, e a partir daí cada varredura volta ao
  disco. `innodb_buffer_pool_size` é ajustável a quente no MariaDB 11.4, mas a
  VPS já tem 379 MB em swap. Não é memória livre esperando ser usada.
- **Os índices custam mais que a tabela** (714 contra 538 MB). Quatro deles são
  de categoria (`depto`, `secao`, `grupo`, `subgrupo`), e o item 2 mostra que
  eles não estão sendo usados para filtrar. Vale investigar removê-los, mas
  atenção: derrubar índice secundário **não** acelera varredura da chave
  primária. O ganho esperado é indireto (menos disputa pelo buffer pool, import
  mais rápido, backup menor), e portanto precisa ser medido, não presumido.

---

## Experimento 1: uma varredura em vez de cinco (`dashboard_rankings`)

Feito em prod, somente com `TEMPORARY TABLE` (escopo de sessão, some ao
desconectar): nada de proc alterada, índice criado ou escrita persistente. Três
variantes, três repetições cada, aquecimento descartado.

| Variante                                                                   |       Mediana | Hash do conjunto |
| -------------------------------------------------------------------------- | ------------: | ---------------- |
| **A** (como a proc faz hoje): 5 varreduras, predicado `(? IS NULL OR ...)` |     30.677 ms | `6664a8c02aff`   |
| **B**: 5 varreduras, predicado de data direto                              |     31.849 ms | `6664a8c02aff`   |
| **C**: 1 varredura para uma temporária no grão fino + 5 rollups            | **17.777 ms** | `6664a8c02aff`   |

Duas validações antes de ler o resultado: a variante A mediu 30,7s contra os
32,4s da proc real, ou seja, o experimento reproduz o caminho de produção com 5%
de erro; e os três hashes são iguais **ao hash que a proc real produziu no
baseline**: as variantes entregam o mesmo resultado, não uma aproximação.

### B não ganhou nada, e isso derruba uma hipótese

O plano original supunha que `(p_date_from IS NULL OR a.sale_date >= p_date_from)`
estivesse impedindo o uso do índice, e que tornar o predicado direto traria ganho.
**Não trouxe** (31,8s contra 30,7s, dentro do ruído).

O motivo, olhando o dataset: 28 dias são metade das 56 datas armazenadas. Nenhum
índice ajuda uma consulta que precisa de metade das linhas: varrer _é_ o plano
correto. O predicado nunca foi o problema.

Corolário prático: **não adianta criar índice para acelerar a janela de 28 dias.**

### C ganhou 42%, e menos do que parecia

Cinco varreduras viraram uma, mas o tempo caiu 42%, não 80%. A varredura única
carrega o agrupamento no grão fino (~1,4M linhas colapsando em ~100k grupos), que
não é de graça, e os rollups saem de uma temporária InnoDB que também tem custo.
O ganho é real e reproduzível; a aritmética de "5 varreduras → 1/5 do tempo" não
se sustenta.

### O piso é I/O, e dá para vê-lo nos números

Custo por linha varrida, derivado do baseline:

| Janela  | Linhas por varredura | Tempo por varredura | Por linha |
| ------- | -------------------: | ------------------: | --------: |
| 7 dias  |                ~344k |             ~700 ms |    2,0 µs |
| 28 dias |                ~1,4M |           ~7.670 ms |    5,5 µs |

A mesma operação fica **2,75x mais cara por linha** só por a janela ser maior.
Isso não é a query: é o conjunto deixando de caber nos 128 MB de buffer pool.
Enquanto esse degrau existir, qualquer reescrita de proc opera sobre um piso de
disco.

---

## Experimento 2: o modelo de custo que fecha os números

O experimento 1 sugeria "menos varreduras, menos tempo". Testando mais variantes,
essa regra se mostrou errada. O que fecha é **varreduras × largura da chave de
agrupamento**, mais o preço fixo de materializar cada temporária.

| Variante                                 | Varreduras | Chave do grão                              | Linhas na temporária |       Mediana |
| ---------------------------------------- | ---------: | ------------------------------------------ | -------------------: | ------------: |
| `rankings` hoje                          |          5 | -                                          |                    - |     30.677 ms |
| `rankings` C: 1 temporária no grão fino  |          1 | 6 colunas, inclui `prod_name` VARCHAR(255) |                 ~15k | **17.777 ms** |
| `rankings` D: 2 temporárias mais baratas |          2 | 4 e 2 colunas                              |       1.523 e 15.270 |     31.783 ms |
| `metrics` hoje                           |          4 | -                                          |                    - |     45.832 ms |
| `metrics` E: 1 temporária                |          1 | 3 colunas estreitas                        |                2.415 |  **9.341 ms** |
| `area` hoje                              |          3 | -                                          |                    - |     21.269 ms |
| `area` F: temporária por produto         |          2 | 1 coluna                                   |                 ~15k | **13.352 ms** |

Todos os hashes idênticos aos das versões atuais.

**D é a variante instrutiva:** duas temporárias _pequenas_ custaram o mesmo que as
cinco varreduras originais. Materializar tem preço por temporária, não por linha
lida: trocar cinco leituras baratas por duas materializações não compra nada.

E é o oposto: `metrics` ganha 5x porque seu grão comum
(`sale_date`, `store_code`, `depto`) tem 2.415 linhas e três colunas estreitas.
`rankings` ganha menos porque precisa de `prod_code` e `prod_name` na chave, e
agrupar 1,4M linhas por uma chave de ~475 bytes é caro por si só.

**Regra prática para a próxima vez:** materializar uma temporária só compensa
quando ela é (a) uma só, (b) de chave estreita, e (c) reaproveitada por vários
result sets. Faltando qualquer uma das três, meça antes.

### O que ficou de fora, e por quê

`area_analysis` continua com 2 varreduras em vez de 1: o `byDate` precisa do grão
`sale_date`, e incluir a data na chave da temporária faria ela deixar de colapsar
(~1,4M linhas em vez de ~15k). Custaria mais que a varredura economizada.

`product_analysis` faz **7** varreduras e não está no baseline, mas ela filtra por
um `prod_code` só, então usa índice e não sofre do mesmo problema. Fica anotado.

---

## Pós-deploy: 2026-07-26, o experimento errou sobre a Área

Medição das procs de verdade em prod, depois do deploy. Todos os hashes idênticos
aos do baseline: as três procs sempre devolveram o resultado certo.

| Cenário               |  Baseline |        Depois |          |
| --------------------- | --------: | ------------: | -------- |
| `metrics_28d`         | 46.342 ms | **10.064 ms** | −78%     |
| `rankings_28d`        | 32.373 ms | **18.963 ms** | −41%     |
| `area_28d_sem_filtro` | 23.011 ms |     30.567 ms | **+33%** |
| `area_28d_depto`      | 24.025 ms |     30.104 ms | **+25%** |
| `area_28d_loja`       | 21.716 ms |     30.378 ms | **+40%** |
| `area_28d_export`     | 23.345 ms |     30.203 ms | **+29%** |
| `area_28d_busca`      | 23.278 ms |     30.676 ms | **+32%** |
| `filtros_28d`         |    222 ms |        215 ms | -        |

`metrics` e `rankings` entregaram o que o experimento previu (9,3s e 17,8s).
**`area_analysis` fez o oposto**: o experimento previu 13,4s e a proc mediu 30,4s.
Revertida para a versão de 3 varreduras.

### O erro de método, que é o que importa

No experimento, a variante F replicou a consulta **sem os cinco predicados
`NOT EXISTS (...) OR col IN (...)`**, só o recorte de datas. A variante de
controle (A) tinha a mesma omissão, mediu 21,3s contra os 23,0s da proc real, e eu
tratei esses 7% como prova de que o experimento era fiel.

Não era. Um controle que bate no cenário onde as duas versões se comportam igual
não valida nada sobre o cenário onde elas divergem. Os predicados de filtro são
baratos numa subquery derivada que já vai ser materializada de qualquer jeito, e
caros quando são a condição de uma `CREATE TEMPORARY TABLE ... AS SELECT`.

O sintoma que denuncia isso nos números: depois da mudança, os cinco cenários da
Área mediram entre 30,1s e 30,7s, praticamente idênticos, enquanto antes variavam
de 21,7s a 24,0s. Uniformidade assim é sinal de um custo fixo dominando tudo, que
não responde a filtro, busca nem tamanho de página. Era a materialização.

**Regra para a próxima:** o controle do experimento tem de reproduzir a consulta
**inteira**, predicados de filtro incluídos. Se replicar a proc por completo for
inviável, criar a proc candidata com outro nome e medi-la pelo harness, não
comparar SQL avulso com stored procedure.

### Estado final, depois do revert

Bateria de confirmação em prod, com todos os hashes idênticos aos do baseline:

| Cenário               |  Baseline |         Final |                       |
| --------------------- | --------: | ------------: | --------------------- |
| `metrics_28d`         | 46.342 ms |  **9.582 ms** | −79%                  |
| `rankings_28d`        | 32.373 ms | **19.672 ms** | −39%                  |
| `area_28d_sem_filtro` | 23.011 ms |     23.652 ms | revertido ao original |
| `area_28d_depto`      | 24.025 ms |     23.800 ms | revertido ao original |
| `area_28d_loja`       | 21.716 ms |     22.223 ms | revertido ao original |
| `area_28d_export`     | 23.345 ms |     23.208 ms | revertido ao original |
| `area_28d_busca`      | 23.278 ms |     22.973 ms | revertido ao original |
| `area_7d_sem_filtro`  |  2.114 ms |      2.196 ms | revertido ao original |
| `filtros_28d`         |    222 ms |        220 ms | -                     |

As duas procs que dominavam o custo da tela inicial saíram de 78,7s somados para
29,3s. A tela Área ficou como estava.

## Como comparar depois de uma mudança

```bash
diff <(cut -f1,3,7,8,9 antes/results.tsv) <(cut -f1,3,7,8,9 depois/results.tsv)
```

As colunas de hash têm de ser idênticas. As de tempo são o resultado.

---

## PR #23: 2026-07-30, remoção de contagem duplicada em `area_analysis`

Não é uma reescrita: não repete o experimento de 1 varredura/temporária que
regrediu (ver seções acima). O profiling interno (`SET profiling=1` + `SHOW
PROFILES`) mostrou que o Result Set 2 (`total_products`) rodava a mesma query,
idêntica, que já populava `v_universe` (Result Set 1) linhas antes, mesma
tabela (`product_universe`, não a tabela grande), mesmo `WHERE`, mesmo
`COUNT(DISTINCT prod_code)`. Trocado por `SELECT v_universe AS total_products;`.

Correção provada com `validate-procs.sh` (37 cenários, hash idêntico
antes/depois). Timing confirmado com `bench-procs.sh` contra produção:

| Cenário               | Baseline (pós-revert, 26/07) |                               Depois do PR #23 |                                                                                                  |
| --------------------- | ---------------------------: | ---------------------------------------------: | ------------------------------------------------------------------------------------------------ |
| `area_28d_sem_filtro` |                    23.652 ms |                                  **23.178 ms** | −2%, dispersão válida (1.08x)                                                                    |
| `area_7d_sem_filtro`  |               2.114-2.196 ms | **1.944 ms** (mediana de 9 amostras, 2 warmup) | ~−7 a −11%, dispersão 1.39x, **acima do limite de 1.3x**, repetido duas vezes com o mesmo padrão |

Ganho real e correto, mas pequeno: a query removida só toca `product_universe`,
fração pequena do tempo total no pior caso (28 dias). O cenário de 7 dias
mostrou um sinal proporcionalmente maior, mas sem bater o critério de
confiabilidade do próprio harness. Não tratar como número confirmado.

**Armadilha nova, registrada em `docs/continuar.md` também**: medir com `time
mariadb ... -e "CALL ..." > arquivo` seguido de `wc -l`/processamento do
arquivo infla o tempo com I/O de disco e formatação de texto do cliente `mariadb`,
não custo de servidor. Uma medição inicial de `area_28d_sem_filtro` chegou a
33,9s dessa forma; com o output redirecionado direto pro `/dev/null` (sem
arquivo intermediário) e comparado contra `SHOW PROFILES` do mesmo cenário, o
tempo real de servidor era ~23s, o resto era artefato do método de medição, não
do banco. `bench-procs.sh` já evita esse problema por medir com `NOW(6)` dentro
da própria sessão SQL; o erro só acontece em medição ad-hoc fora do harness.

O teto de `area_analysis` (as 2-3 varreduras completas de `sales_prod_daily_agg`)
continua o mesmo. Não há correção pendente óbvia: a via mais direta (reduzir
varreduras) já foi tentada e não funciona para esta proc especificamente.

## 2026-07-30: remoção dos 4 índices de categoria em `sales_prod_daily_agg`

Item 2 da lista "Aberto" de `docs/continuar.md`. A hipótese já estava registrada
antes de medir: os índices em `depto`/`secao`/`grupo`/`subgrupo` não aceleram
nenhuma proc (filtrar por uma dessas colunas custa _mais_ que não filtrar, o
plano de acesso real é sempre a varredura por `sale_date`), então só ocupam
espaço. Faltava quantificar o espaço e provar que remover não regride nada.

**Tamanho, via `mysql.innodb_index_stats`** (não dá para consultar por
`information_schema.STATISTICS`/`TABLES` comum, não tem coluna de tamanho por
índice; precisou de acesso root local no servidor):

| Índice                     |   Tamanho |
| -------------------------- | --------: |
| PRIMARY (dados)            | 538,41 MB |
| `idx_prod_daily_subgrupo`  | 169,56 MB |
| `idx_prod_daily_grupo`     | 142,55 MB |
| `idx_prod_daily_secao`     | 121,42 MB |
| `idx_prod_daily_prod_code` | 117,67 MB |
| `idx_prod_daily_depto`     |  99,28 MB |
| `idx_prod_daily_sale_date` |  63,12 MB |

Os 4 juntos: **532,81 MB (74,7% de todo o índice da tabela)**, quase do
tamanho dos dados reais, contra um `innodb_buffer_pool_size` de 128 MB (default
de fábrica, ver item 1 de `continuar.md`).

**Antes/depois com `bench-procs.sh`** (9 cenários, produção):

| Cenário               |     Antes |    Depois |                                              Δ |
| --------------------- | --------: | --------: | ---------------------------------------------: |
| `area_7d_sem_filtro`  |  2.153 ms |  1.986 ms |                                            −8% |
| `area_28d_sem_filtro` | 24.022 ms | 23.430 ms |                                            −2% |
| `area_28d_depto`      | 23.744 ms | 24.394 ms |                                            +3% |
| `area_28d_loja`       | 21.822 ms | 22.939 ms |                                            +5% |
| `area_28d_export`     | 23.681 ms | 24.300 ms |                                            +3% |
| `area_28d_busca`      | 24.012 ms | 23.134 ms |                                            −4% |
| `rankings_28d`        | 19.303 ms | 19.171 ms |                                            −1% |
| `metrics_28d`         |  9.873 ms | 10.756 ms | +9% (disp. 1.41x nas duas pontas, não confiar) |
| `filtros_28d`         |    228 ms |    250 ms |        disp. alta nas duas pontas, não confiar |

Hashes idênticos nos 9 cenários (`diff` vazio). Nenhuma proc mudou de
resultado. As medianas oscilam ±2-8% sem sinal consistente de ganho ou perda,
dentro do ruído normal, **como esperado**, já que esses índices nunca
ajudavam leitura; a hipótese não era "fica mais rápido", era "não fica mais
lento, e libera espaço". `bp_pages_free` mal se moveu no instante da medição
(843→895 páginas), o ganho de buffer pool é de regime permanente (dias
reciclando cache sem 532 MB de índice morto competindo por espaço), não algo
visível numa janela de minutos.

Removido em produção via `DROP INDEX` direto (92ms, `ALGORITHM=INPLACE,
LOCK=NONE`), formalizado depois em
`scripts/migrations/0004_drop_indices_categoria_sales_prod_daily_agg.sql`
(idempotente via `DROP INDEX IF EXISTS`, seguro tanto para reaplicar em prod
quanto para instalação nova, onde o baseline já cria a tabela sem esses
índices). `scripts/validate-procs.sh` local confirmou hash idêntico nos 37
cenários depois da migration.

**Achado lateral**: o MariaDB de dev local tinha índices `ix_cov_*` (cobertura)
em `depto`/`secao`/`grupo`/`subgrupo`/`store_code`/`sale_date+prod_code` que
não existem em nenhum lugar do `migrate-schema.sql`: sobra de um experimento
anterior nunca revertida no ambiente local (bate com a armadilha #1 já
registrada abaixo: "um índice de cobertura em `depto` não mudou nada"). Não
afeta produção, mas o dev local não é mais um espelho fiel do schema
versionado; considerar recriar o banco local do zero numa próxima sessão.

## 2026-07-30: `product_analysis` (item 3), dois cenários novos no harness

Nunca tinha entrado no baseline. A suposição registrada era que filtrar por um
`prod_code` só reduz o custo a quase nada, por usar
`idx_prod_daily_prod_code`, mas isso nunca foi medido, e a proc faz 7
referências a `sales_prod_daily_agg`, das quais duas (`lastFourSameWeekday`,
`lastFourAll`) não têm limite de data além de `v_ref_date`: varrem o
histórico inteiro daquele produto.

Dois cenários novos em `bench-procs.sh`: `produto_alto_volume` e
`produto_baixo_volume`, o produto com mais e o com menos linhas em toda a
tabela (não só na janela de 28 dias, porque é o volume total do produto que
limita o custo dessas duas varreduras sem fim de data):

| Cenário                | Mediana | Faixa (20 amostras) | Linhas de resultado |
| ---------------------- | ------: | ------------------- | ------------------: |
| `produto_alto_volume`  |    9 ms | 8-13 ms             |                  56 |
| `produto_baixo_volume` |    2 ms | 2-3 ms              |                   4 |

A dispersão (`max/min`) desses dois cenários fica acima de 1,3x mesmo com 20
amostras (1,62x e 1,50x): o critério de validade do harness foi calibrado
para procs de segundos, onde 30% de variação é sinal de instabilidade real.
Em milissegundos, 4-5ms de diferença é ruído normal de agendamento do SO, não
instabilidade do banco; a mediana ficou estável nas duas rodadas (5 e 20
amostras), então o número é confiável apesar do flag.

Suposição confirmada: `product_analysis` custa 3-4 ordens de magnitude menos
que `area_analysis`/`dashboard_metrics`/`dashboard_rankings` (ms contra
segundos). Filtrar por `prod_code` de fato elimina o problema de varredura
completa que afeta as outras procs. Item fechado sem mudança de proc.

## 2026-07-31: build do Vite, fora do escopo das procs (PR #93)

Não é medição de proc/SQL como o resto deste documento, mas é uma medição de
performance que só existiu no chat até agora, registrando aqui pra não se
perder.

Migração `vite@7.3.2` → `8.2.0` (+ `@vitejs/plugin-react` `5.2.0` → `6.0.4`):
`bun run build` caiu de **25-35s para ~2s**. Não foi medido com harness formal
(sem N amostras/dispersão), é o tempo de parede observado em algumas
execuções antes/depois, não uma medição rigorosa. Zero mudança de código
necessária; resto da stack (nitro, `@tanstack/react-start`, router-plugin,
`vite-tsconfig-paths`, `@tailwindcss/vite`, vitest) já suportava `vite@^8`.

## 2026-08-04: PM2 cluster mode, diluição consciente do rate limit por IP

Não é medição, é registro de uma decisão de trade-off discutida em conversa,
pra não se perder (mesmo motivo do item acima).

Migrar `ecosystem.config.cjs` de `fork`/1 instância para `cluster`/2
instâncias (zero-downtime real em deploy via `pm2 reload`, em vez do restart
completo do fork mode) tem um efeito colateral: `RateLimiter`
(`src/lib/rate-limit.ts`) guarda os contadores em memória do processo, um por
worker. Com 2 workers, o teto efetivo por IP dilui (as requisições de um
mesmo IP se dividem entre os processos, cada um com seu próprio contador).

Decisão: aceitar a diluição sem redesenhar o rate limiter pra estado
compartilhado entre processos. Motivo: a VPS tem um núcleo físico só, os dois
workers competem pelo mesmo núcleo. O `authLimiter` (o tier mais sensível,
10/min por IP) existe principalmente pra conter o custo de CPU do bcrypt
(custo 12, já satura um núcleo sozinho) tanto quanto pra contar tentativas: um
atacante consegue fazer o contador subir mais devagar até bloquear, mas não
consegue calcular mais tentativas por segundo de verdade, porque o gargalo
continua sendo a CPU compartilhada, não o contador em si. Revisitar se a VPS
ganhar mais núcleos algum dia (aí sim 2 workers rodam de verdade em paralelo,
e a diluição passa a valer mais).

## 2026-08-04: três rollbacks seguidos no deploy do PM2 cluster mode, duas causas raiz distintas

Registro da investigação, não medição formal. A migração pra cluster mode
(item acima) expôs dois bugs reais no pipeline de deploy que nunca tinham
aparecido em modo fork/1 instância — nenhum dos dois é do cluster mode em si,
mas o cluster mode alargou a janela de tempo o suficiente pra virar visível.

**Causa 1 — `listen_timeout` default do PM2 curto demais.** Medido em
produção: cada worker leva consistentemente ~4,8s do pedido de reload até
confirmar `listening` (pool de conexão do MariaDB, SDK do Sentry, registro de
rotas, tudo competindo pela CPU única com o outro worker subindo ao mesmo
tempo). O default do PM2 (`GRACEFUL_LISTEN_TIMEOUT`) é 3000ms: curto demais
pro nosso boot real. Sem isto, o PM2 desistia de esperar antes do worker novo
responder e considerava o reload malsucedido, mesmo com os workers saudáveis
um instante depois. Fix: `listen_timeout: 8000` em `ecosystem.config.cjs`
(PR #187).

**Causa 2 — troca de conteúdo no mesmo caminho, worker antigo lendo por
baixo.** O script de deploy trocava o diretório inteiro
(`mv .output .output.old && mv .output.new .output`) **antes** de pedir o
reload ao PM2. Em modo fork/1 instância a janela entre essa troca e o
processo antigo morrer era de milissegundos — irrelevante. Em cluster mode, o
reload troca os workers um de cada vez (~10-20s no total pros dois); durante
essa janela, o worker antigo — ainda de pé, ainda recebendo tráfego real —
fazia qualquer leitura de asset sob demanda (hash antigo, não cacheado em
memória do processo) pelo caminho `.output`, que a troca já tinha apontado
pro build NOVO por baixo dele: `ENOENT`/500 real, reproduzido tanto pelo
healthcheck do próprio deploy quanto potencialmente por usuário de verdade
nesse intervalo. Log de produção, 2026-08-04T09:55:07Z:

```
Error: ENOENT: no such file or directory, open
'.output/public/assets/auth-BTwUPa54.js'
```

Fix: esquema de release versionada (`releases/<timestamp>-<sha>/`, nunca
reescrita) + symlink `current` trocado atomicamente. Node resolve o caminho
REAL do módulo de entrada (segue symlink) no `import()` inicial: uma vez de
pé, cada worker fica preso pra sempre na sua própria `releases/.../`, imune a
uma troca de symlink que aconteça depois — nenhum worker antigo volta a ler
de um caminho cujo conteúdo mudou debaixo dele. Testado manualmente no
servidor (simulação de dois ciclos completos de deploy, incluindo o cenário
de rollback) antes de subir via CI (PR #188).

**Causa 3 — descoberta testando a Causa 2, bug do próprio PM2.** Validando o
fix de release versionada em produção (seis ciclos de reload em sequência),
o sexto ciclo deixou `gpa.t00ls.dev` respondendo 502 por alguns minutos: o
`pm2 startOrReload` reportou os dois workers "online" e o `pm2 describe`
mostrava tudo saudável, mas nenhum dos dois processos jamais conseguiu de
fato ligar na porta 3000 — nenhum erro no log da aplicação, nenhuma linha
"Listening on" pra aquele ciclo, nenhum socket em `LISTEN` (`ss`/`lsof`
confirmaram). Recuperado na hora com `pm2 delete` + `pm2 start` limpo.

Reproduzido de forma isolada (bun + PM2 7.0.3 + MariaDB locais, fora da VPS,
pra não arriscar outra indisponibilidade real) com ciclos de reload em
sequência rápida: falha em ~5-33% das tentativas individuais (variou entre
duas rodadas de teste), sempre nos dois workers ao mesmo tempo, sempre sem
nenhum erro de aplicação — bate com bug documentado do próprio PM2
([Unitech/pm2#3946](https://github.com/Unitech/pm2/issues/3946), "TCP port
isn't released on reload when app is running in cluster mode"). Não há
versão mais nova do PM2 disponível (7.0.3 já é a última no momento) que
corrija isso.

Mitigação: chamar `pm2 startOrReload` de novo (mesmo release, sem precisar
de `delete` antes) sempre corrigiu no teste — 20 ciclos com até 3 tentativas
cada, só 1 precisou de uma segunda tentativa (1 falha em 21 tentativas
individuais). `ci.yml` agora tenta o reload até 3 vezes, cada uma com seu
próprio healthcheck, antes de considerar falha real e disparar o rollback
(PR #188, mesmo PR da Causa 2 — as duas foram corrigidas juntas porque a
segunda só apareceu testando a primeira).
