# Planejamento de Produção — Perecíveis (design, não implementado)

> Nasceu de uma pergunta direta do usuário em 2026-08-07: "Planejamento de
> Produção" ou "Venda Esperada/Aguardada", prever quando vai vender em um
> determinado dia. Este documento registra a investigação de viabilidade e
> as decisões de design tomadas em conversa, ponto a ponto. **Nada disto foi
> implementado ainda** — é o recorte aprovado, pronto para virar plano de
> execução quando o usuário pedir.

## Restrição de dado que define tudo

A planilha de origem da GPA (`DTA_VENDA`) só traz **valor de venda (R$)**,
nunca quantidade. `qty_vda` foi removida do schema desde a migration 0002
por falta de fonte (`scripts/migrate-schema.sql:112`). Qualquer previsão
sai como "espera-se vender ~R$X", nunca "produza N unidades" — decisão do
usuário: **v1 mostra só R$, sem estimar unidades** (dividir pelo preço
médio seria uma inferência a mais, não um dado real).

## Densidade real do histórico (medido em produção, 2026-08-07)

71-72 dias de histórico (`sales_prod_daily_agg`, 27/05 a 05/08/2026),
177.325 pares produto×loja, 16.363 produtos, 18 lojas.

- **Nível agregado (departamento/seção/loja): sempre denso.** Todo
  departamento e toda seção de `PERECIVEIS` tem venda em 72 dos 72 dias
  (nenhum buraco), inclusive as seções mais raras por produto (Bacalhau,
  Peixaria, Peixes Congelados).
- **Nível produto individual: raso na maior parte do catálogo.** Média de
  19,6 dias vendidos por par produto×loja em 71 dias totais. Só 15,8% dos
  pares têm 40+ dias de venda (histórico "regular"); 40,2% venderam em
  menos de 10 dias — não sustenta previsão por SKU.

Dentro de `PERECIVEIS` especificamente (a área que corresponde a
"planejamento de produção" de verdade — padaria, açougue, hortifruti,
pratos prontos), a densidade por seção varia bastante:

| Seção                  | Pares com 40+ dias | Total de pares | Média de dias |
| ----------------------- | ------------------- | --------------- | -------------- |
| Laticínios e Massas     | 2.795                | 13.265           | 25,0            |
| F.L.V. (hortifruti)     | 2.484                | 9.229            | 25,9            |
| Padaria Industrializada | 1.176                | 3.516            | 31,1            |
| Carnes e Aves           | 1.224                | 5.510            | 22,8            |
| Padaria                 | 910                  | 4.009            | 23,7            |
| Pratos Prontos          | 581                  | 5.500            | 15,1            |
| (demais seções de PERECIVEIS: Frios, Peixaria, Congelados, Bacalhau, Salgados, Restaurante) | menor densidade por produto | — | — |

## Decisão de escopo (usuário, 2026-08-07)

> "Claro que não faz sentido planejar produção para todo departamento/seção.
> Mas alguns não podem ficar de fora. A princípio todo o Perecíveis deve
> entrar nesse planejamento e sendo possível filtragem até nível individual
> a produção."

**Todo `PERECIVEIS` entra no painel, sem exceção de seção.** O nível de
detalhe mostrado por produto/seção é adaptativo, não binário
(incluído/excluído).

## Regra de granularidade adaptativa

Para cada produto de `PERECIVEIS`, na loja e no dia da semana alvo:

1. Conta quantas ocorrências **do mesmo dia da semana** esse produto teve
   venda no histórico daquela loja (não dias em geral — especificamente
   sextas, se a previsão é para uma sexta-feira).
2. Se atingir um piso de confiança (**proposto: 4 das últimas 8-10
   ocorrências do dia da semana** — número inicial, precisa validação
   empírica antes de travar, mesmo espírito de `docs/medicao-performance.md`:
   não travar sem medir), o produto entra **individualmente** com seu R$
   previsto (média das ocorrências desse dia da semana).
3. Abaixo do piso, o produto **não desaparece** do plano: entra dentro de
   uma linha agregada **"Outros produtos de [Seção]"**, com o R$ previsto
   da soma de tudo que não atingiu o piso naquela seção/loja/dia da
   semana. O total da seção sempre reconcilia (linhas individuais + linha
   agregada = previsão da seção inteira nesse dia).

Decisão do usuário confirmando esse mecanismo: "Linha agregada 'Outros da
Seção' (recomendado)" — produto raro nunca é listado individualmente com
falsa confiança, mas também nunca some do total.

## Método estatístico (v1)

**Média por dia da semana**: média das últimas N ocorrências do mesmo dia
da semana (ex.: média das últimas 8 sextas-feiras para prever a próxima
sexta). Mesma família de lógica que já existe em `product_analysis`
(dia da semana já é calculado ali). Simples, auditável, fácil de explicar
quando o número parecer estranho — decisão do usuário sobre a alternativa
(média móvel + sazonalidade combinadas): descartada para v1 por maior
esforço e menor auditabilidade.

## Tela

**Tela nova**, mesmo nível de Dashboard/Área/Produto no menu principal —
não uma aba dentro de Área. Aberta a todo usuário (mesmo padrão das telas
de análise atuais, sem gate de admin). Nome provisório: "Planejamento de
Produção" (a alternativa "Venda Esperada" foi cogitada pelo usuário, mas
não decidida — revisar no momento de nomear a rota/menu).

Filtros esperados: loja (obrigatório, planejamento é por loja) + data alvo
(um dia futuro). Saída: tabela por seção de `PERECIVEIS`, com linhas de
produto individual (quando o piso de confiança é atingido) e uma linha
"Outros produtos de [Seção]" fechando o total de cada seção.

## Não decidido ainda / próximos passos antes de implementar

- Nome final da tela/rota.
- Valor exato do piso de confiança (4 de 8-10 é ponto de partida, não
  medido ainda contra dado real de precisão).
- Nova stored procedure (formato tipo `production_forecast(p_store_code,
  p_target_date)`), schema de retorno, custo de execução — nada disso foi
  desenhado ainda, é a próxima etapa quando o usuário pedir para avançar.
- Nenhum código, proc ou rota foi escrito. Este documento é só o recorte
  de escopo/design aprovado.
