// Precisa ser o primeiro import de src/server.ts: módulos importados depois
// dele (error-capture, csp, etc.) só são avaliados após este arquivo rodar,
// então é aqui (e só aqui) que dá pra garantir o SDK inicializado antes de
// qualquer outro código do servidor.
import * as Sentry from "@sentry/tanstackstart-react";
import { isRedirect, isNotFound } from "@tanstack/react-router";

// Referência direta ao client, não a busca ambiente (Sentry.getClient()):
// dentro da execução de server function do TanStack Start, a propagação de
// contexto que o SDK usa pra achar o client/scope "atual" não funciona (não
// é só o tunnel: confirmado que nem captureException() direto acha client
// nenhum aqui, mesmo chamado no mesmo request). server.ts já tinha essa
// mesma lição pro tunnel (allowedDsns explícito em vez de getClient()); esta
// é a versão pra dentro de server functions.
export const sentryServerClient = Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: !!process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV === "production" ? "production" : "development",
  release: __COMMIT_HASH__,
  tracesSampleRate: 1.0,
  enableLogs: true,
  // Substitui sendDefaultPii (deprecado): habilita só query string de URL e
  // parâmetros/valores de query SQL (dado de negócio interno, sem PII de
  // consumidor). Todo o resto explicitamente desligado, mesmo os que
  // teriam default true nesta opção: cookie de sessão é o JWT httpOnly,
  // corpo de request inclui a senha em texto puro no POST de /auth, e
  // variável local no stack trace pode capturar credencial que estivesse
  // em memória no momento do crash.
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: { request: false, response: false },
    httpBodies: [],
    urlQueryParams: true,
    databaseQueryData: true,
    stackFrameVariables: false,
  },
  // Níveis batem com o que o código já usa (só console.warn/console.error
  // hoje, nenhum console.log): não precisa mudar call site nenhum pra
  // esses logs aparecerem correlacionados com erro/trace no Sentry.
  integrations: [Sentry.consoleLoggingIntegration({ levels: ["warn", "error"] })],
  // redirect()/notFound() do TanStack Router se propagam como throw (ver
  // errorMiddleware em src/start.ts, que os deixa passar de propósito) e não
  // são erro nenhum, são navegação normal: sem este filtro, toda troca de
  // rota autenticada ou 404 vira "erro" no Sentry.
  beforeSend(event, hint) {
    const error = hint.originalException;
    if (isRedirect(error) || isNotFound(error)) return null;
    return event;
  },
});
