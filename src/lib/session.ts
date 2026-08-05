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
  username: string | null;
  matricula: string | null;
  password_change_required: number | boolean;
}

export interface ResolvedSession {
  userId: string;
  userRole: string;
  userName: string;
  userUsername: string | null;
  userMatricula: string | null;
  persistent: boolean;
  /** true se a conta ainda não definiu senha (primeiro acesso/reset por
   * admin) ou se a senha já passou de 30 dias sem trocar. Quem decide o que
   * fazer com isto é cada chamador -- resolveSession nunca lança por causa
   * dele (ver comentário em auth-middleware.ts sobre por quê). */
  passwordChangeRequired: boolean;
}

function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET not configured");
  return secret;
}

function signSessionToken(
  user: { id: string; role: string; tokenVersion: number },
  opts: { persistent: boolean; loginAt: number },
): string {
  return jwt.sign(
    {
      userId: user.id,
      role: user.role,
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
  user: { id: string; role: string; tokenVersion: number },
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
 * Lança em qualquer falha de autenticação: cada mensagem começa com
 * "Unauthorized" para quem precisa distinguir o motivo (`requireAuth`);
 * `getMe` só quer saber se deu certo e converte qualquer exceção em `null`.
 *
 * NÃO lança por causa de `passwordChangeRequired`: isso não é uma falha de
 * autenticação (a sessão é válida), é um estado que cada chamador decide como
 * tratar -- ver auth-middleware.ts.
 */
export async function resolveSession(
  token: string | undefined,
  opts: { slide: boolean },
): Promise<ResolvedSession> {
  if (!token) throw new Error("Unauthorized: no session cookie");

  const payload = jwt.verify(token, jwtSecret()) as SessionPayload;

  // password_change_required calculado em SQL (não em JS): NOW() do servidor
  // de banco é a única fonte de tempo que importa aqui, e comparar em SQL
  // evita depender do fuso horário do processo Node.
  //
  // password_changed_at IS NULL trata ausência do timestamp como "precisa
  // trocar" (fail-safe), não como "nunca expira" (fail-open): em SQL,
  // qualquer comparação com NULL é NULL/falsy, então sem esse OR explícito
  // uma conta cujo password_changed_at nunca foi preenchido ficaria isenta
  // de expirar para sempre.
  const [rowsRaw] = await db.query(
    `SELECT id, name, role, is_active, token_version, username, matricula,
            (password IS NULL
             OR password_changed_at IS NULL
             OR password_changed_at < NOW() - INTERVAL 30 DAY) AS password_change_required
     FROM users WHERE id = ?`,
    [payload.userId],
  );
  const rows = rowsRaw as unknown as AuthUserRow[];
  if (!rows.length || !rows[0].is_active) {
    throw new Error("Unauthorized: user inactive or not found");
  }
  const dbUser = rows[0];

  // Revogação: resetPassword/changePassword/logout incrementam token_version,
  // então todo token emitido antes para de valer aqui. `?? 0` cobre tokens
  // emitidos antes desta coluna existir: nascem em 0 e seguem válidos até
  // expirar naturalmente.
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
        { id: dbUser.id, role: dbUser.role, tokenVersion: dbUser.token_version },
        { persistent: false, loginAt },
      );
      writeSessionCookie(refreshed, false);
    }
  }

  return {
    userId: payload.userId,
    userRole: dbUser.role,
    userName: dbUser.name,
    userUsername: dbUser.username,
    userMatricula: dbUser.matricula,
    persistent: payload.persistent ?? false,
    passwordChangeRequired: Boolean(dbUser.password_change_required),
  };
}
