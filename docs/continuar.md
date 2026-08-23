# Estado do projeto e itens em aberto (30/07/2026, histórico)

Estado em **2026-07-30**. Este documento existe para a próxima sessão não ter de
reconstruir contexto a partir do histórico do git. Para o "como chegamos até
aqui" (Lovable → Supabase → self-hosted), ver `docs/historia-do-projeto.md`.

**A partir daqui o conteúdo é histórico (parou em ~PR #67).** Entre 30/07 e
31/07/2026 houve uma auditoria técnica completa do repositório
(`docs/auditoria-tecnica-2026-07-31.md`), que tem sua própria lista de ações
priorizadas (já toda resolvida) cobrindo segredos no git, CVEs de
dependência, rate limit por conta, transações ausentes em procs, TTL de
cache, código morto, `noUnusedLocals`/`no-unused-vars`, e a limpeza de
índices redundantes/mortos que segue o item 2 abaixo. Consulte aquele
documento para o estado mais recente antes de assumir que algo listado
como "aberto" aqui ainda está aberto.

Auditoria posterior, em 18/08/2026: riscos, capacidade para dois usuários e
decisões adiadas sobre rate limiting estão registrados em
`docs/auditoria-rate-limiting-2026-08-18.md`. O usuário optou por não tratar o
tema naquele momento; o documento preserva evidências e opções para retomada,
sem autorizar alterações de código ou infraestrutura.

## Como trabalhar aqui

- **Branch + PR, nunca commit direto na `main`.** Push na `main` dispara deploy em
  produção; PR roda o CI sem deployar. Não existe ambiente de teste ainda.
- **Testar antes de commitar:** `bun run check`, e validação contra o MariaDB
  local quando a mudança tocar banco ou auth.
- **MariaDB local para testes de verdade**: existe um banco `bench_gpa_dev` local
  com volume de dado representativo (~2M linhas em `sales_prod_daily_agg`, perto
  do real de produção), parado por padrão (`sudo systemctl start mariadb` para
  subir, `stop` ao terminar, não deixar rodando 24/7). Login de teste (desde
  a migração de auth para username/matrícula, 05/08/2026): usuário `test`
  (`TURNSTILE_BYPASS=true` no `.env` local, que é git-ignored), senha
  criada por `scripts/create-test-admin.ts`. Sem isso, mudança em
  query/proc/UI de filtro só dá pra validar por leitura de código, não por
  execução real. Vale manter esse ambiente entre sessões em vez de recriar
  do zero.
- **Se mexer nas procs de análise**, as duas ferramentas são um par e nenhuma
  basta sozinha: `scripts/bench-procs.sh` mede o custo em prod (via SSH,
  `~/.ssh/gpa-key`) e `scripts/validate-procs.sh` prova que o resultado não
  mudou (37 cenários, dois hashes cada, roda no MariaDB local). Uma proc mais
  rápida que devolve outro número é um bug mais rápido. Detalhes em
  `docs/medicao-performance.md`.
- Merges próximos no tempo colapsam em um deploy só (o CI da `main` tem
  `cancel-in-progress: true`), o que reduz a janela de indisponibilidade.

## O que foi feito nesta rodada

PRs mergeados (#14 a #26), em duas frentes.

**Auditoria de performance/segurança/UX** (relatório Top 10 ROI, separado da
`analise-completa.md`):

| PR  | O quê                                                                                                                                         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| #14 | 5 correções rápidas de segurança/performance                                                                                                  |
| #15 | Atualiza `seroval`: vulnerabilidade crítica                                                                                                   |
| #16 | Atualiza `xlsx` (via CDN do SheetJS, o npm está congelado em 0.18.5): prototype pollution + ReDoS                                             |
| #18 | Logos convertidas para WebP, redimensionadas pro tamanho real de exibição                                                                     |
| #19 | Remove 5 dependências npm e 27 componentes shadcn mortos (2240 linhas)                                                                        |
| #20 | Tempo decorrido no export de PDF da área (era só spinner, sem sinal de progresso)                                                             |
| #21 | Divide `admin.functions.ts` (420 linhas, 12 funções) em `admin-users`/`admin-system`/`admin-docs`                                             |
| #22 | Extrai `FilterField` compartilhado de `FilterBar`/`AreaFilters` (só o markup, a lógica de cascata continua separada de propósito, ver abaixo) |
| #23 | Remove uma contagem duplicada em `area_analysis` (ver "Performance" abaixo)                                                                   |
| #25 | Agrupa as logos em `public/brand/`                                                                                                            |

**"Números mágicos"** (quatro partes; as duas primeiras, `c314911` e `bc9262b`,
já estavam feitas antes desta rodada):

| PR  | O quê                                                                                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #24 | `KNOWN_JOBS.schedule`/`maxHours` (admin) e o fallback `180` de `purge_old_aggs` (SQL): os dois itens que tinham ficado de fora de propósito por conflitar com PRs em revisão na época                                                                   |
| #26 | 17 ocorrências de `staleTime`/`gcTime` do React Query (13 arquivos) viram 5 constantes nomeadas por semântica (`QUERY_STALE_LIVE/ADMIN/IDENTITY/CORE/REFERENCE`); opções de paginação da área (`AREA_PAGE_SIZE_OPTIONS`); debounces nomeados localmente |

Todas as 4 partes de números mágicos estão fechadas agora.

### Performance de `area_analysis`: o que mudou e o que não mudou

Reabri a investigação do teto de `area_analysis` (2-23s) com o MariaDB local
configurado. **Achado importante antes de mexer em qualquer coisa**: o
comentário no topo da proc (`scripts/migrate-schema.sql`) documenta que a
reescrita óbvia (1 varredura + temporária) **já foi tentada e revertida** em
26/07: regrediu de 23,0s para 30,6s em prod porque os predicados
`NOT EXISTS(...) OR col IN (...)` de filtro, baratos numa subquery derivada,
ficam caros como condição de `CREATE TEMPORARY TABLE ... AS SELECT`. Não
repeti essa tentativa.

O que o profiling interno (`SET profiling=1` + `SHOW PROFILES`) mostrou: o
Result Set 2 (`total_products`) rodava a **mesma query, idêntica**, que já
populava a variável `v_universe` (Result Set 1) linhas antes. Mesma tabela
(`product_universe`), mesmo `WHERE`, mesmo `COUNT(DISTINCT prod_code)`. PR #23
troca a segunda execução por `SELECT v_universe AS total_products;`.

Validado com `scripts/validate-procs.sh` (37 cenários, hash idêntico) e depois
com `scripts/bench-procs.sh` **contra produção**:

| Cenário               | Baseline (pós-revert, 26/07) |                      Medido em 30/07 |                                                                                                                         |
| --------------------- | ---------------------------: | -----------------------------------: | ----------------------------------------------------------------------------------------------------------------------- |
| `area_28d_sem_filtro` |                    23.652 ms |                        **23.178 ms** | −2%, dispersão válida (1.08x)                                                                                           |
| `area_7d_sem_filtro`  |               2.114-2.196 ms | **1.944 ms** (mediana de 9 amostras) | ~−7 a −11%, mas dispersão 1.39x: acima do limite de 1.3x que o próprio script exige, então não é um número "confirmado" |

Ganho real, mas pequeno: a query removida só toca `product_universe`, uma
fração pequena do tempo total. **O teto continua o mesmo**: as 2-3 varreduras
completas de `sales_prod_daily_agg` seguem lá, e a via óbvia pra eliminá-las já
foi tentada e não funciona. Ver "Aberto" #1 e #2 abaixo para os próximos passos
plausíveis.

## Aberto, em ordem de valor

### 1. O piso de I/O (decisão do usuário, não técnica)

`sales_prod_daily_agg` tem 1,25 GB (538 MB de dados + 714 MB de índices) contra
`innodb_buffer_pool_size` de **128 MB, o default de fábrica, nunca ajustado**.

O sintoma medido: a mesma operação custa 2,0 µs por linha na janela de 7 dias e
5,5 µs na de 28. É o conjunto deixando de caber na memória. Enquanto isso existir,
toda proc opera sobre um piso de disco.

`innodb_buffer_pool_size` é ajustável a quente no MariaDB 11.4. **Mas** a VPS tem
1,9 GB, já usa 379 MB de swap, e o page cache do SO está absorvendo parte do I/O.
Não é memória livre esperando. O usuário optou por não seguir com isto por ora.

### 2. Os quatro índices de categoria (feito em 30/07/2026)

`depto`, `secao`, `grupo`, `subgrupo` em `sales_prod_daily_agg` somavam 532,81 MB
(74,7% do índice da tabela, quase o tamanho dos dados reais) sem acelerar
nenhuma proc: filtrar por qualquer uma dessas colunas já custava mais que não
filtrar. Removidos em produção via `DROP INDEX` direto (92ms) e formalizados em
`scripts/migrations/0004_drop_indices_categoria_sales_prod_daily_agg.sql`
(idempotente). Antes/depois com `bench-procs.sh` (9 cenários): hash idêntico em
todos, sem regressão de leitura fora do ruído normal (±2-8%). O ganho é espaço
de buffer pool/disco, não velocidade de leitura, que já era zero. Detalhe
completo em `docs/medicao-performance.md`.

Achado lateral: o MariaDB de dev local tinha índices de cobertura (`ix_cov_*`)
que não existem no `migrate-schema.sql`, sobra de um experimento anterior nunca
revertida. Considerar recriar o banco local do zero numa próxima sessão.

### 3. `product_analysis` faz 7 varreduras (medido em 30/07/2026), não é problema

Dois cenários novos em `bench-procs.sh` (`produto_alto_volume`, `produto_baixo_
volume`, o produto com mais e o com menos linhas na tabela toda, já que
`lastFourSameWeekday`/`lastFourAll` varrem o histórico inteiro do produto, sem
limite de data além do `v_ref_date`). Medido em produção, 20 amostras:

| Cenário                                        | Mediana | Faixa   |
| ---------------------------------------------- | ------: | ------- |
| `produto_alto_volume` (56 linhas de resultado) |    9 ms | 8-13 ms |
| `produto_baixo_volume` (4 linhas de resultado) |    2 ms | 2-3 ms  |

A suspeita do doc estava certa: filtrar por `prod_code` (índice
`idx_prod_daily_prod_code`, sobrevivente da limpeza do item 2) reduz o
conjunto a quase nada antes de qualquer agregação. Contra as 2-24s de
`area_analysis`/`dashboard_metrics`/`dashboard_rankings`, `product_analysis` é
3-4 ordens de magnitude mais barata. Sem ação pendente: fechado sem mudança
de proc.

### 4. Fusão total da lógica de cascata `FilterBar`/`AreaFilters` (parcial em 30/07/2026)

PR #22 só uniu o markup repetido (`FilterField`). As duas estratégias de
CÁLCULO DE OPÇÕES continuam deliberadamente separadas e não foram fundidas:
`FilterBar` busca em cascata via query no servidor, `AreaFilters` cascateia em
memória sobre a hierarquia já carregada, e continuam sem essa unificação por
decisão, não por falta de tempo (fundir isso trocaria uma decisão de
performance por uma abstração).

O que **era** duplicado de verdade e não tinha motivo de performance por trás:
o reset em cascata (trocar um nível zera os níveis dependentes) existia
idêntico em `filter-bar.tsx` e em `area.page.tsx` (não em `area-filters.tsx`,
que é só apresentação). Extraído para `src/lib/filter-cascade.ts`
(`cascadePatch`) e reusado nos dois lugares. A computação de opções do
`AreaFilters` também foi extraída (`computeAreaCascadeOptions`), não porque
duplicava `FilterBar`, mas porque não tinha teste nenhum antes.

12 testes novos em `src/lib/filter-cascade.test.ts`, 100% de cobertura no
arquivo. Testado manualmente em `/` e `/area` (Puppeteer + MariaDB local) sem
regressão visual ou funcional.

### 5. Refresh incremental por `sale_date` (resolvido diferente em 30/07/2026)

Não virou incremental de verdade (isso continua sendo redesenho, `MAX(sale_date)`
por `(prod_code, store_code)` e reclassificação de categoria não dão pra
atualizar em linha sem reler tudo). Em vez disso, decidido junto com o usuário:
`refresh_product_universe`/`refresh_filter_hierarchy` saíram de dentro de
`finalize_import` (todo import) e de `purge_old_aggs` (toda poda) e viraram um
cron dedicado, diário às 03h30 (30min depois do purge), pra já ver o agg
pós-poda numa passada só (`scripts/refresh-universe.ts`, monitorado em
Administração → Auditoria → Heartbeat das crons).

**Troca aceita conscientemente**: um PLU vendido pela primeira vez hoje (nunca
vendido antes) não aparece na listagem de Área no mesmo dia: só depois do
refresh das 03h30, porque `area_analysis` faz `LEFT JOIN` do período **sobre**
`product_universe`, que é quem decide quais produtos existem. Categoria nova
(depto/secao/grupo/subgrupo) tem o mesmo atraso nos filtros. Aceito porque PLU
genuinamente novo é raro: a maioria dos imports reusa o catálogo do dia
anterior.

Testado localmente: schema recompila limpo, `finalize_import` continua
funcionando (rollback correto testado com `CALL` inválido), `bun run
cli:refresh-universe` roda e grava heartbeat, painel admin mostra os dois jobs
corretamente.

### 6. Reescrita de histórico do git (feito em 30/07/2026)

`git filter-repo --path-glob '*.xlsx' --invert-paths` removeu 68 arquivos XLSX
(39,6 MiB) de todos os commits do histórico. `.git` caiu de 52 MiB para 2,6 MiB.
Conteúdo do HEAD idêntico (typecheck/lint/test passando igual, zero diferença de
árvore). Só o histórico mudou, todo hash de commit é novo.

Backup completo do histórico anterior salvo antes de reescrever
(`git bundle create ... --all`), fora do repo. `push --force` para `main`
(sem proteção de branch, sem cron fazendo `git pull`, ver item 5, produção
agora sincroniza por rsync, não depende do git daquele checkout). Um branch
remoto órfão (`chore/remove-indices-categoria-sales-prod-daily-agg`, já
mergeado, sobrevivera a um `--delete-branch` que não colou) foi apagado antes,
pra não sobrar como referência à história antiga.

**Qualquer clone existente deste repositório fica desatualizado e precisa ser
reclonado: um `git pull` normal quebra**, porque os hashes não batem mais com
nada do lado local. O checkout usado pelas crons em produção
(`/home/admin/web/gpa.t00ls.dev/public_html/.git`) não foi tocado: já era
vestigial desde o item 5 (aponta pro remote errado, sem credencial, e não é
mais usado pra sincronizar nada; os arquivos chegam por rsync do deploy).

### 7. Cobertura de teste zero nas server functions de negócio (feito em 30/07/2026)

Os 5 arquivos, um PR cada, maior risco primeiro (pipeline de import e dado de
venda antes das ferramentas administrativas):

| Arquivo                     | Antes | Depois |
| --------------------------- | ----: | -----: |
| `upload.functions.ts`       |    0% |  92,1% |
| `product.functions.ts`      |    0% | 81,25% |
| `dashboard.functions.ts`    | 26,8% | 92,85% |
| `admin-system.functions.ts` |    0% | 98,36% |
| `admin-docs.functions.ts`   |    0% | 88,88% |

Cobertura total do projeto (statements): 55,6% → 74,2%.

Mesmo molde de mock em todos (`createServerFn`/`auth-middleware`/`rate-limit.
middleware`/`db` mockados, copiado de `area.functions.test.ts`, que já existia
no repo antes desta rodada). Nenhum arquivo chega a 100%: o que sobra em
todos é a função inline de `.inputValidator((d) => Schema.parse(d))`, que esse
molde de mock nunca invoca (bypassa a validação real de propósito, pra não
acoplar o teste no Zod). Não é lacuna de teste real: os schemas em si já são
testados à parte, é só o coverage tool atribuindo a função-closure ao arquivo
onde ela está escrita.

`admin-docs.functions.ts` teve um desafio a mais: usa `import.meta.glob`
(transform do Vite, carrega `docs/**/*.md` como string em build) em vez de
`db.query`, e isso não dá pra mockar: os testes rodam contra a pasta `docs/`
real do repo, com asserções estruturais em vez de conteúdo exato.

**Correção registrada**: as duas primeiras PRs deste item (`upload`/`product`)
reportaram "0% → 100%" incorretamente: o relatório de cobertura no console
trunca nomes de arquivo longos (`....functions.ts`), um `grep` mal-feito não
achou a linha real e a ausência foi lida (errado) como "100%, oculto do
relatório". Os números certos são os da tabela acima.

### 8. Itens de produto/UX herdados de `melhorias-pendentes.md` (era Lovable/Supabase)

Esse arquivo listava ~28 pendências escritas ainda na Era 1 (ver
`docs/historia-do-projeto.md`), misturando itens já resolvidos com itens
genuinamente abertos. Conferido item a item contra o código em 30/07/2026: a
maioria (dark mode, `assertAdmin` duplicado, cancelar upload, Web Worker de
parse (via `xlsx-worker.ts`/`upload-dropzone.tsx`), confirmação em ações
destrutivas do admin, loading inline no Switch, busca de usuário por
nome/email, `MultiSelect` com teclado/ARIA, `AdminGate` com erro de rede,
`fmtBRL` movido pra `utils.ts`, cache de admin invalidando em
`setUserRole`/`setUserActive` via `invalidateAdminCache`, e revogação de
sessão via `token_version` no reset de senha) **já estava resolvida**. O
arquivo original nunca foi atualizado. O que sobrou genuinamente aberto:

**Feitos em 30/07/2026** (PRs #31-#36): sessão expirada preserva `?next=`;
Produto ganhou comparação de subconjunto de lojas (`product_analysis` trocou
`p_store_code` por `p_store_codes JSON`), histórico de buscas recentes
(localStorage) e linha de tendência (média móvel de 7 pontos); upload ganhou
retry automático: no nível do **arquivo inteiro**, não do chunk
(`insertSalesChunk` não é idempotente, ver commit do PR #36 pro porquê).

**Feitos em 30-31/07/2026** (PRs #56-#67, um item por PR): Dashboard/Produto
perderam a exportação em PDF (mantida só na Área); Dashboard ganhou
click-through nos rankings pra `/area`/`/produto` (com o nível clicado, e a
loja, se filtrada numa loja só, pré-selecionados no destino) e chips de
filtros ativos removíveis; Área ganhou nome de arquivo descritivo no PDF
(`slugifyFilename` + `a.download`, PR #62), bloco com os KPIs do topo no PDF
(PR #63, **experimental, confirmado pelo usuário que fica**, reaproveita o
`data` já carregado na tela, sem custo extra de servidor ou de geração) e
toolbar responsivo (busca em linha própria, seletor+PDF agrupados no celular,
`title`/`aria-label` no botão, PR #66); Admin ganhou paginação client-side
na lista de usuários, mesmo padrão visual da Área (`AREA_PAGE_SIZE_OPTIONS`,
PR #67). De passagem, o card de heartbeat do `refresh-universe` (item 7 do
histórico anterior, não desta lista) foi corrigido: rótulo longo quebrava o
badge de status ao lado; virou rótulo curto + popover com o detalhe (PRs
#64/#65: Tooltip não funciona em toque, só em hover/foco).

O que sobrou genuinamente aberto:

- **Dashboard**: exportação em XLSX (só tem PDF, e o PDF foi removido).
- **Produto**: exportação em XLSX (mesma situação).
- **Upload**: sem remover/reordenar arquivo na fila antes de importar.

Nenhum desses tem prioridade estabelecida: ficam registrados pra quando
o produto (não a engenharia) decidir o que vale a pena.

**Resolvido em 05/08/2026**: o item "Auth: sem fluxo de esqueci minha senha"
deixou de fazer sentido — a refatoração de auth pra username/matrícula
eliminou e-mail do sistema por completo (nunca haveria infra de SMTP pra
um "esqueci senha" self-service viável mesmo). O mecanismo definitivo agora
é admin reseta a senha → usuário refaz o fluxo de primeiro acesso
(`/first-access`). Ver `docs/plano-refatoracao-auth-username-matricula-2026-08-05.md`.

## Decidido NÃO fazer

- **Proteção de branch**: exige GitHub Pro (repo privado em plano grátis) e
  quebraria o auto-push do `import-watch`. Descartado por custo.
- **Alerta de dado obsoleto**: o footer já mostra a data da última venda.
- **Badges no README.**
- **"Erro de módulo" e "servidor off"**: diagnóstico fechado (é a janela de
  deploy: `.output.old` apagado no `ci.yml` e restart do PM2 em fork mode não é
  zero-downtime). Correção não aplicada por decisão do usuário.
- **SEO/OG**: já removidos; o `robots.txt` fica, porque bloquear indexação é o
  objetivo.
- **Colunas "QTD"/"VALIDADE" vazias no PDF de Área**: parecem um formulário
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
3. **Medições locais não são confiáveis** para estas procs: o mesmo bloco variou
   de 8,6s a 0,9s. Medir em prod, em janela de baixo uso, com o harness.
4. **Timing via CLI pode estar medindo o cliente, não o banco.** `time mariadb
... > arquivo` seguido de `wc -l`/processamento do output infla o número com
   I/O de arquivo e renderização de texto, não custo de query. Redirecionar pro
   `/dev/null` ou usar `SET profiling=1` + `SHOW PROFILES` pra isolar o tempo
   real gasto no servidor.
5. **HestiaCP não regenera o vhost de `gpa.t00ls.dev` corretamente: bug
   reproduzível, não pontual.** Descoberto em 30/07/2026 quando um auto-update
   do Hestia (1.9.7 → 1.9.8) rodou `v-rebuild-web-domains` e derrubou o site:
   `/` passou a devolver `200` com a página padrão "Success!" do Hestia em vez
   do `307` pro `/auth`. O app (Node/PM2 na porta 3000) nunca foi tocado, só o
   proxy reverso na frente dele.

   O domínio usa um template customizado (`node-ssr`) que só tinha variante
   `apache2/php-fpm/node-ssr.tpl`, não `apache2/node-ssr.tpl` (a domínio usa
   `BACKEND: default`, sem PHP). Sem essa variante, o rebuild escreve o
   conteúdo **do template nginx** dentro do arquivo de config **do Apache**
   (`/etc/apache2/conf.d/domains/gpa.t00ls.dev.conf`), quebrando o
   `apache2ctl configtest` pra sempre (`Include` de um arquivo com nome errado,
   `nginx.*` em vez de `apache2.*`), e o nginx real (`/etc/nginx/conf.d/
domains/gpa.t00ls.dev*.conf`) fica no template `default` genérico
   (proxy pra Apache na 8080, que serve a página placeholder), não no
   `node-ssr` (proxy direto pra Node na 3000).

   Criei `apache2/node-ssr.tpl`/`.stpl` (cópia do `default.tpl`/`.stpl`,
   Apache não precisa fazer nada de verdade aqui, é só um stub válido pra não
   quebrar o `apache2ctl configtest` global, que afeta `t00ls.dev` e
   `cepeg.t00ls.dev` também). **Não resolveu.** Rodei
   `v-change-web-domain-tpl admin gpa.t00ls.dev node-ssr yes` duas vezes
   depois disso: as duas vezes reproduziu o MESMO bug (conteúdo nginx dentro
   do arquivo apache, `apache2 restart failed`). Não é falta do arquivo de
   template: é bug real na resolução/geração do Hestia 1.9.8 pra essa
   combinação de template custom + backend default.

   **Fix aplicado (sobrevive até o próximo `v-rebuild-web-domains`, não é
   permanente)**: sobrescrevi os 4 arquivos gerados diretamente: 2 nginx
   (`gpa.t00ls.dev.conf`/`.ssl.conf`, proxy direto pra `127.0.0.1:3000`, o
   conteúdo certo do template `node-ssr`) e 2 apache (mesmos nomes, stub
   válido baseado no `default.tpl`/`.stpl` renderizado à mão, só pra não
   quebrar o `configtest`). **Qualquer coisa que dispare
   `v-rebuild-web-domains` de novo, outro update do Hestia, ou qualquer
   comando Hestia que mexa neste domínio (`v-change-web-domain-tpl`,
   `v-add-web-domain-ssl-*`, etc.), reverte isso e quebra o site de novo.**
   Backup dos 4 arquivos corretos em `/tmp/gpa-conf-backup-working/` no
   próprio `sv1` (`nginx.conf`, `nginx.ssl.conf`, `apache2.conf`,
   `apache2.ssl.conf`). Restaurar com um `cp` direto se acontecer de novo.
   Verificar sempre com `curl -sD - https://gpa.t00ls.dev/ | grep
content-security-policy`: se sumir, é este bug batendo de novo.

   **Efeito colateral do mesmo rebuild, achado logo depois**: o `chmod` do
   Hestia sobre `public_html/` reverteu a permissão pra `751`
   (`drwxr-x--x`, igual às outras duas docroots da VPS), mas o deploy do
   CI/CD precisa de escrita de grupo ali pra criar `.output.new` (o usuário
   SSH do deploy está no grupo `www-data`, não é o dono `admin`). O próximo
   deploy quebrou com `mkdir ... Permission denied` no rsync. Corrigido com
   `chmod g+w public_html/` (vira `771`), **mesmo aviso do item acima: se
   `v-rebuild-web-domains` rodar de novo neste domínio, verificar também
   `ls -ld .../public_html/` (precisa ter `w` no grupo) antes de assumir que
   só o vhost quebrou.**

   **Recorreu em 05/08/2026.** Gatilho desta vez: eu mesmo rodei
   `v-rebuild-web-domain admin gpa.t00ls.dev yes` manualmente (investigando
   um 403 "Access Denied" que já existia antes desse comando — o disparo
   original foi outra causa não identificada, provavelmente um auto-update
   ou renovação de SSL do próprio Hestia, a julgar pelo timestamp dos
   arquivos gerados). Sintomas idênticos: `apache2ctl configtest` falhando
   no `Include` do `nginx.forcessl.conf*` dentro do `.conf` do Apache,
   `public_html/` servido via autoindex (403) em vez de proxy pra 3000, e
   `chmod` de `public_html/` revertido pra `751`. Restaurado com o mesmo
   backup em `/tmp/gpa-conf-backup-working/` no `sv1` (`cp` dos 4 arquivos
   pros destinos em `/etc/nginx/conf.d/domains/` e
   `/etc/apache2/conf.d/domains/`, `systemctl reload` nos dois) +
   `chmod g+w public_html/` de novo. **Confirma que o backup continua
   sendo a forma mais rápida de recuperar: não tentar entender/consertar o
   bug do Hestia de novo, só restaurar os 4 arquivos e os dois `reload`.**
   Lição operacional: `v-rebuild-web-domain`/`v-rebuild-web-domains` NUNCA
   deve ser rodado neste domínio como parte de troubleshooting -- é
   exatamente o comando que reproduz o bug.
