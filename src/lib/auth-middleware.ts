import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import * as Sentry from "@sentry/tanstackstart-react";
import { parseCookie } from "cookie";
import { SESSION_COOKIE } from "./auth-config";
import { resolveSession } from "./session";
import { getClientIp } from "./rate-limit";
import { sentryServerClient } from "./instrument-server";

export interface AuthContext {
  userId: string;
  userRole: string;
  userEmail: string;
}

export const requireAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET not configured");

  const request = getRequest();
  const cookieHeader = request?.headers?.get("cookie") || "";
  const parsed = parseCookie(cookieHeader);
  const token = parsed[SESSION_COOKIE];

  let session;
  try {
    // slide: true: toda chamada autenticada renova a sessão "normal" por mais
    // INACTIVITY_TIMEOUT_SECONDS, é isso que dá o comportamento de expiração
    // por inatividade em vez de um prazo fixo desde o login.
    session = await resolveSession(token, { slide: true });
  } catch (err) {
    // Escopo estreito de propósito: só cobre a resolução da sessão. Um catch
    // amplo (incluindo o next() abaixo) mascararia qualquer erro real de
    // dentro do handler como "Unauthorized: invalid token", perdendo o erro
    // original (mesmo indo pro .cause, é o tipo de bug que confunde debug).
    sentryServerClient?.captureException(err);
    if (err instanceof Error && err.message.startsWith("Unauthorized")) {
      throw err;
    }
    throw new Error("Unauthorized: invalid token", { cause: err });
  }

  // Referência explícita ao client (ver comentário em instrument-server.ts):
  // Sentry.setUser() ambiente não é confiável dentro da execução de server
  // function do TanStack Start, então usa-se a API de escopo isolado, que
  // não depende de lookup implícito.
  const ip = getClientIp(request);
  const scope = new Sentry.Scope();
  scope.setClient(sentryServerClient);
  scope.setUser({
    id: session.userId,
    email: session.userEmail,
    ...(ip !== "unknown" && { ip_address: ip }),
  });

  try {
    return await next({
      context: {
        userId: session.userId,
        // role vem do BANCO, não do payload: o JWT carrega o papel congelado na
        // emissão, então um usuário rebaixado seguiria com `userRole: "admin"`
        // no contexto até a sessão expirar. Hoje nada decide privilégio por
        // este campo (assertAdmin refaz a consulta via has_role), mas ele
        // existe e seria uma armadilha para o próximo uso.
        userRole: session.userRole,
        userEmail: session.userEmail,
      } satisfies AuthContext,
    });
  } catch (err) {
    scope.captureException(err);
    throw err;
  }
});
