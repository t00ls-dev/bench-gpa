import jwt from "jsonwebtoken";
import { setCookie } from "@tanstack/react-start/server";
import db from "./db";
import {
  SESSION_COOKIE,
  INACTIVITY_TIMEOUT_SECONDS,
  SESSION_ABSOLUTE_CAP_SECONDS,
  REMEMBER_ME_EXPIRY_SECONDS,
} from "./auth-config";

interface SessionPayload {
  userId: string;
  role: string;
  email: string;
  tokenVersion?: number;
  loginAt?: number;
  persistent?: boolean;
}

interface AuthUserRow {
  id: string;
  name: string;
  role: string;
  is_active: boolean;
  token_version: number;
}

export interface ResolvedSession {
  userId: string;
  userRole: string;
  userEmail: string;
  userName: string;
}

function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET not configured");
  return secret;
}

function signSessionToken(
  user: { id: string; role: string; email: string; tokenVersion: number },
  opts: { persistent: boolean; loginAt: number },
): string {
  return jwt.sign(
    {
      userId: user.id,
      role: user.role,
      email: user.email,
      tokenVersion: user.tokenVersion,
      loginAt: opts.loginAt,
      persistent: opts.persistent,
    },
    jwtSecret(),
    { expiresIn: opts.persistent ? REMEMBER_ME_EXPIRY_SECONDS : INACTIVITY_TIMEOUT_SECONDS },
  );
}

function writeSessionCookie(token: string, persistent: boolean): void {
  setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    path: "/",
    maxAge: persistent ? REMEMBER_ME_EXPIRY_SECONDS : INACTIVITY_TIMEOUT_SECONDS,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

/** Emite a sessão inicial no login: único ponto que decide entre o modo
 * "Manter conectado" (fixo, 7 dias) e o modo normal (desliza por atividade,
 * teto de 24h). */
export function issueSession(
  user: { id: string; role: string; email: string; tokenVersion: number },
  persistent: boolean,
): void {
  const loginAt = Math.floor(Date.now() / 1000);
  const token = signSessionToken(user, { persistent, loginAt });
  writeSessionCookie(token, persistent);
}

/**
 * Valida o cookie de sessão e, se `slide` for true e a sessão for do tipo
 * "normal" (não persistente), reemite o cookie com um novo prazo: é o que dá
 * o comportamento de expiração por inatividade. `slide: false` é usado por
 * quem só precisa checar a identidade (ex.: `getMe`, chamado a cada navegação
 * e cacheado por 60s) sem querer o efeito colateral de reemitir o cookie a
 * cada chamada.
 *
 * Lança em qualquer falha: cada mensagem começa com "Unauthorized" para quem
 * precisa distinguir o motivo (`requireAuth`); `getMe` só quer saber se deu
 * certo e converte qualquer exceção em `null`.
 */
export async function resolveSession(
  token: string | undefined,
  opts: { slide: boolean },
): Promise<ResolvedSession> {
  if (!token) throw new Error("Unauthorized: no session cookie");

  const payload = jwt.verify(token, jwtSecret()) as SessionPayload;

  const [rowsRaw] = await db.query(
    "SELECT id, name, role, is_active, token_version FROM users WHERE id = ?",
    [payload.userId],
  );
  const rows = rowsRaw as unknown as AuthUserRow[];
  if (!rows.length || !rows[0].is_active) {
    throw new Error("Unauthorized: user inactive or not found");
  }
  const dbUser = rows[0];

  // Revogação: resetPassword incrementa token_version, então todo token
  // emitido antes para de valer aqui. `?? 0` cobre tokens emitidos antes desta
  // coluna existir: nascem em 0 e seguem válidos até expirar naturalmente.
  if ((payload.tokenVersion ?? 0) !== dbUser.token_version) {
    throw new Error("Unauthorized: session revoked");
  }

  if (!payload.persistent) {
    // Tokens emitidos antes desta mudança não têm `loginAt`: tratamos como se
    // o login fosse agora, dando um teto de 24h a partir do deploy em vez de
    // expirar todo mundo de uma vez.
    const loginAt = payload.loginAt ?? Math.floor(Date.now() / 1000);
    const age = Math.floor(Date.now() / 1000) - loginAt;
    if (age > SESSION_ABSOLUTE_CAP_SECONDS) {
      throw new Error("Unauthorized: session expired");
    }
    if (opts.slide) {
      const refreshed = signSessionToken(
        {
          id: dbUser.id,
          role: dbUser.role,
          email: payload.email,
          tokenVersion: dbUser.token_version,
        },
        { persistent: false, loginAt },
      );
      writeSessionCookie(refreshed, false);
    }
  }

  return {
    userId: payload.userId,
    userRole: dbUser.role,
    userEmail: payload.email,
    userName: dbUser.name,
  };
}
