# Avaliação arquitetural: Bench GPA (01/08/2026)

Resposta a um pedido de plano de migração arquitetural (Debian/Nginx/PM2,
Fastify e Drizzle ORM no backend, portabilidade MariaDB/PostgreSQL,
remoção do ecossistema TanStack em favor de React Router). Antes de
planejar qualquer execução, cada peça da proposta foi validada contra o
código e a infraestrutura reais, não aceita "no papel". Ver
`.opencode/skills/architecture-review/SKILL.md` para o processo usado
(descrever o problema antes da solução, revisitar a decisão atual antes de
descartá-la, medir custo real da migração).

Conclusão resumida: nenhuma migração estrutural recomendada agora. Boa
parte do que a proposta pedia como "alvo" já é a realidade deste projeto;
o restante não tem um problema concreto que o justifique.

---

## Estado atual vs. proposta (verificado, não assumido)

| Camada            | Proposta                                          | Realidade no Bench GPA hoje                                                                                                                                               |
| ----------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Infra             | Debian, Nginx, PM2                                | Já é isso: Debian 12 (bookworm), Nginx, PM2, self-hosted na VPS Hestia (`docs/migracao-vps-autossuficiente.md`, `docs/analise-servidor-producao-2026-07-31.md`)           |
| Backend framework | Fastify                                           | TanStack Start (`createServerFn` mais middleware `requireAuth`/`requireRateLimit`), 8 arquivos `*.functions.ts`, 20 rotas                                                 |
| ORM               | Drizzle                                           | Não existe ORM hoje: `mysql2/promise` puro, SQL escrito à mão, stored procedures com transação e rollback (`refresh_product_universe`, `purge_old_aggs`)                  |
| Validação         | Zod                                               | Já é Zod v4, centralizado em `src/lib/schemas.ts`. A proposta já é a realidade                                                                                            |
| Auth              | JWT com bcrypt ou Argon2                          | JWT com bcrypt v6. A proposta já aceita bcrypt como opção válida                                                                                                          |
| Banco             | MariaDB com portabilidade Postgres                | MariaDB 11.4, com stored procedures em sintaxe MariaDB (não portam para PL/pgSQL sem reescrita)                                                                           |
| Frontend          | React Router, React Hook Form, Tailwind, Recharts | Tailwind e Recharts já são a stack. React Router substituiria TanStack Router (roteamento file-based, 20 rotas, SSR integrado)                                            |
| Remoção TanStack  | Router, Query, Table                              | Query usado em só 12 arquivos. Table: uso zero no projeto. `@tanstack/react-virtual` está em uso ativo (`src/components/area-table.tsx`) e não foi mencionado na proposta |
| Build             | (não avaliado na proposta)                        | Já otimizado: migração Vite 7 para 8 (PR #93) derrubou o build de 25-35s para cerca de 2s, medido e registrado em `docs/medicao-performance.md`                           |
| Manutenção        | (não avaliado na proposta)                        | Mantenedor único humano (`git log` mostra 1 pessoa mais bots: Dependabot, GitHub Actions, o antigo Lovable/gpt-engineer da Era 1)                                         |

---

## Avaliação por peça

### Infraestrutura: nada a fazer

A infraestrutura "alvo" da proposta já é o estado atual em produção. Não é
uma fase de migração, é a realidade.

### Backend (Fastify): não recomendado

`createServerFn` do TanStack Start dá, de graça, uma chamada RPC tipada
client para server sem precisar manter uma camada REST/GraphQL separada.
Trocar por Fastify significa reescrever os 8 arquivos de server functions
e construir do zero essa camada de contrato tipado que hoje é automática:
custo real, sem nenhum problema atual que o justifique. A proposta não
descreve nenhum problema concreto com o backend atual, só nomeia uma
alternativa.

### ORM (Drizzle): única peça com mérito real, mas não como migração

Não existe ORM hoje, então isto não seria "trocar", seria "adicionar". Há
um argumento genuíno: SQL escrito à mão tem risco de erro humano em
queries mais complexas. Mas as stored procedures com transação
(`refresh_product_universe`, `purge_old_aggs`) não têm equivalente direto
trivial em Drizzle e continuariam como SQL cru de qualquer forma.

Recomendação: não é uma fase de migração, no máximo um item de backlog de
baixa prioridade, opcional e isolado (Drizzle só em queries de leitura
simples, mantendo as procedures como estão), e só se ou quando aparecer
dor real com SQL manual.

### Banco de dados (portabilidade Postgres): não recomendado agora

Sintaxe de stored procedure MariaDB não é portável para PL/pgSQL sem
reescrita completa. Não há hoje nenhum motivo concreto (custo,
disponibilidade, decisão de negócio) pedindo Postgres: seria investir em
uma opcionalidade hipotética. MariaDB sozinha já atende os critérios de
aceitação do próprio documento original (open source, madura,
self-hosted).

### Frontend (remover TanStack Router/Query): não recomendado

- Query em 12 arquivos é uma superfície pequena, mas Router não é
  separável de Start: TanStack Start é construído sobre TanStack Router.
  Remover um implica remover o outro, ou seja, seria trocar o framework
  inteiro, não só o roteador.
- Nenhum problema medido (bug de framework recorrente, degradação de
  performance, dificuldade de manutenção) foi apontado, só a alternativa
  genérica.
- `react-virtual` (usado de verdade, sem substituto proposto) ficaria
  órfão no meio da troca.

---

## Decisão central: TanStack Start/Router/Query/Table

Não migrar. Contra os critérios definidos em
`.opencode/skills/architecture-review/SKILL.md`:

Sinais de "não vale a pena" presentes: a stack atual funciona hoje, sem
medição de problema, mantenedor único (qualquer migração estrutural tira a
rede de segurança de rollback durante a transição, sem um segundo par de
olhos para revisar).

Sinais de "vale investigar" ausentes: nenhum bug recorrente causado por
limitação do framework, nenhuma métrica degradando, nenhum problema de
manutenção ou segurança do TanStack em si.

---

## Ordem de fases proposta, ajustada à realidade

| Fase proposta                  | Status real                                                                            |
| ------------------------------ | -------------------------------------------------------------------------------------- |
| 1. Fundação                    | Já em dia: TS strict, lint, testes, CI cobrindo isso                                   |
| 2. Infraestrutura              | Já é a realidade em produção. Nada a migrar                                            |
| 3. Backend (Fastify/Drizzle)   | Não recomendado como fase. Drizzle isolado vira item de backlog opcional, não migração |
| 4. Frontend (remover TanStack) | Não recomendado. Sem problema real que justifique                                      |
| 5. Melhorias avançadas         | Só quando um problema real e medido aparecer. Não antecipar                            |

---

## Relatório final

- **Estado atual**: a arquitetura já é largamente o que a proposta
  descrevia como alvo. A maior parte do documento original pedia migrar
  para onde o projeto já está.
- **Problemas encontrados**: nenhum problema técnico concreto motivando as
  trocas de backend/frontend propostas. A lacuna real é que o documento
  original lê como um template genérico, não escrito olhando para este
  repositório (pede remover TanStack Table, que não existe aqui; ignora
  react-virtual, que existe e é usado).
- **Decisões mantidas**: TanStack Start/Router/Query, MariaDB, JWT com
  bcrypt, infra self-hosted (Debian/Nginx/PM2). Todas revalidadas, cada
  uma com motivo técnico específico (não "porque sempre foi assim").
- **Decisões alteradas**: nenhuma migração estrutural recomendada agora.
- **Migração recomendada**: nenhuma de escopo grande. Único item de
  backlog opcional e de baixo risco: avaliar Drizzle só para queries de
  leitura simples, isolado, sem tocar procedures nem o backend como um
  todo, e só se ou quando aparecer dor real com SQL manual.
- **Riscos**: o maior risco identificado nesta auditoria não é técnico, é
  de processo. Seguir um plano de migração genérico sem validar contra o
  código real gastaria semanas reescrevendo o que já funciona.
- **Próximos passos**: nenhum, arquiteturalmente. Seguir evoluindo
  incrementalmente como o projeto já vem fazendo (PRs pequenos, CI como
  gate, `docs/` registrando decisões).
