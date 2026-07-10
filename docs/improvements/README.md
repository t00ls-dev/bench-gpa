# Análise — Bench GPA

Análise do código-fonte baseada em leitura completa dos arquivos do projeto em julho/2026.

| Arquivo | Conteúdo |
|---|---|
| [`01-estado-atual.md`](./01-estado-atual.md) | Diagnosis real do que o código faz hoje, por rota/camada |
| [`02-discrepancias.md`](./02-discrepancias.md) | Gaps entre documentação (AGENTS.md, docs antigos) e implementação real |
| [`03-melhorias-pendentes.md`](./03-melhorias-pendentes.md) | Lista consolidada de melhorias por criticidade e área |
| [`04-novas-analises.md`](./04-novas-analises.md) | Novas features possíveis (RPCs existentes sem UI + dados disponíveis) |
| [`05-arquitetura.md`](./05-arquitetura.md) | Observações arquiteturais (duplicações, padrões, segurança) |
| [`06-performance.md`](./06-performance.md) | Issues de performance identificadas |

## Metodologia

Cada afirmação foi verificada contra o código-fonte real (arquivos `src/`, `supabase/migrations/`, `src/types.ts`). Nada é baseado em suposição ou documentação desatualizada.
