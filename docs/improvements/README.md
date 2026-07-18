# Análise — Bench GPA

Contexto atual (Jul/2026): app em migração de **Supabase → MariaDB + JWT próprio**.
Deploy planejado: Hestia VPS (`sv1.t00ls.dev`). Auth migrando de Supabase Auth para JWT + bcrypt.
Doc obsoletas removidas: `migracao-sqlite.md`, `pereciveis-plano.md`, `analise-pereciveis.md`.

| Arquivo | Conteúdo |
|---|---|
| [`01-estado-atual.md`](./01-estado-atual.md) | Diagnosis real do código, por rota/camada |
| [`02-discrepancias.md`](./02-discrepancias.md) | Gaps entre docs e implementação real |
| [`03-melhorias-pendentes.md`](./03-melhorias-pendentes.md) | Melhorias por criticidade e área |
| [`04-novas-analises.md`](./04-novas-analises.md) | Novas features possíveis (RPCs sem UI + dados disponíveis) |
| [`05-arquitetura.md`](./05-arquitetura.md) | Observações arquiteturais (duplicações, padrões, segurança) |
| [`06-performance.md`](./06-performance.md) | Issues de performance identificadas |

> ⚠️ Análise original em julho/2026, atualizada para refletir migração pós-Supabase.
> Itens que dependiam de Supabase Auth/RPCs foram recontextualizados para JWT + MariaDB.
