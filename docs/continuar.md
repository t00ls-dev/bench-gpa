# Onde parar e por onde retomar

Estado em **2026-07-30**. Este documento existe para a próxima sessão não ter de
reconstruir contexto a partir do histórico do git.

## Como trabalhar aqui

- **Branch + PR, nunca commit direto na `main`.** Push na `main` dispara deploy em
  produção; PR roda o CI sem deployar. Não existe ambiente de teste ainda.
- **Testar antes de commitar:** `bun run check`, e validação contra o MariaDB
  local quando a mudança tocar banco ou auth.
- **MariaDB local para testes de verdade**: existe um banco `bench_gpa_dev` local
  com volume de dado representativo (~2M linhas em `sales_prod_daily_agg`, perto
  do real de produção), parado por padrão (`sudo systemctl start mariadb` para
  subir, `stop` ao terminar — não deixar rodando 24/7). Login de teste:
  `test@gpabr.com` / `TestLocal!2026x` (`TURNSTILE_BYPASS=true` no `.env` local,
  que é git-ignored). Sem isso, mudança em query/proc/UI de filtro só dá pra
  validar por leitura de código, não por execução real — vale manter esse
  ambiente entre sessões em vez de recriar do zero.
- **Se mexer nas procs de análise**, as duas ferramentas são um par e nenhuma
  basta sozinha: `scripts/bench-procs.sh` mede o custo em prod (via SSH,
  `~/.ssh/gpa-key`) e `scripts/validate-procs.sh` prova que o resultado não
  mudou (37 cenários, dois hashes cada — roda no MariaDB local). Uma proc mais
  rápida que devolve outro número é um bug mais rápido. Detalhes em
  `docs/medicao-performance.md`.
- Merges próximos no tempo colapsam em um deploy só (o CI da `main` tem
  `cancel-in-progress: true`), o que reduz a janela de indisponibilidade.

## O que foi feito nesta rodada

Treze PRs mergeados (#14 a #26), em duas frentes.

**Auditoria de performance/segurança/UX** (relatório Top 10 ROI, separado da
`analise-completa.md`):

| PR | O quê |
| --- | --- |
| #14 | 5 correções rápidas de segurança/performance |
| #15 | Atualiza `seroval` — vulnerabilidade crítica |
| #16 | Atualiza `xlsx` (via CDN do SheetJS, o npm está congelado em 0.18.5) — prototype pollution + ReDoS |
| #17 | Lazy-load de `CommandPalette`/`HelpOverlay`, tira do bundle da `/auth` |
| #18 | Logos convertidas para WebP, redimensionadas pro tamanho real de exibição |
| #19 | Remove 5 dependências npm e 27 componentes shadcn mortos (2240 linhas) |
| #20 | Tempo decorrido no export de PDF da área (era só spinner, sem sinal de progresso) |
| #21 | Divide `admin.functions.ts` (420 linhas, 12 funções) em `admin-users`/`admin-system`/`admin-docs` |
| #22 | Extrai `FilterField` compartilhado de `FilterBar`/`AreaFilters` (só o markup — a lógica de cascata continua separada de propósito, ver abaixo) |
| #23 | Remove uma contagem duplicada em `area_analysis` (ver "Performance" abaixo) |
| #25 | Agrupa as logos em `public/brand/` |

**"Números mágicos"** (quatro partes; as duas primeiras — `c314911`, `bc9262b`
— já estavam feitas antes desta rodada):

| PR | O quê |
| --- | --- |
| #24 | `KNOWN_JOBS.schedule`/`maxHours` (admin) e o fallback `180` de `purge_old_aggs` (SQL) — os dois itens que tinham ficado de fora de propósito por conflitar com PRs em revisão na época |
| #26 | 17 ocorrências de `staleTime`/`gcTime` do React Query (13 arquivos) viram 5 constantes nomeadas por semântica (`QUERY_STALE_LIVE/ADMIN/IDENTITY/CORE/REFERENCE`); opções de paginação da área (`AREA_PAGE_SIZE_OPTIONS`); debounces nomeados localmente |

Todas as 4 partes de números mágicos estão fechadas agora.

### Performance de `area_analysis` — o que mudou e o que não mudou

Reabri a investigação do teto de `area_analysis` (2-23s) com o MariaDB local
configurado. **Achado importante antes de mexer em qualquer coisa**: o
comentário no topo da proc (`scripts/migrate-schema.sql`) documenta que a
reescrita óbvia (1 varredura + temporária) **já foi tentada e revertida** em
26/07 — regrediu de 23,0s para 30,6s em prod porque os predicados
`NOT EXISTS(...) OR col IN (...)` de filtro, baratos numa subquery derivada,
ficam caros como condição de `CREATE TEMPORARY TABLE ... AS SELECT`. Não
repeti essa tentativa.

O que o profiling interno (`SET profiling=1` + `SHOW PROFILES`) mostrou: o
Result Set 2 (`total_products`) rodava a **mesma query, idêntica**, que já
populava a variável `v_universe` (Result Set 1) linhas antes — mesma tabela
(`product_universe`), mesmo `WHERE`, mesmo `COUNT(DISTINCT prod_code)`. PR #23
troca a segunda execução por `SELECT v_universe AS total_products;`.

Validado com `scripts/validate-procs.sh` (37 cenários, hash idêntico) e depois
com `scripts/bench-procs.sh` **contra produção**:

| Cenário | Baseline (pós-revert, 26/07) | Medido em 30/07 | |
| --- | ---: | ---: | --- |
| `area_28d_sem_filtro` | 23.652 ms | **23.178 ms** | −2%, dispersão válida (1.08x) |
| `area_7d_sem_filtro` | 2.114-2.196 ms | **1.944 ms** (mediana de 9 amostras) | ~−7 a −11%, mas dispersão 1.39x — acima do limite de 1.3x que o próprio script exige, então não é um número "confirmado" |

Ganho real, mas pequeno — a query removida só toca `product_universe`, uma
fração pequena do tempo total. **O teto continua o mesmo**: as 2-3 varreduras
completas de `sales_prod_daily_agg` seguem lá, e a via óbvia pra eliminá-las já
foi tentada e não funciona. Ver "Aberto" #1 e #2 abaixo para os próximos passos
plausíveis.

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

### 4. Fusão total da lógica de cascata `FilterBar`/`AreaFilters`

PR #22 só uniu o markup repetido (`FilterField`). A lógica de cascata em si
continua duplicada e diferente de propósito: `FilterBar` busca opções em
cascata via query no servidor (dashboard não carrega a hierarquia inteira, pelo
custo de agregação); `AreaFilters` recebe a hierarquia completa já carregada e
cascateia em memória no cliente. Fundir as duas estratégias trocaria uma
decisão de performance deliberada por uma abstração, sem teste automatizado
hoje pra cobrir regressão. Se for revisitar, escrever os testes primeiro.

### 5. Refresh incremental por `sale_date`

`refresh_product_universe` e `refresh_filter_hierarchy` regeneram a tabela inteira
a cada import. É redesenho, não ajuste.

### 6. Reescrita de histórico do git

~41 MiB de XLSX em blobs permanentes no `.git`. Aprovado pelo usuário, mas o valor
caiu quando a proteção de branch foi descartada. Mais seguro agora que nenhuma
cron faz `git pull`.

### 7. Cobertura de teste zero nas server functions de negócio

`dashboard.functions.ts` (26,8%), `admin-docs`/`admin-system.functions.ts`
(0%, nasceram do split do PR #21 sem teste próprio), `product.functions.ts` e
`upload.functions.ts` (0%). É o código que processa dinheiro/vendas e o
pipeline de import — o que mais precisaria de rede de segurança pra refactors.
Ver `docs/coverage-summary.md` para o detalhe por arquivo.

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
- **Colunas "QTD"/"VALIDADE" vazias no PDF de Área** — parecem um formulário
  impresso pra preenchimento manual (conferência física), não um bug. Precisa
  de confirmação de produto antes de mexer.

## Armadilhas conhecidas

Estão em `docs/medicao-performance.md`, mas as que mais custaram:

1. **Índice não resolve a janela de 28 dias.** São metade das datas do banco;
   nenhum índice ajuda quem precisa de metade das linhas. Varrer é o plano certo.
2. **O controle de um experimento tem de reproduzir a consulta inteira**,
   predicados de filtro incluídos. Foi o erro que levou à regressão de 26/07: o
   controle omitia os mesmos predicados que a variante candidata, bateu com a proc
   real dentro de 7% no cenário onde as duas se comportam igual, e isso foi lido
   como fidelidade. Se replicar a proc inteira for inviável, criar a proc
   candidata com outro nome e medi-la pelo harness.
3. **Medições locais não são confiáveis** para estas procs — o mesmo bloco variou
   de 8,6s a 0,9s. Medir em prod, em janela de baixo uso, com o harness.
4. **Timing via CLI pode estar medindo o cliente, não o banco.** `time mariadb
   ... > arquivo` seguido de `wc -l`/processamento do output infla o número com
   I/O de arquivo e renderização de texto, não custo de query. Redirecionar pro
   `/dev/null` ou usar `SET profiling=1` + `SHOW PROFILES` pra isolar o tempo
   real gasto no servidor.
