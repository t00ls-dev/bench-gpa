# Plano de migração: saída do ecossistema TanStack

Este documento parte de uma decisão já tomada pelo usuário, não de um problema
técnico medido. A avaliação anterior (`docs/avaliacao-arquitetural-2026-08-01.md`)
concluiu que nenhuma migração estrutural era necessária: essa conclusão continua
tecnicamente válida, mas o usuário optou por migrar mesmo assim, por preferência
declarada. Este plano assume essa decisão e foca em como sair com segurança, não
em se deve sair.

Execução: fica a critério do usuário, fase a fase. Este documento não inicia
nenhuma mudança de código.

As seções 3 a 5 avaliam, com dados reais (versões publicadas, maturidade,
alternativas), as duas peças específicas que a proposta original citava sem
detalhar (Fastify e Drizzle ORM) e checam se renovar o TanStack em vez de
sair dele resolveria algo (não resolve: não há defasagem de versão).

## 1. Inventário real do que existe hoje

Levantado no código em 01/08/2026, não por suposição:

- Runtime: Bun. Build: Vite 8 + plugin `tanstackStart` + `nitro` (preset
  `node-server`). Sem staging, deploy direto via CI para produção.
- Rotas: 20 arquivos em `src/routes/`, 11 usos de `createFileRoute`. Padrão
  `X.tsx` (wrapper de layout/auth) + `X.page.tsx` (conteúdo), já documentado
  em `src/routes/README.md`.
- Server functions: 8 arquivos `*.functions.ts` + `auth-api.ts`, 35 funções via
  `createServerFn`.
- `@tanstack/react-query`: usado em 11 arquivos (`admin-audit-panel.tsx`,
  `admin-gate.tsx`, `admin-system-panel.tsx`, `admin-user-management.tsx`,
  `app-footer.tsx`, `filter-bar.tsx`, `use-area-products-view.ts`, e as
  páginas `admin.docs`, `admin.index`, `index`, `produto`, `upload`).
  `staleTime`/`gcTime` calibrados por tela (README: dashboard/rankings 60s,
  hierarquia de área e filtros 5min, datas importadas 60s, role 5min/user).
- `@tanstack/react-virtual`: 1 uso, `area-table.tsx`.
- `@tanstack/react-table`: zero uso. Não há nada para remover aqui, a
  proposta original presumia uma dependência que nunca foi adotada.
- Middlewares via `createMiddleware` (`@tanstack/react-start`):
  `errorMiddleware` (`src/start.ts`, captura erro e renderiza página de
  erro), `requireAuth` (`src/lib/auth-middleware.ts`), rate limit
  (`src/lib/rate-limit.middleware.ts`).
- CSP nonce: `src/lib/csp.ts` guarda o nonce corrente numa variável de
  módulo (`setCspNonce`/`getCspNonce`), assumindo que o SSR do Start
  processa uma requisição por vez de forma isolada nesse ponto.
- `src/server.ts`: entry point customizado. Envolve o server-entry do
  Start, faz patch em `ServerResponse.prototype.writeHead` para forçar
  `Cache-Control: no-cache` em respostas HTML, implementa `/api/pdf-download`
  fora do envelope RPC de `createServerFn` (porque precisa de controle total
  do `Response`, corpo binário e header `Content-Disposition`), roda
  `assertSafeBoot` e captura erro de boot.
- Banco: MariaDB, `mysql2/promise` cru (sem ORM), 16 stored procedures em
  `scripts/migrate-schema.sql`.
- Auth: JWT + bcrypt, cookie `httpOnly`, sessão com slide por inatividade
  (`docs/sessao-inatividade-manter-conectado.md`).
- Formulários: nenhum usa lib de formulário hoje. Login, upload e admin usam
  `useState` + `onSubmit` nativo.
- Infra: Debian + Nginx + PM2, já é exatamente a proposta original de
  infraestrutura. Nada muda na Fase 2 além de topologia de processo (seção 7).
- Testes: 39 arquivos, 347 testes, `bun run check` (lint + test) e
  `bun run typecheck` já passam limpos.

## 2. Decisão em aberto que este plano não toma sozinho

A proposta original pede Fastify no backend e não especifica se o frontend
mantém SSR. Isso é uma bifurcação real, não um detalhe de implementação, e
muda o que a Fase 3 e a Fase 4 fazem:

**Opção A, recomendada: SPA + API separada.**
Vite + React Router (modo declarativo, sem framework mode) gera um bundle
estático servido direto pelo Nginx, sem processo Node para o frontend.
Fastify vira só a API (substitui as 35 `createServerFn` e o `server.ts`).
Justificativa: o app é interno, atrás de login, sem necessidade de SEO
(o próprio `__root.tsx` já remove metadados de indexação por esse motivo).
SSR hoje não entrega valor de descoberta, só o de primeira pintura, e o
custo de manter CSP nonce por requisição, o patch de `ServerResponse` e o
bridging de `server.ts` desaparece inteiro. Perda real: um flash de
carregamento na primeira visita, ausente hoje. Menor risco entre as três.

**Opção B: React Router v7 em framework mode.**
Mantém SSR, mas o motor de build passa a ser o próprio plugin Vite do React
Router, não Fastify. Nesse caso "sair do TanStack" não implica adotar
Fastify como servidor principal: Fastify ficaria de fora ou serviria só como
API auxiliar. Estruturalmente mais parecido com o que existe hoje (mesma
forma, motor trocado), mas não cumpre literalmente a proposta original de
"Fastify no backend" como peça central.

**Opção C: Fastify com SSR manual.**
Fastify serve a API e também renderiza o React via Vite SSR manual, com
React Router usado como biblioteca de rotas dentro desse SSR próprio. Mais
controle, mas reconstrói à mão o que o Start hoje faz de graça
(`renderToPipeableStream`, injeção de head, nonce, hidratação). Maior
esforço e maior superfície de bug novo, sem benefício adicional sobre B.

Este plano segue estruturado para funcionar com qualquer uma das três, mas
a Fase 3 e a Fase 4 abaixo assumem a Opção A como padrão (é a que o roteiro
recomenda). Trocar de opção não invalida a Fase 1.

## 3. Alternativa avaliada: renovar o TanStack em vez de sair

Antes de aprofundar Fastify e Drizzle, vale checar se "sair do TanStack"
resolveria um problema de desatualização, porque nesse caso bastaria
atualizar dependências, sem trocar de framework. Comparado o que está
instalado (`package.json`) com a versão mais recente publicada no
registro npm em 01/08/2026:

| Pacote | Instalado | Mais recente | Defasagem |
| --- | --- | --- | --- |
| `@tanstack/react-query` | 5.101.4 | 5.101.4 | Nenhuma |
| `@tanstack/react-router` | 1.170.18 | 1.170.18 | Nenhuma |
| `@tanstack/react-start` | 1.168.33 | 1.168.34 | 1 patch |
| `@tanstack/react-virtual` | 3.14.9 | 3.14.9 | Nenhuma |
| `@tanstack/router-plugin` | 1.168.23 | 1.168.23 | Nenhuma |

Não há defasagem real: o projeto já está, na prática, na versão mais
recente de todo o ecossistema TanStack em uso, e os pacotes seguem
recebendo releases ativas e frequentes (não é um projeto abandonado ou em
manutenção mínima). "Renovar" não é um caminho disponível como alternativa
à saída, porque não há nada desatualizado para renovar: a decisão de sair
não é motivada por obsolescência, é por preferência sobre a forma da
ferramenta (acoplamento de Router+Start+Query como pacote único, modelo
de arquivo de rota, etc.), algo que atualizar versão nenhuma resolve.

## 4. Avaliação: Fastify

- **Maturidade**: versão 5.x (`fastify@5.11.0` no momento desta avaliação),
  projeto iniciado em 2016, portanto quase 10 anos de desenvolvimento
  contínuo e múltiplas major versions já estabilizadas. MIT.
- **Comunidade**: grande e ativa, ecossistema extenso de plugins oficiais
  e de terceiros (`@fastify/*`), amplamente adotado em produção fora deste
  projeto.
- **Estabilidade**: alta. Validação de schema embutida (JSON Schema/Ajv,
  com suporte a Zod via `fastify-type-provider-zod`), sistema de hooks
  (`onRequest`/`preHandler`) que cobre bem o que hoje é feito com
  `createMiddleware` (`requireAuth`, rate limit).
- **Limitações**: é uma ferramenta pensada primeiro para Node.js. Roda em
  Bun via camada de compatibilidade, funciona, mas não é o alvo primário
  de otimização do projeto Fastify. Para uma API pequena (35 endpoints),
  parte do modelo de encapsulamento de plugins do Fastify é complexidade
  que este projeto não usaria.
- **Alternativas**:
  - **Express 5.x** (`5.2.1`): comunidade ainda maior, modelo mais simples,
    mas sem validação de schema embutida e sem os hooks tipados do Fastify.
    Perde a maior vantagem prática do Fastify para este projeto.
  - **Hono** (`4.12.33`): mais jovem que Fastify, mas já maduro (major 4,
    lançamentos frequentes), MIT, e desenhado desde o início para rodar
    nativamente rápido em Bun (e Deno, Cloudflare Workers), diferente do
    Fastify, que trata Bun como alvo de compatibilidade. Para um projeto
    que já roda 100% em Bun, Hono é arquiteturalmente mais alinhado ao
    runtime atual do que Fastify. É mais leve, tem sintaxe de rota
    semelhante, e integra bem com Zod (`@hono/zod-validator`).
  - Manter tudo em uma única aplicação (sem framework HTTP separado): dado
    que já existe `src/server.ts` como entry point customizado, seria
    possível expor a API sem framework nenhum, só `Bun.serve`. Mais
    trabalho manual (roteamento, parsing de corpo) sem ganho evidente
    sobre usar uma lib fina como Hono.

Recomendação: reavaliar Hono como alternativa ao Fastify antes de comprometer
a Fase 3 (Backend) a ele. A proposta original escolheu Fastify sem comparar
com opções mais alinhadas ao runtime já usado no projeto (Bun).

## 5. Avaliação: Drizzle ORM

- **Modelagem**: schema definido em TypeScript, próximo da sintaxe SQL
  (diferente do DSL próprio do Prisma). `drizzle-kit` gera migrações a
  partir de diffs de schema.
- **Maturidade**: `drizzle-orm@0.45.2`, ainda em versão 0.x depois de
  cerca de três anos de desenvolvimento público. Não é sinal de abandono
  (releases frequentes), mas é sinal de que a API ainda pode ter mudanças
  de breaking change fora do ritmo normal de semver 1.0+.
- **Migrações**: `drizzle-kit` cobre geração e aplicação de migração para
  tabelas comuns, mas não gerencia stored procedures. As 16 stored
  procedures que hoje concentram a maior parte da lógica de leitura/escrita
  (`scripts/migrate-schema.sql`) continuariam fora do alcance do ORM,
  chamadas via SQL cru de qualquer forma (`sql` template do próprio
  Drizzle, ou mantendo `mysql2/promise` como está). Na prática, adotar
  Drizzle envolveria só as poucas consultas ad hoc fora das procedures,
  não o núcleo do acesso a dado deste projeto.
- **Portabilidade MariaDB/PostgreSQL**: Drizzle suporta os dois dialetos,
  mas não de forma transparente. Trocar de dialeto MySQL/MariaDB para
  PostgreSQL no Drizzle ainda exige revisar schema e queries (tipos,
  funções específicas de cada banco): não é "escreve uma vez, roda nos
  dois" como a proposta original sugere ao falar em "compatibilidade
  arquitetural com PostgreSQL".
- **Performance**: comparável a `mysql2/promise` cru para os casos que
  cobre (é uma camada fina sobre o driver, não um ORM pesado como Prisma
  com muitas camadas de abstração). Não é um fator de decisão aqui.
- **Alternativas**:
  - **Prisma** (`7.9.1`): muito mais maduro (major 7, anos de estabilidade
    1.0+), mas mais pesado, com etapa de geração de código
    (`prisma generate`) e um DSL de schema próprio, mais distante do SQL
    que o projeto já usa nas 16 procedures.
  - **Kysely** (`0.29.4`): mais minimalista que Drizzle, só query builder
    tipado, sem gestão de migração própria robusta. Também pré-1.0.
  - **Manter `mysql2/promise` cru** (estado atual): sem dependência nova,
    já testado (347 testes cobrindo os retornos), mas sem tipagem
    automática do resultado de query, precisa de tipo manual por chamada.

Recomendação: mantém-se o que a avaliação anterior já dizia: não há dor
medida hoje que justifique trocar de camada de acesso a dado. Se a decisão
for adotar Drizzle mesmo assim (por preferência, como a saída do TanStack),
o footprint real seria pequeno: só as consultas fora das 16 procedures,
não uma reescrita da camada de dados inteira. Trazer Drizzle não precisa
estar amarrado à saída do TanStack, são decisões independentes.

## 6. Fase 1: Fundação (não depende da opção A/B/C)

Trabalho que vale a pena fazer primeiro porque é reversível, não quebra nada
em produção, e reduz o risco de todas as fases seguintes:

- [ ] Rodar a skill `dependency-management` para confirmar que não há
  dependência hoje sem uso antes de somar dependências novas por cima.
- [ ] Separar, dentro de cada `*.functions.ts`, a lógica de negócio (query,
  regra) do wrapper `createServerFn`. Hoje as duas coisas estão fundidas no
  mesmo arquivo. Extrair a lógica para uma função pura testável é reversível
  e não depende de qual framework vai chamá-la depois (Fastify e Start
  conseguem invocar a mesma função pura igualmente).
- [ ] A partir dos 347 testes existentes, garantir que cada uma das 35
  funções tem cobertura da função pura extraída, não só do wrapper. Isso
  vira o contrato de comportamento que a futura rota Fastify precisa
  preservar byte a byte.
- [ ] Documentar a assinatura (schema Zod de entrada, formato de saída) de
  cada uma das 35 funções num único lugar. Isso é a especificação da futura
  API Fastify, sem escrever uma linha de Fastify ainda.
- [ ] Nenhuma mudança visual ou de comportamento nesta fase. Se um teste
  muda de resultado, é regressão, não refactor esperado.

## 7. Fase 2: Infraestrutura

A proposta original (Debian + Nginx + PM2) já é a infraestrutura real de
produção hoje: não há migração de máquina, sistema operacional ou processo
de deploy a fazer aqui.

O que muda é topologia de processo, dependendo da opção escolhida na seção 2:

- Opção A: dois artefatos em vez de um. Frontend vira arquivos estáticos
  (`nginx` serve direto, sem PM2 para o frontend). API Fastify vira um
  processo PM2 novo, substituindo o processo Nitro atual.
- Opção B ou C: continua sendo um processo Node só, PM2 troca de alvo
  (`.output/server/index.mjs` do Nitro vira o build do React Router ou do
  Fastify+Vite SSR), sem mudança de contagem de processos.

Itens a validar antes de qualquer swap de produção:

- [ ] Atualizar o template Nginx (`node-ssr.tpl`/`.stpl`, ver
  `docs/migracao-vps-autossuficiente.md`) para a nova topologia de upstream.
- [ ] Não existe ambiente de homologação formal hoje. Antes do swap final,
  rodar a nova stack numa porta paralela na mesma VPS (ou subdomínio) e
  validar com tráfego real de teste antes de apontar o Nginx principal para
  ela.
- [ ] Confirmar que o rollback automático do workflow de deploy (troca
  atômica de `.output`, restart PM2, reversão em falha de health-check)
  continua funcionando com o novo formato de build.
- [ ] Logs e heartbeat de cron (`cron_heartbeat`, purge, refresh-universe)
  não dependem do Start, não são afetados por esta migração.

## 8. Fase 3: Backend (Fastify ou Hono, ver seção 4)

Assumindo Opção A (API separada). O texto abaixo usa "Fastify" como
nome de referência, mas a avaliação da seção 4 recomenda decidir entre
Fastify e Hono antes de começar esta fase; a estrutura do trabalho é a
mesma nos dois casos, só a API de rota/hook muda:

- [ ] Portar as 35 funções puras extraídas na Fase 1 para rotas do
  framework escolhido. A lógica não muda, só o transporte (de
  `createServerFn`/RPC para rota HTTP normal).
- [ ] `requireAuth` (hoje `createMiddleware`) vira hook de requisição do
  framework escolhido (`onRequest`/`preHandler` no Fastify, middleware de
  rota no Hono). Mesma chamada a `resolveSession`, mesmo comportamento de
  slide por inatividade.
- [ ] Rate limit (`rate-limit.middleware.ts`) vira hook equivalente,
  mesmas 4 faixas por IP + balde por conta hoje documentadas no README.
- [ ] `/api/pdf-download` (hoje fora do envelope RPC por precisar de
  `Response` bruto) fica mais simples nesse mundo: nem Fastify nem Hono
  têm envelope RPC a evitar, vira uma rota normal.
- [ ] `jsonwebtoken`, `bcrypt`, `zod`, `mysql2/promise`: nenhum muda. Não
  fazem parte do que está sendo removido.
- [ ] CSP nonce: se a Opção A for confirmada (sem SSR), o nonce por
  requisição deixa de fazer sentido, já que não há HTML gerado no servidor
  para injetar. Trocar por CSP baseada em hash estático do bundle, mais
  simples que o padrão atual de variável de módulo global (que já é frágil
  hoje: assume implicitamente que o Start isola essa variável por
  requisição, e nada nesse ponto do código garante isso sob concorrência
  real). Se a Opção B ou C for escolhida no lugar, esse ponto precisa de
  contexto por requisição de verdade (`AsyncLocalStorage`), não repetir o
  padrão de variável global.
- [ ] Drizzle fica fora desta fase, deliberadamente. Não há dor hoje com SQL
  cru (16 stored procedures, `mysql2/promise` direto), e amarrar troca de
  ORM à troca de framework aumenta o raio de mudança de uma vez só, contra
  a regra de "não reescrever tudo". Se um dia houver dor real com SQL cru,
  vira uma decisão isolada e independente desta migração.

## 9. Fase 4: Frontend

Assumindo Opção A:

- [ ] Rotas: recriar as 20 rotas com React Router. O padrão já existente de
  separar `X.tsx` (layout/guarda de auth) de `X.page.tsx` (conteúdo) reduz o
  trabalho: a página em si já está isolada da camada de roteamento, só o
  wrapper muda.
- [ ] `@tanstack/react-query`: usado em só 11 arquivos, o que torna viável
  trocar por fetch nativo mais um hook próprio. Mas antes de trocar, decidir
  conscientemente: o Query hoje dá de graça `staleTime`/`gcTime` calibrados
  por tela e dedup de requisição em voo, que teriam que ser reimplementados
  à mão (e ficariam redundantes com o `SimpleCache` que já existe do lado do
  servidor). Entre as quatro peças do TanStack em uso, é a que menos atrapalha
  ficar e a que mais trabalho dá para substituir sem perder comportamento.
  Vale reavaliar se "sair do TanStack" precisa incluir o Query ou se ele pode
  ficar como exceção justificada, mesmo mantendo a saída de Start/Router.
- [ ] `@tanstack/react-virtual`: único uso é `area-table.tsx`. Antes de
  escolher substituto (`react-window` ou remover virtualização), medir
  quantas linhas a tabela de área tipicamente renderiza em produção: se o
  volume real for pequeno, pode não precisar de virtualização nenhuma.
- [ ] React Hook Form (da proposta original): não adicionar por padrão.
  Nenhum formulário hoje (login, upload, admin) tem validação cruzada
  complexa que justifique a dependência nova. Reavaliar só se um formulário
  genuinamente complexo aparecer.
- [ ] Migrar rota por rota, uma PR por rota, não tudo de uma vez. Cada PR
  troca uma rota da stack antiga para a nova mantendo as outras 19
  funcionando sem alteração.

## 10. Fase 5: Melhorias avançadas

Fora de escopo deste plano. Só depois de Fases 1 a 4 estáveis em produção
por tempo suficiente para confiar na base nova. Nenhuma otimização, reescrita
ou funcionalidade nova entra antes disso.

## 11. Regra do item mais complexo por último

O item de maior risco é a troca do motor de SSR/build (Start para a opção
escolhida), porque é o único ponto que toca autenticação (parsing de
cookie, CSP), build e deploy, e as 20 rotas ao mesmo tempo. Por isso:

1. Ele só começa depois da Fase 1 completa (contratos extraídos e testados).
2. Só depois do backend Fastify rodando em paralelo e validado (Fase 3).
3. A troca de rota (Fase 4) é feita incrementalmente, uma de cada vez, nunca
   como um corte único das 20 rotas.

## 12. Critérios de aceitação

- Os 347 testes (ou mais, com os novos da Fase 1) continuam passando.
- Nenhuma regressão observável nas 20 rotas e nas 35 operações de servidor
  (checklist manual com a skill `run`, dev server + login real).
- CSP, HSTS, Turnstile e rate limit continuam com o mesmo comportamento
  (mesmos testes de `src/lib/rate-limit.test.ts` e afins continuam válidos).
- Deploy via GitHub Actions + PM2 continua atômico, com rollback automático
  em falha de health-check.
- MariaDB continua o banco. Nenhum dado migra. Camada de acesso (ORM ou não)
  é decisão fora deste plano.

## 13. Riscos

- Se a Opção A for escolhida, a perda de SSR muda a experiência percebida
  (flash de carregamento na primeira visita). Validar com uso real antes do
  swap final de produção, não só com teste automatizado.
- CSP nonce por requisição precisa de solução explícita em qualquer opção
  (hash estático na A, `AsyncLocalStorage` na B/C). Fazer errado aqui é
  risco de segurança silencioso (nonce vazando entre requisições
  concorrentes), não só estético.
- Maior risco de projeto, não de código: sem prazo e sem problema real
  motivando a migração, o risco mais provável é abandono no meio do caminho
  (metade das rotas migrada, metade não). A ordem incremental e reversível
  desta seção existe para que parar em qualquer ponto intermediário deixe o
  sistema funcionando, não quebrado.

## 14. Próximos passos

1. Decidir entre Opção A, B ou C (seção 2). O restante do plano (Fases 3 e
   4) muda de conteúdo dependendo da escolha.
2. Decidir entre Fastify e Hono para a Fase 3 (seção 4), e se Drizzle entra
   ou não como camada opcional para as consultas fora das stored procedures
   (seção 5, decisão independente da saída do TanStack).
3. Se Fase 1 for aprovada para começar, ela não depende de nenhuma dessas
   decisões e pode iniciar de imediato, em PRs pequenas, uma função por vez.
4. Nenhum código desta migração começa sem confirmação explícita, fase a
   fase, como combinado.
