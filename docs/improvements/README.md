# Análise — Bench GPA

Migração concluída ✅ — **Supabase → MariaDB + JWT próprio**. App rodando em Hestia VPS (`sv1.t00ls.dev`, `gpa.t00ls.dev`).
Doc obsoletas removidas: `migracao-sqlite.md`, `pereciveis-plano.md`, `analise-pereciveis.md`.

> A automação que mantinha esses docs sincronizados (`code-review.yml`) foi removida em `e672ef1` (21/07/2026).
> Em 30/07/2026, os três arquivos que só descreviam o código da era Supabase (`estado-atual.md`,
> `discrepancias.md`, `arquitetura.md`) foram removidos — conteúdo 100% superado, sem valor além do que
> [`../historia-do-projeto.md`](../historia-do-projeto.md) já resume. `melhorias-pendentes.md` teve os itens
> ainda genuinamente abertos migrados para [`../continuar.md`](../continuar.md) (§8) e também foi removido.
> Recuperáveis no histórico do git se precisar do texto original.

| Arquivo | Conteúdo |
| --- | --- |
| [`analise-completa.md`](./analise-completa.md) | ✅ Atual — snapshot de 22/07/2026, métricas re-medidas e itens de segurança reconferidos em 30/07/2026 |
| [`novas-analises.md`](./novas-analises.md) | ✅ Atual — backlog de ideias de feature (não diagnóstico de código, por isso não foi invalidado pela migração) |
| ~~`estado-atual.md`~~ | **Removido em 30/07/2026** — diagnóstico do código por rota/camada, era Supabase. Ver `../historia-do-projeto.md` |
| ~~`discrepancias.md`~~ | **Removido em 30/07/2026** — gaps entre docs e implementação, era Supabase |
| ~~`arquitetura.md`~~ | **Removido em 30/07/2026** — observações arquiteturais, era Supabase |
| ~~`melhorias-pendentes.md`~~ | **Removido em 30/07/2026** — itens ainda abertos migrados para `../continuar.md` §8 |
| ~~`performance.md`~~ | **Apagado em 26/07/2026** — era ativamente enganoso: priorizava issues que a medição em produção mostrou irrelevantes. Substituído por [`../medicao-performance.md`](../medicao-performance.md), com números medidos |

Para a jornada completa do projeto (Lovable → Supabase → self-hosted), ver
[`../historia-do-projeto.md`](../historia-do-projeto.md). Para o que está em
aberto agora, [`../continuar.md`](../continuar.md).
