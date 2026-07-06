# Novas Análises Possíveis

Baseado nos dados reais extraídos dos arquivos XLSX e no entendimento dos RPCs existentes no banco.

## Estrutura dos dados disponíveis

| Dimensão | Valor |
|---|---|
| Lojas | 18 unidades |
| Departamentos | 5 (BAZAR, MERCEARIA, PERECIVEIS, PROJETOS ESPECIAIS, TEXTIL) |
| Produtos | ~11.000 por dia |
| Venda média diária | R$ 3,6 milhões |
| Período disponível | 14/05/2026 a 04/07/2026 (~51 dias) |

---

## 1. Produtos em Declínio (já existe RPC, sem UI)

O RPC `products_in_decline` já existe no banco e classifica produtos como **crítico**, **alerta** ou **atenção** comparando vendas recentes vs. média histórica dos últimos 30 dias. **Não há página ou componente para exibir esses dados.**

### Sugestão: Nova rota `/declinio`
- Cards com contagem por severidade (crítico / alerta / atenção)
- Tabela com filtros por loja, departamento, severidade
- Ações sugeridas para cada categoria
- Exportar relatório

---

## 2. Dashboard de Performance por Loja

Cada loja tem perfil de venda diferente. Uma página `/lojas` com:

- **Ranking de lojas** por venda total, ticket médio, número de produtos vendidos
- **Composição de vendas por departamento** em cada loja (qual loja vende mais Perecíveis vs. Mercearia)
- **Evolução diária por loja** (selecionável)
- **Comparativo**: mostrar desvio da média da rede para cada loja
- **Break-even analysis**: quantos produtos cada loja precisa vender para atingir metas

---

## 3. Análise de Sazonalidade / Dia da Semana

O RPC `product_analysis` já calcula o dia da semana para produtos. Generalizar para o dashboard:

- **Vendas por dia da semana** (segunda a domingo) — identificar padrões
- **Comparação de dias úteis vs. finais de semana**
- **Produtos com maior variação sazonal** (ex: cerveja sobe no fim de semana)
- **Calendário de calor** (heatmap dia × loja ou dia × departamento)

---

## 4. Análise de Ticket / Cesta

- **Ticket médio geral** e por loja
- **Distribuição de cestas** (quantos itens por compra? — se houver dado de transação)
  - *Nota: o dado atual não tem identificador de transação (cada linha é produto×loja×dia). Seria necessário incluir `transaction_id` ou `nota_fiscal`*
- **Produtos mais comuns em cestas** (cross-selling — quais produtos costumam ser comprados juntos)
  - *Também exigiria dado de transação*

---

## 5. Previsão / Tendências

- **Projeção de vendas** baseada em média móvel dos últimos N dias
- **Sazonalidade semanal**: modelo simples (média do dia da semana)
- **Alertas de anomalia**: quando uma venda diária está muito abaixo ou acima do esperado para aquele dia da semana
- **Meta vs. Realizado**: upload de metas mensais e acompanhamento diário

---

## 6. Análise de Sortimento / Gap

Área analysis já mostra PLUs sem venda. Expandir:

- **PLUs que nunca venderam** (em todo o período disponível)
- **PLUs que pararam de vender** (última venda há mais de 30/60/90 dias)
- **Cobertura de sortimento**: % de PLUs do departamento que cada loja vende
- **Sugestão de reposição**: produtos que vendem bem em lojas similares mas não em determinada loja

---

## 7. Análise de Preço / Margem (se dados disponíveis)

O XLSX atual só tem `val_vda` (valor de venda). Análises possíveis se houver:

- **Preço médio por produto**: `val_vda / qty` (se qty existir)
- **Margem**: se houver `custo` ou `preco_custo`
- **Elasticidade**: variação de venda vs. variação de preço ao longo do tempo
- **Comparação de preços entre lojas** para o mesmo produto

---

## 8. Benchmarking entre Lojas

- **Venda por metro quadrado** (se houver área da loja)
- **Produtividade**: venda por funcionário (se houver dado de quadro)
- **Cesta média** vs. tráfego de clientes
- **Lojas similares**: clusterização de lojas por perfil de venda (ex: lojas de bairro vs. lojas de passagem)

---

## 9. Exportação e Relatórios Programados

- **Relatório diário automático** (PDF) enviado por email com KPIs do dia anterior
- **Dashboard impresso**: versão otimizada para PDF do dashboard atual
- **Download de dados brutos**: botão para baixar os dados filtrados como CSV/XLSX (útil para análises externas)

---

## 10. Integrações Futuras

| Integração | Benefício |
|---|---|
| **Estoque** (RPCs já existiram e foram removidos) | Reintroduzir análise de estoque vs. venda (dias de cobertura, ruptura) |
| **Preço** (tabela separada) | Análise de margem, elasticidade, promoção |
| **Meta / Orçamento** (upload de planilha) | Acompanhamento meta vs. realizado |
| **Clima / Feriados** (API externa) | Correlacionar vendas com clima e sazonalidade de feriados |

---

## Resumo de Prioridades Sugeridas

| Prioridade | Análise | Esforço | Impacto | Observação |
|---|---|---|---|---|
| **Alta** | Produtos em Declínio (rota `/declinio`) | Baixo (RPC existe, só criar UI) | Alto | Já tem função no banco, sem uso |
| **Alta** | Dashboard de Performance por Loja | Médio | Alto | Dados disponíveis |
| **Média** | Sazonalidade / Dia da Semana | Baixo | Alto | Já existe lógica no `product_analysis` |
| **Média** | Previsão / Tendências | Médio | Médio | Pode usar média móvel simples |
| **Média** | Análise de Sortimento / Gap | Médio | Alto | Expande a `area_analysis` |
| **Baixa** | Preço / Margem | Alto (depende de novos dados) | Alto | Requer nova fonte de dados |
| **Baixa** | Cross-selling | Alto (depende de transaction_id) | Alto | Requer nova fonte de dados |
