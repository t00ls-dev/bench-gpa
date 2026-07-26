# Análise — Bench GPA

Migração concluída ✅ — **Supabase → MariaDB + JWT próprio**. App rodando em Hestia VPS (`sv1.t00ls.dev`, `gpa.t00ls.dev`).
Doc obsoletas removidas: `migracao-sqlite.md`, `pereciveis-plano.md`, `analise-pereciveis.md`.

> ⚠️ A automação que mantinha esses docs sincronizados (`code-review.yml`) foi removida em `e672ef1` (21/07/2026).
> `analise-completa.md` foi reescrito manualmente em 22/07/2026 com achados verificados; os demais arquivos
> abaixo ainda referenciam código Supabase-era (`analytics.functions.ts`, `client.ts`, RPCs) que não existe mais
> — trate-os como histórico até serem revisados.

| Arquivo                                              | Conteúdo                                                                                     |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| [`analise-completa.md`](./analise-completa.md)       | ✅ Snapshot atualizado (22/07/2026) — leitura completa + lint/typecheck/test/coverage reais    |
| [`estado-atual.md`](./estado-atual.md)               | ⚠️ Desatualizado — diagnóstico do código, por rota/camada                                     |
| [`discrepancias.md`](./discrepancias.md)             | ⚠️ Desatualizado — gaps entre docs e implementação real                                       |
| [`melhorias-pendentes.md`](./melhorias-pendentes.md) | ⚠️ Desatualizado — melhorias por criticidade e área                                           |
| [`novas-analises.md`](./novas-analises.md)           | ⚠️ Desatualizado — novas features possíveis (RPCs sem UI + dados disponíveis)                 |
| [`arquitetura.md`](./arquitetura.md)                 | ⚠️ Desatualizado — observações arquiteturais (duplicações, padrões, segurança)                |
| ~~`performance.md`~~                                  | **Apagado em 26/07/2026** — era ativamente enganoso: priorizava issues que a medição em produção mostrou irrelevantes. Substituído por [`../medicao-performance.md`](../medicao-performance.md), com números medidos. Recuperável no histórico do git |
