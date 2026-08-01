---
name: architecture-review
description: Como avaliar mudanças de arquitetura no Bench GPA (framework, DB, auth, deploy) sem descartar decisões funcionando sem motivo técnico. Use antes de propor trocar uma peça central da stack, ou ao avaliar se um débito técnico estrutural vale a pena resolver agora.
---

# Revisão de arquitetura

## Objetivo

Evoluir a arquitetura sem reescrever o que já funciona só por preferência
ou tendência — toda mudança estrutural precisa de justificativa técnica
concreta, não "essa lib é mais popular" ou "eu faria diferente hoje".

## Quando usar

- Antes de propor trocar um framework, DB, ORM ou provedor de auth
- Ao avaliar se um débito técnico estrutural (não um bug pontual) vale a
  pena resolver agora ou pode esperar
- Ao revisar um plano de migração maior (múltiplas fases, múltiplos PRs)

## Regra base

Mudar arquitetura core (framework, banco, auth provider) está na lista do
`AGENTS.md` do que **não se faz sem perguntar** — isso vale tanto para
executar quanto para propor como se fosse óbvio. Avaliação e recomendação
são bem-vindas; execução espontânea, não.

## Processo

1. **Descreva o problema real primeiro, não a solução.** "TanStack Start é
   grande" não é um problema — "o build demora X, o bundle pesa Y, ou um
   bug específico Z é causado pelo framework" é. Se não há um problema
   concreto e medido, não há caso para migração, só para observação.
2. **Valide se a decisão atual ainda serve o contexto atual.** Muita
   coisa na stack (self-hosted, MariaDB, JWT próprio) veio de uma migração
   documentada em `docs/migracao-vps-autossuficiente.md` e
   `docs/historia-do-projeto.md` — leia o porquê antes de propor reverter.
3. **Meça o custo real da migração**, não só o custo da peça nova.
   Reescrever autenticação, por exemplo, é risco de segurança
   proporcional ao tamanho da mudança, não só tempo de desenvolvimento.
4. **Prefira incremental e reversível.** Nenhuma migração estrutural deve
   ser um PR único e grande — fatiar em passos que cada um sozinho deixa
   o sistema funcionando.
5. **Não transporte problema antigo pra solução nova.** Se algo é
   dívida técnica hoje, a migração é a hora de resolver, não de replicar
   com sintaxe diferente.

## Sinais de que vale investigar uma mudança estrutural

- Um mesmo tipo de bug se repete em produção por limitação conhecida da
  peça atual (não confundir com bug de uso da peça).
- Métrica medida e registrada (`docs/medicao-performance.md`) mostra
  degradação estrutural, não pontual.
- Manutenção da peça atual (patches de segurança, compatibilidade) parou
  ou ficou claramente mais cara que a alternativa.

## Sinais de que NÃO vale (ainda)

- A peça atual funciona e o motivo para trocar é preferência/tendência.
- Não há medição, só impressão.
- O sistema tem um mantenedor só e a migração levaria a produção a ficar
  sem cobertura de rollback confiável durante a transição.

## Checklist antes de recomendar uma mudança estrutural

- [ ] Problema concreto descrito e, se possível, medido
- [ ] Decisão atual revisitada com o contexto documentado (não descartada
      sem ler o porquê)
- [ ] Plano fatiado em passos incrementais, cada um reversível
- [ ] Risco de segurança/estabilidade durante a transição avaliado
      explicitamente
- [ ] Apresentado como recomendação para decisão do usuário, não
      executado espontaneamente
