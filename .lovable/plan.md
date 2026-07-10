## Diagnóstico

Logs do worker mostram o erro real:

```
[finalizeImport.swap] error: {"code":"57014","message":"canceling statement due to statement timeout"}
```

O erro `Falha ao finalizar importação` é o wrapper genérico do `safeError`. A causa é **statement_timeout** do Postgres estourando durante o swap atômico (`DELETE ... + INSERT ... FROM staging`) dentro de `public.finalize_import`. Com ~50 mil linhas/dia em `sales` + índices + o mesmo volume vindo de `staging_sales`, a operação passa do limite default aplicado via PostgREST.

`refresh_sales_daily_agg` tem o mesmo risco (roda logo depois, faz DELETE+INSERT em duas agregações + refresh de hierarquia).

A mensagem "nenhum arquivo processado" que o usuário viu é o toast final `toast.error("Nenhum arquivo importado.")` disparado quando todos os arquivos entram em `results.ok = false` por causa desse mesmo erro.

## Plano

Migration nova elevando o `statement_timeout` **apenas dentro** das RPCs pesadas que já são `SECURITY DEFINER`. Sem tocar em código do front nem em outras funções.

1. `ALTER FUNCTION public.finalize_import(uuid, date, integer, uuid) SET statement_timeout = '5min'`
2. `ALTER FUNCTION public.refresh_sales_daily_agg(date) SET statement_timeout = '5min'`
3. `ALTER FUNCTION public.refresh_filter_hierarchy() SET statement_timeout = '2min'`
4. `ALTER FUNCTION public.upsert_products_bulk(jsonb, date) SET statement_timeout = '2min'` (preventivo — produtos em massa também podem passar do default)

O `SET` fica gravado como config da função (`pg_proc.proconfig`), aplicado a cada chamada, sem alterar timeout global nem tocar código cliente.

## Verificação

- Executar um import real de uma data com ~50k linhas.
- Confirmar que `import_log` recebe o registro e o toast final mostra sucesso.
- Se aparecer novo timeout, avaliar chunking do DELETE por partição de data.

## Detalhes técnicos

- Não altera assinatura, corpo ou permissões das funções — só anexa a GUC via `ALTER FUNCTION ... SET`.
- Não requer regenerar `types.ts`.
- Não mexe em `upload.functions.ts` nem no fluxo de chunks do cliente.