# Automação de download/import do Power BI

> **Status:** 🟡 Planejamento — aguardando decisões (ver [Perguntas em aberto](#perguntas-em-aberto)).
> Documento preparatório para retomarmos a implementação sem perder contexto.

## Objetivo

Eliminar a etapa manual de exportar a planilha diária do Power BI e colocá-la em
`data/YYYY-MM/`. Hoje um humano faz esse export/download; queremos que o dado
chegue sozinho até o pipeline de import já existente.

## Fluxo atual (manual)

```
Power BI (relatório de vendas)
        │  ← export manual para .xlsx (feito por uma pessoa)
        ▼
data/YYYY-MM/<arquivo>.xlsx   ← arquivo colocado manualmente no repo
        │  ← cron cli:watch (a cada 3h, 10h–22h)
        ▼
import-watch.ts
  • normaliza o nome para YYYY-MM-DD.xlsx (extract-date.ts)
  • pula datas já em import_log
  • ignora arquivos além de RETENTION_DAYS (180d, atrelado ao purge)
  • importa via cli:import → sales_daily_agg / sales_prod_daily_agg
  • commita e dá push automático
```

**O que já está pronto e NÃO muda:** todo o trecho a partir de `data/YYYY-MM/`.
A automação só precisa **produzir o `.xlsx` diário nessa pasta** com o conteúdo
correto. O `import-watch` cuida do resto (dedup, cap de retenção, import, commit).

## O que a automação precisa fazer

1. **Autenticar** no Power BI de forma não-interativa (sem humano no loop).
2. **Disparar/obter** o export do relatório de vendas do dia.
3. **Baixar** o `.xlsx` (ou converter o resultado para o layout que o
   `xlsx-parser` espera — ver "Compatibilidade de layout" abaixo).
4. **Salvar** em `data/YYYY-MM/<data>.xlsx` na VPS (ou onde o `import-watch` roda).
5. **Agendar** — provavelmente um cron um pouco antes da primeira rodada do `cli:watch` (10h).

## Perguntas em aberto

Precisamos destas respostas antes de escolher a abordagem:

1. **Tier/licença do Power BI.** É Power BI Pro, Premium (PPU/capacidade) ou
   Fabric? Isso define quais APIs estão disponíveis (ex.: `exportToFile` de
   *paginated reports* exige Premium/capacidade).
2. **Acesso à fonte a montante (upstream).** A planilha vem de um *dataset*
   dentro do Power BI, ou o Power BI apenas visualiza uma fonte que também
   poderíamos acessar direto (SQL, SharePoint, API do ERP)? Se der para pular o
   Power BI e ir na fonte, a automação fica muito mais simples e robusta.
3. **Service principal.** Temos como criar um *app registration* no Entra ID
   (Azure AD) com *service principal* e liberar acesso à API do Power BI? É o
   caminho recomendado para automação sem senha de usuário. Se não, sobra
   ROPC/senha de conta de serviço (frágil, e MFA quebra).
4. **Dataset vs. paginated report.** O que exportamos hoje é um **dataset**
   (dados tabulares — dá para consultar via API DAX/`executeQueries`) ou um
   **paginated report** (.rdl, renderizável para XLSX via `exportToFile`)? Os
   dois têm caminhos de API bem diferentes.

## Abordagens possíveis (a decidir após as respostas)

| # | Abordagem | Requer | Prós | Contras |
|---|-----------|--------|------|---------|
| A | **Pular o Power BI** — ler a fonte upstream direto (SQL/API do ERP) e gerar o XLSX | Acesso à fonte | Mais simples, sem dependência do Power BI, sem licença extra | Só viável se tivermos acesso à fonte |
| B | **Power BI REST — `executeQueries`** (dataset via DAX) | Service principal + dataset | Oficial, retorna JSON/tabela; convertemos p/ XLSX | Limite de linhas/tamanho por chamada; exige montar a query DAX |
| C | **Power BI REST — `exportToFile`** (paginated report → XLSX) | Premium/capacidade + paginated report | Gera o XLSX pronto no layout do relatório | Exige tier Premium; assíncrono (poll de status) |
| D | **Automação de UI headless** (Playwright logando no Power BI e clicando em Export) | Só credenciais | Funciona sem API/licença especial | Frágil, quebra com mudança de UI/MFA; não recomendado |

Ordem de preferência provável: **A > B > C > D** — confirmar com as respostas.

## Compatibilidade de layout

O `xlsx-parser` (`src/lib/xlsx-parser.ts`) e o `extract-date.ts` esperam o
layout atual do export. Se a automação gerar o XLSX por outro caminho
(ex.: `executeQueries` → montamos a planilha), o layout de colunas **precisa
bater** com o que o parser lê, ou ajustamos o parser. Validar com um arquivo
real antes de ligar o cron.

## Riscos e considerações

- **Segredos:** credenciais/secret do service principal vão para o `.env` da VPS
  (nunca versionar) — seguir o padrão já usado para `DB_PASS`/`JWT_SECRET`.
- **Idempotência:** já garantida pelo `import-watch` (checa `import_log` e o cap
  de 180 dias). A automação pode rodar/re-rodar sem duplicar.
- **Falhas silenciosas:** o `import-watch` já grava `cron_heartbeat`; o passo de
  download deveria ter o **mesmo tratamento de heartbeat** (job próprio, ex.
  `powerbi-download`) para aparecer no painel `/admin` → Auditoria quando falhar.
- **Fuso/horário:** o export precisa refletir o dia fechado. Confirmar a hora em
  que o dado do dia anterior fica completo no Power BI antes de escolher o
  horário do cron (hoje o `cli:watch` roda a cada 3h, das 10h às 22h).
- **Timezone do nome do arquivo:** a data no nome (`YYYY-MM-DD.xlsx`) deve ser a
  data de venda, não a data de execução — o `extract-date` já lida com isso se o
  conteúdo/nome trouxer a data correta.

## Próximos passos

1. Responder as 4 [perguntas em aberto](#perguntas-em-aberto).
2. Escolher a abordagem (A–D) com base nas respostas.
3. Se B/C: registrar service principal no Entra ID e conceder acesso ao
   workspace/dataset no Power BI.
4. Protótipo: baixar **um** dia real e validar o layout contra o `xlsx-parser`.
5. Integrar: script `scripts/powerbi-download.ts` que salva em `data/YYYY-MM/`,
   com heartbeat próprio, agendado via `scripts/setup-crons.sh` antes do `cli:watch`.
6. Documentar credenciais/rotina de rotação no `.env.example` e neste doc.

## Referências

- Import atual: `scripts/import-watch.ts`, `scripts/import.ts`, `scripts/extract-date.ts`
- Parser de planilha: `src/lib/xlsx-parser.ts`
- Retenção/cap: `src/lib/retention.ts` (`RETENTION_DAYS = 180`)
- Heartbeat das crons: `src/lib/heartbeat.ts`, painel em `/admin` → Auditoria
- Crons: `scripts/setup-crons.sh`
