# História do projeto: Lovable → Supabase → self-hosted

Linha do tempo reconstruída do histórico real do `git log` (1031 commits em
30/07/2026), não de memória — cada marco abaixo tem o hash do commit que o
originou. Existe porque os seis documentos antigos em `docs/improvements/`
descreviam o código em momentos específicos dessa jornada sem nunca contar a
jornada em si; isto consolida o "como chegamos aqui" que ficava implícito.

---

## Era 1 — Lovable + Supabase (12/06/2026 – 02/07/2026)

O projeto nasceu na plataforma **Lovable** (commits assinados por
`gpt-engineer-app[bot]`), que gera um app React com **Supabase** (Postgres +
Auth) já embutido por padrão. O primeiro commit substantivo,
`3d79e49` ("Implementou sistema de vendas", 12/06), já trazia
`src/integrations/supabase/{client.ts,client.server.ts,auth-middleware.ts,types.ts}`
— não houve uma fase "sem Supabase" a apagar depois; era a plataforma desde o
dia zero.

Cerca de três semanas de iteração via prompts na Lovable, com mensagens de
commit genéricas (`Changes`, `Lovable update`, `Update site info for
publish`) típicas de edição por IA, não de um humano descrevendo intenção:

- `3d79e49` (12/06) — sistema de vendas inicial, agregação no banco
- `aa2febc` (15/06) — filtros, gráficos e busca
- `cb93aaa` (17/06) — página de Análise de Área
- `77436a5`/`a1a8e86` (25/06) — troca de projeto/credenciais Supabase
- `0f82df6` (02/07) — último commit "Lovable update"

Depois de 02/07 os commits passam a ter mensagens descritivas em português,
técnicas, sem a assinatura do bot — marca a transição de "gerado por prompt"
para desenvolvimento assistido deliberado (revisões de segurança, planejamento
de arquitetura). `c746d37`/`633e00b` (03/07) já são guidelines de revisão de
segurança para o código herdado da Lovable.

## Era 2 — Experimento com Vercel (11/07 – 18/07)

Enquanto o app ainda rodava em Supabase, houve uma janela curta testando
deploy na Vercel: `@vercel/analytics` (`6f1c09e`, 11/07), `@vercel/speed-insights`
(`9804711`, 12/07), plugin Nitro pra Vercel (`d238e22`, 17/07), redeploys de
teste (`f609686` 15/07, `9075931` 18/07). Não avançou — o projeto seguiu para
self-hosted em paralelo, e a integração Vercel foi formalmente desconectada
depois (ver Era 4).

## Era 3 — Planejamento e execução da migração para self-hosted (16/07 – 21/07)

`fc29fed` (16/07) abre `docs/migracao-vps-autossuficiente.md` — o plano de
sair do Supabase (Postgres gerenciado + Auth gerenciado) para uma VPS Hestia
CP própria com MariaDB e autenticação própria. Passos principais, em ordem:

| Data | Commit | O quê |
| --- | --- | --- |
| 16/07 | `fc29fed` | Plano de migração VPS (MariaDB + JWT + Hestia) |
| 17/07 | `67e0ada` | Plano de deploy Hestia (template node-ssr, `gpa.t00ls.dev`) |
| 18/07 | `22bcded` | Config de build pra VPS (Nitro `node-server`, PM2) |
| 19/07 | `2a3aff3` | Pool `mysql2` + schema MariaDB com 15 stored procedures |
| 19/07 | `827086f` | Troca Supabase Auth por JWT + bcrypt (`auth-middleware`, `auth-api`) |
| 21/07 | `9c0092d` | Destructuring de multi-result-set das procs; pipeline de import migrado pra MariaDB |
| 21/07 | `8fef562` | **"Migração Supabase concluída"** — limpeza e testes |
| 21/07 | `31aae28` | `supabase/` removido do repo; +43 testes (27%→46% cobertura) |

Menos de uma semana entre o plano (`fc29fed`) e a conclusão (`8fef562`) —
migração rápida porque o escopo (dashboard analítico interno, sem
multi-tenant, sem integrações externas de auth) era pequeno o bastante pra
reescrever em vez de portar incrementalmente.

## Era 4 — CI/CD e desligamento definitivo do Vercel (21/07 – 23/07)

- `e0cbf57` (21/07) — GitHub Actions: workflows de CI e deploy
- `ec37ea5`/`b18a684` (22/07) — corrige `VPS_HOST` (apontava pra IP errado) e troca pra rsync nativo + `appleboy/ssh-action`
- `44878cf` (22/07) — `AGENTS.md` atualizado: Vercel obsoleto
- `0b58f6e` (23/07) — remove referências ao Vercel; projeto desconectado, environments `Production`/`Preview` do GitHub apagados

A partir daqui o único caminho de deploy é GitHub Actions → rsync → VPS Hestia
→ PM2, sem PaaS — como está hoje.

## Era 5 — Endurecimento pós-migração (23/07 – 26/07)

Com o self-hosted no ar, uma rodada de correções de segurança e correção de
bugs descobertos ao usar o sistema de verdade: cookie de sessão `httpOnly`
(`11a0ecf`, 22/07), rollback automático de deploy, atomicidade do
`finalize_import` (troca `TRUNCATE` por `DELETE` — `TRUNCATE` faz commit
implícito e quebrava MVCC durante import em horário comercial), revogação de
sessão via `token_version`, e a primeira rodada de medição real de
performance das stored procedures (`docs/medicao-performance.md`, criado
26/07 depois de uma regressão real em `area_analysis` — ver esse arquivo para
o relato completo).

## Era 6 — Rebranding e auditoria de ROI (26/07 – 30/07)

- `t00ls-dev` substitui `pedrorodbit` como usuário GitHub (URLs do repo
  atualizadas em `ed4e520`, 28/07)
- PWA completo: manifest, ícones, cache-busting por hash de commit
- Auditoria de performance/segurança/UX com 13 PRs mergeados (#14–#26):
  correções rápidas, vulnerabilidades de dependência (`seroval`, `xlsx`),
  lazy-loading, WebP, remoção de código morto, indicador de progresso de PDF,
  divisão de `admin.functions.ts`, `FilterField` compartilhado, correção de
  performance em `area_analysis`
- Quatro rodadas de centralização de "números mágicos" em constantes nomeadas
  (auth/cache/rate-limit → janela de datas/import → cron/purge →
  staleTime/gcTime/debounce/paginação da UI)

Detalhe completo e o que continua em aberto: `docs/continuar.md`.

---

## O que isso explica sobre os docs antigos

Os arquivos que viviam em `docs/improvements/` com o aviso
"⚠️ DOCUMENTO HISTÓRICO" (`estado-atual.md`, `discrepancias.md`,
`arquitetura.md`) eram fotografias da **Era 1** (código ainda em Supabase,
escrito por Lovable), datavam de antes da Era 3. Cada "problema" que
descreviam (dark mode inativo, `assertAdmin` duplicado, ausência de rate
limit, sessão em localStorage) foi endereçado durante ou depois da migração,
e está registrado como resolvido em `docs/improvements/analise-completa.md`
(seção "✅ Resolvido"). Os três foram removidos no mesmo commit que criou
este documento (`a4a19e8`, 30/07/2026) — não havia mais valor de referência
técnica neles além do que este documento já resume.

`docs/improvements/melhorias-pendentes.md` também nasceu na Era 1, mas
misturava itens já resolvidos com itens genuinamente ainda abertos — os
abertos foram migrados para `docs/continuar.md` (ver commit que acompanha
esta reorganização) antes do arquivo ser removido.

`docs/improvements/novas-analises.md` é diferente dos outros três: é uma
lista de *ideias de feature* (dashboard por loja, sazonalidade, previsão,
gap de sortimento, relatórios agendados), não um diagnóstico de código —
o próprio arquivo já dizia "independente da migração", e continua válido como
backlog. Foi desmarcado como histórico.
