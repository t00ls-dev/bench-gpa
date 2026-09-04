# Novas Análises Possíveis

> Backlog de ideias de feature, não diagnóstico de código, por isso não foi
> invalidado pela migração Supabase → MariaDB. Verificado em 04/09/2026: a
> sazonalidade semanal foi parcialmente implementada na Área; os estados abaixo
> distinguem o que já existe do que continua pendente.
> Escrito com base nos RPCs/stored procedures existentes no banco sem UI e nos
> dados disponíveis; os nomes de RPC mudaram (era Supabase → MariaDB), mas a
> ideia de cada análise continua de pé. Ver `docs/continuar.md` para o que está
> em execução agora.

Baseado nos RPCs existentes no banco sem UI e nos dados disponíveis.

---

## 1. Dashboard de Performance por Loja

Dados disponíveis: 18 lojas com vendas diárias.

- Ranking de lojas (venda total, ticket médio, produtos distintos)
- Composição de vendas por departamento em cada loja
- Evolução diária selecionável por loja
- Desvio da média da rede
- Esforço: **médio** | Impacto: **alto**

---

## 2. Sazonalidade / Dia da Semana

Implementado na Área: evolução diária e média por dia da semana para o período e
a composição selecionados, incluindo Análises salvas. A comparação exige ao
menos duas ocorrências em pelo menos dois dias da semana.

Ainda pendente:

- Outras visualizações de vendas por dia da semana
- Dias úteis vs finais de semana
- Calendário de calor (dia × loja ou dia × departamento)
- Esforço: **baixo** | Impacto: **alto**

---

## 3. Previsão / Tendências

- Projeção baseada em média móvel dos últimos N dias
- Sazonalidade semanal (média do dia da semana)
- Alertas de anomalia (venda muito acima/abaixo do esperado)
- Meta vs Realizado (upload de metas)
- Esforço: **médio** | Impacto: **médio**

---

## 4. Análise de Sortimento / Gap

Área analysis já mostra PLUs sem venda. Expandir:

- PLUs que nunca venderam (todo o período)
- PLUs que pararam de vender (>30/60/90 dias)
- Cobertura de sortimento: % de PLUs do departamento que cada loja vende
- Sugestão de reposição: produtos que vendem bem em lojas similares
- Esforço: **médio** | Impacto: **alto**

---

## 5. Exportação e Relatórios Programados

- Relatório diário automático (PDF) por email
- Dashboard impresso (versão otimizada para PDF)
- Download de dados brutos filtrados como CSV/XLSX
- Esforço: **médio** | Impacto: **médio**

---

## Resumo

| Prioridade | Análise                | Esforço | Impacto | Observação                               |
| ---------- | ---------------------- | ------- | ------- | ---------------------------------------- |
| **Alta**   | Performance por Loja   | Médio   | Alto    | Dados disponíveis                        |
| **Média**  | Sazonalidade           | Baixo   | Alto    | Parcial na Área; demais visões pendentes |
| **Média**  | Previsão/Tendências    | Médio   | Médio   | Média móvel simples                      |
| **Média**  | Sortimento/Gap         | Médio   | Alto    | Expande area_analysis                    |
| **Baixa**  | Relatórios Programados | Alto    | Médio   | Requer infra de email                    |
