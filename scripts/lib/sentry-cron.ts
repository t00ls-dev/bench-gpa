// Init do Sentry pros scripts de cron (purge-aggs, refresh-universe): rodam
// como processo bun avulso disparado pelo crontab, não pelo build da Vite/
// Nitro, então não tem acesso a __COMMIT_HASH__/__COMMIT_DATE__ (globals só
// existem via `define` do vite.config.ts) nem passam pelo pipeline de server
// function do TanStack Start onde a captura ambiente do Sentry é quebrada
// (ver src/lib/instrument-server.ts). Aqui é um script linear sem
// middleware aninhado, então Sentry.withMonitor()/captureCheckIn() (que usam
// getClient() por baixo) funcionam normalmente.
//
// @sentry/node direto (não @sentry/tanstackstart-react): é o pacote que
// exporta withMonitor/captureCheckIn, o outro não reexporta a API de Cron
// Monitors. Adicionado como dependência direta no package.json apesar de já
// vir transitivo (via @sentry/tanstackstart-react) pra não depender de hoist
// implícito do lockfile.
import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: !!process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV === "production" ? "production" : "development",
});
