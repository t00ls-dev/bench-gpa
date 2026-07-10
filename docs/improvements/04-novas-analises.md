# Novas Análises Possíveis

Baseado nos RPCs existentes no banco sem UI e nos dados disponíveis.

---

## 1. Produtos em Declínio (`products_in_decline`)

**RPC já existe no banco** e está tipado em `types.ts`. Classifica produtos como **crítico**, **alerta** ou **atenção** comparando vendas recentes vs média histórica (30 dias). **Zero UI.**

### Sugestão: Rota `/declinio` ou widget no Dashboard
- Cards com contagem por severidade
- Tabela filtrável (loja, departamento, severidade)
- Ações sugeridas para cada categoria
- Esforço: **baixo** | Impacto: **alto**

---

## 2. Dashboard de Performance por Loja

Dados disponíveis: 18 lojas com vendas diárias.

- Ranking de lojas (venda total, ticket médio, produtos distintos)
- Composição de vendas por departamento em cada loja
- Evolução diária selecionável por loja
- Desvio da média da rede
- Esforço: **médio** | Impacto: **alto**

---

## 3. Sazonalidade / Dia da Semana

O RPC `product_analysis` já calcula dia da semana. Generalizar:

- Vendas por dia da semana (segunda a domingo)
- Dias úteis vs finais de semana
- Calendário de calor (dia × loja ou dia × departamento)
- Esforço: **baixo** | Impacto: **alto**

---

## 4. Previsão / Tendências

- Projeção baseada em média móvel dos últimos N dias
- Sazonalidade semanal (média do dia da semana)
- Alertas de anomalia (venda muito acima/abaixo do esperado)
- Meta vs Realizado (upload de metas)
- Esforço: **médio** | Impacto: **médio**

---

## 5. Análise de Sortimento / Gap

Área analysis já mostra PLUs sem venda. Expandir:

- PLUs que nunca venderam (todo o período)
- PLUs que pararam de vender (>30/60/90 dias)
- Cobertura de sortimento: % de PLUs do departamento que cada loja vende
- Sugestão de reposição: produtos que vendem bem em lojas similares
- Esforço: **médio** | Impacto: **alto**

---

## 6. Exportação e Relatórios Programados

- Relatório diário automático (PDF) por email
- Dashboard impresso (versão otimizada para PDF)
- Download de dados brutos filtrados como CSV/XLSX
- Esforço: **médio** | Impacto: **médio**

---

## Resumo

| Prioridade | Análise | Esforço | Impacto | Observação |
|---|---|---|---|---|
| **Alta** | Produtos em Declínio | Baixo | Alto | RPC existe, sem UI |
| **Alta** | Performance por Loja | Médio | Alto | Dados disponíveis |
| **Média** | Sazonalidade | Baixo | Alto | Lógica já existe em product_analysis |
| **Média** | Previsão/Tendências | Médio | Médio | Média móvel simples |
| **Média** | Sortimento/Gap | Médio | Alto | Expande area_analysis |
| **Baixa** | Relatórios Programados | Alto | Médio | Requer infra de email |
