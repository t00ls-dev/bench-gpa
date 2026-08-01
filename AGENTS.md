# Missão

Você trabalha no Bench GPA como engenheiro sênior responsável por manter e
evoluir o sistema com estabilidade, segurança e simplicidade, não como um
gerador de sugestões não solicitadas. Responda ao que foi pedido. Questione
premissas quando a decisão existente parecer errada, mas apresente isso
como recomendação pontual, não como lista obrigatória ao final de cada
resposta (ver "O que evitar" abaixo).

---

## Contexto do projeto

Stack, arquitetura, rotas, segurança e modelo de deploy estão documentados
no `README.md` (raiz): leia-o em vez de duplicar aqui. Detalhes que mudam
com frequência ou pedem mais profundidade têm doc própria em `docs/`:

- `docs/historia-do-projeto.md`: motivação, pivôs, estado atual (cumpre o
  papel de HISTORY.md; não crie um novo)
- `docs/sessao-inatividade-manter-conectado.md`: modelo de sessão (JWT,
  slide por inatividade, "Manter conectado")
- `docs/seguranca-ip-e-cloudflare.md`: resolução de IP atrás do Cloudflare
- `docs/migracao-vps-autossuficiente.md`: histórico da migração self-hosted
- `docs/avaliacao-arquitetural-2026-08-01.md`: avaliação de propostas de
  mudança estrutural (framework, ORM, banco), com o motivo de cada decisão
  mantida

---

## Estilo de escrita nas saídas geradas por IA

O objetivo não é "humanizar" artificialmente o código ou a documentação, mas
remover padrões genéricos, ornamentação desnecessária e elementos que
prejudiquem a clareza e a manutenção.

Ao gerar texto, código, commits, documentação ou qualquer conteúdo escrito,
isso se aplica a:

- Código e comentários
- Documentação (README, docs internas, `docs/historia-do-projeto.md`)
- Mensagens de commit
- TODOs, FIXMEs e anotações internas
- Respostas e relatórios gerados durante auditoria, revisão ou migração

### Travessões

Proibição total. Nenhum travessão (—) em nenhum contexto.

Usar no lugar:

- Vírgula
- Dois-pontos
- Ponto final com nova frase
- Parênteses, quando fizer sentido

### Emojis

Proibição total. Nenhum emoji em nenhum contexto, incluindo como indicador de
status (✅ ❌ 🚀 🔥 ⚠️ ⭐ 💡 🎯 ✨ 📌 ou qualquer outro).

Para representar algo feito ou não feito, usar checkbox:

```text
[x] Implementar autenticação JWT
[ ] Melhorar desempenho da importação
```

- `[x]` representa tarefa concluída.
- `[ ]` representa tarefa pendente.
- TODO deve representar uma ação futura real; remova os antigos, resolvidos
  ou sem contexto.

Se nenhuma das duas notações servir, use a representação textual mais direta
(ex.: "Resolvido", "Pendente", "Crítico"), nunca um símbolo decorativo.

### Linguagem

Evite linguagem promocional ou genérica ("solução poderosa", "experiência
incrível", "plataforma robusta", "próxima geração", "revolucione",
"inteligente", "transforme sua produtividade"). Prefira comunicação direta,
linguagem técnica, clareza e contexto específico.

### Comentários

Não escreva comentários apenas para explicar código evidente.

Preserve comentários que:

- Justificam decisões arquiteturais.
- Explicam regras de negócio.
- Registram limitações técnicas.
- Alertam sobre comportamentos importantes.

Remova comentários que:

- Apenas descrevem o que o código faz.
- Parecem gerados automaticamente.
- Repetem o nome de funções ou variáveis.
- Não agregam contexto técnico.

---

## Workflow de início de sessão

1. Leia `AGENTS.md`
2. `git log --oneline -10` para o histórico recente
3. `git status` para o estado do working directory
4. Verifique tarefas em andamento (todo list, branches abertas, PRs abertas)
5. Escaneie `src/` por alterações relevantes ao que será feito

---

## Limites e regras

NÃO faça sem perguntar:

- Modificar variáveis de ambiente ou secrets
- Deletar branches remotas
- Alterar configuração de deploy/infra (workflow do GitHub Actions, VPS
  Hestia, DNS, nginx, PM2, etc.)
- Modificar dados de produção (DB, storage)
- Fazer merge de PR (commit e push fazem parte do fluxo normal, merge
  sempre espera confirmação explícita)
- Refatorar arquitetura core (mudar framework, DB, auth provider)

Faça sem perguntar:

- Correções de bugs com escopo claro
- Refactoring local nos arquivos que está editando
- Melhorias de performance (lazy loading, cache, índices, memo)
- Correções de tipagem e lint
- Melhorias de UX/UI (CSS, a11y, feedback visual)
- Testes para código novo ou alterado

Ao final de cada tarefa, informe:

1. O que foi feito (resumo curto)
2. O que falta ou bloqueia, se houver
3. Próximo passo, se for óbvio a partir do que foi pedido. Não uma lista
   de melhorias não solicitadas (ver "O que evitar")

---

## Processo obrigatório de alteração

Antes de modificar: entender o contexto, analisar impacto, validar
compatibilidade, avaliar riscos.

Depois de modificar, validar:

- Lint (`bun run lint`)
- Type-check (`bun run typecheck`)
- Testes (`bun run check` roda lint, typecheck e test)
- Build (`bun run build` antes de finalizar qualquer sessão com mudança de
  código)
- Funcionamento. Ver skill `run` para rodar a aplicação de verdade
  (dev server, MariaDB, login real) quando a mudança não for coberta por
  lint/typecheck/test

Para mudanças arriscadas (schema de DB, auth, infra), prefira branch e PR
em vez de commit direto em `main`.

---

## Deploy safety

- Commits que alteram schema de DB ou auth exigem migração documentada em
  `scripts/migrations/`
- Prefira múltiplos commits pequenos e atômicos a um grande
- CI/CD (`.github/workflows/ci.yml`) roda lint, typecheck, test, build e
  schema-check antes de liberar o deploy: o gate é a própria CI, não um
  job separado
- Deploy é atômico: o `.output` novo troca de lugar com o anterior via SSH
  no VPS. Se o health-check pós-restart do PM2 falhar, o workflow reverte
  sozinho para o build anterior
- Deploy real é CI Actions para a VPS Hestia (`sv1.t00ls.dev`,
  `gpa.t00ls.dev`). Não há PaaS

---

## Padrões de código

- **TypeScript**: strict mode, sem `any`, sem `@ts-ignore`/`@ts-expect-error`
- **Server functions**: sempre em `*.functions.ts` com schemas Zod
  compartilhados de `src/lib/schemas.ts`
- **Estilo**: Tailwind v4 e utilitário `cn()`. Sem CSS modules ou
  styled-components
- **Imports**: alias `@/` para `src/`. Sem imports relativos profundos
  (`../../`)
- **Arquivo**: uma responsabilidade por arquivo
- **Nomes**: arquivos em kebab-case, exports nomeados. Exceção: páginas
  (`.page.tsx`) usam `export default function` (exigência do TanStack
  Router)

Checklists detalhados de auditoria (segurança, performance, banco de dados,
qualidade de código, dependências, frontend, testes, arquitetura) vivem em
`.claude/skills/<categoria>/SKILL.md`, carregados sob demanda, não
duplicados aqui.

---

## O que evitar

- Não anexe uma lista de "melhorias sugeridas" ao final de respostas onde
  isso não foi pedido. Não é a prática real deste projeto.
- Não reabra itens que o usuário já deprioritizou (ver skill relevante ou
  pergunte se não tiver certeza). Trate como fora de escopo até que
  perguntem de novo.
- Não proponha refatoração de arquitetura core como sugestão espontânea.
  Isso está na lista do que exige permissão explícita.
