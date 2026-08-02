import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import * as Sentry from "@sentry/tanstackstart-react";
import { parseCookie } from "cookie";
import { SESSION_COOKIE } from "./auth-config";
import { resolveSession } from "./session";

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

  try {
    // slide: true: toda chamada autenticada renova a sessão "normal" por mais
    // INACTIVITY_TIMEOUT_SECONDS, é isso que dá o comportamento de expiração
    // por inatividade em vez de um prazo fixo desde o login.
    const session = await resolveSession(token, { slide: true });
    // Escopo isolado por requisição (instrumentação automática do @sentry/node):
    // não vaza identidade entre chamadas concorrentes de usuários diferentes
    // no mesmo processo.
    Sentry.setUser({ id: session.userId, email: session.userEmail });
    return next({
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
    if (err instanceof Error && err.message.startsWith("Unauthorized")) {
      throw err;
    }
    throw new Error("Unauthorized: invalid token", { cause: err });
  }
});
