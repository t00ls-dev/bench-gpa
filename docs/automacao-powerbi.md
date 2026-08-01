# Automação de download/import do Power BI

> **Status:** Planejamento: aguardando decisões (ver [Perguntas em aberto](#perguntas-em-aberto)).
> Documento preparatório para retomarmos a implementação sem perder contexto.

## Objetivo

Eliminar a etapa manual de exportar a planilha diária do Power BI. Hoje um humano
faz esse export/download e sobe o arquivo; queremos que o dado chegue sozinho até
o pipeline de import já existente.

## Fluxo atual (manual)

> **Atualizado em 2026-07-26.** O desenho anterior deste documento descrevia as
> planilhas versionadas em `data/YYYY-MM/` e um cron `cli:watch` a cada 3h, que
> importava e dava commit/push sozinho. Isso mudou: os dados saíram do git (o
> repositório não é meio de transporte de dados) e o cron foi desligado. A
> importação passou a ser um ato deliberado.

```
Power BI (relatório de vendas)
        │  ← export manual para .xlsx (feito por uma pessoa)
        ▼
   dois caminhos possíveis:

   (a) tela /upload do app            (b) inbox no servidor
       • aceita vários arquivos           • copiar para data/ (scp/rsync)
       • lê a data de dentro da           • rodar `bun run cli:watch`
         planilha (DTA_VENDA)               (ou cli:import <arquivo>)
       • importa na hora                  • apaga a planilha após importar
        │                                  │
        └──────────────┬───────────────────┘
                       ▼
        sales_daily_agg / sales_prod_daily_agg
        • pula datas já em import_log
        • ignora arquivos além de RETENTION_DAYS (180d, atrelado ao purge)
```

**O que já está pronto e NÃO muda:** todo o trecho a partir da chegada do
`.xlsx`. A automação só precisa **produzir o arquivo** com o conteúdo correto e
entregá-lo por um dos dois caminhos.

## O que a automação precisa fazer

1. **Autenticar** no Power BI de forma não-interativa (sem humano no loop).
2. **Disparar/obter** o export do relatório de vendas do dia.
3. **Baixar** o `.xlsx` (ou converter o resultado para o layout que o
   `xlsx-parser` espera, ver "Compatibilidade de layout" abaixo).
4. **Entregar** o arquivo: copiar para `data/` na VPS, ou enviá-lo pela mesma
   rota que a tela `/upload` usa. O nome do arquivo é irrelevante: a data sai do
   conteúdo (marcador `DTA_VENDA`).
5. **Importar**: se usar o inbox, chamar `bun run cli:watch` ao final do
   download. Não há mais cron de import para "esperar", o que na verdade
   simplifica, porque o dado entra assim que chega, sem janela de até 3h.

## Perguntas em aberto

Precisamos destas respostas antes de escolher a abordagem:

1. **Tier/licença do Power BI.** É Power BI Pro, Premium (PPU/capacidade) ou
   Fabric? Isso define quais APIs estão disponíveis (ex.: `exportToFile` de
   _paginated reports_ exige Premium/capacidade).
2. **Acesso à fonte a montante (upstream).** A planilha vem de um _dataset_
   dentro do Power BI, ou o Power BI apenas visualiza uma fonte que também
   poderíamos acessar direto (SQL, SharePoint, API do ERP)? Se der para pular o
   Power BI e ir na fonte, a automação fica muito mais simples e robusta.
3. **Service principal.** Temos como criar um _app registration_ no Entra ID
   (Azure AD) com _service principal_ e liberar acesso à API do Power BI? É o
   caminho recomendado para automação sem senha de usuário. Se não, sobra
   ROPC/senha de conta de serviço (frágil, e MFA quebra).
4. **Dataset vs. paginated report.** O que exportamos hoje é um **dataset**
   (dados tabulares, dá para consultar via API DAX/`executeQueries`) ou um
   **paginated report** (.rdl, renderizável para XLSX via `exportToFile`)? Os
   dois têm caminhos de API bem diferentes.

## Abordagens possíveis (a decidir após as respostas)

| #   | Abordagem                                                                          | Requer                                | Prós                                                         | Contras                                                        |
| --- | ---------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------- |
| A   | **Pular o Power BI**: ler a fonte upstream direto (SQL/API do ERP) e gerar o XLSX  | Acesso à fonte                        | Mais simples, sem dependência do Power BI, sem licença extra | Só viável se tivermos acesso à fonte                           |
| B   | **Power BI REST: `executeQueries`** (dataset via DAX)                              | Service principal + dataset           | Oficial, retorna JSON/tabela; convertemos p/ XLSX            | Limite de linhas/tamanho por chamada; exige montar a query DAX |
| C   | **Power BI REST: `exportToFile`** (paginated report → XLSX)                        | Premium/capacidade + paginated report | Gera o XLSX pronto no layout do relatório                    | Exige tier Premium; assíncrono (poll de status)                |
| D   | **Automação de UI headless** (Playwright logando no Power BI e clicando em Export) | Só credenciais                        | Funciona sem API/licença especial                            | Frágil, quebra com mudança de UI/MFA; não recomendado          |

Ordem de preferência provável: **A > B > C > D**. Confirmar com as respostas.

## Compatibilidade de layout

O `xlsx-parser` (`src/lib/xlsx-parser.ts`) e o `extract-date.ts` esperam o
layout atual do export. Se a automação gerar o XLSX por outro caminho
(ex.: `executeQueries` → montamos a planilha), o layout de colunas **precisa
bater** com o que o parser lê, ou ajustamos o parser. Validar com um arquivo
real antes de ligar o cron.

## Riscos e considerações

- **Segredos:** credenciais/secret do service principal vão para o `.env` da VPS
  (nunca versionar). Seguir o padrão já usado para `DB_PASS`/`JWT_SECRET`.
- **Idempotência:** já garantida pelo `import-watch` (checa `import_log` e o cap
  de 180 dias). A automação pode rodar/re-rodar sem duplicar.
- **Falhas silenciosas:** o `import-watch` grava `cron_heartbeat`, mas hoje ele
  **não roda em cron**, e, por isso, saiu do `KNOWN_JOBS` (um job sem cron
  apareceria como atrasado para sempre). Se a automação for criada, ela deve ter
  heartbeat próprio (ex. `powerbi-download`) **e** ser adicionada ao `KNOWN_JOBS`
  em `src/lib/admin-system.functions.ts`, senão não aparece no painel `/admin` →
  Auditoria quando falhar.
- **Fuso/horário:** o export precisa refletir o dia fechado. Confirmar a hora em
  que o dado do dia anterior fica completo no Power BI antes de escolher o
  horário do cron de download. Não há mais cron de import para se alinhar.
- **Data da venda:** deve ser a data de venda, não a de execução. O nome do
  arquivo é irrelevante: o parser lê o marcador `DTA_VENDA` de dentro da
  planilha, e o `extract-date` só usa o nome como atalho quando ele já traz uma
  data válida.

## Próximos passos

1. Responder as 4 [perguntas em aberto](#perguntas-em-aberto).
2. Escolher a abordagem (A–D) com base nas respostas.
3. Se B/C: registrar service principal no Entra ID e conceder acesso ao
   workspace/dataset no Power BI.
4. Protótipo: baixar **um** dia real e validar o layout contra o `xlsx-parser`.
5. Integrar: script `scripts/powerbi-download.ts` que salva no inbox `data/` e
   chama o import ao final, com heartbeat próprio, agendado via
   `scripts/setup-crons.sh` e registrado no `KNOWN_JOBS`.
6. Documentar credenciais/rotina de rotação no `.env.example` e neste doc.

## Referências

- Import atual: `scripts/import-watch.ts`, `scripts/import.ts`, `scripts/extract-date.ts`
- Parser de planilha: `src/lib/xlsx-parser.ts`
- Retenção/cap: `src/lib/retention.ts` (`RETENTION_DAYS = 180`)
- Heartbeat das crons: `src/lib/heartbeat.ts`, painel em `/admin` → Auditoria
- Crons: `scripts/setup-crons.sh`
