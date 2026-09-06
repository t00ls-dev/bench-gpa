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
  employee_id: string | null;
  last_activity_at: Date | string | null;
  password_change_required: number | boolean;
}

const ACTIVITY_UPDATE_INTERVAL_MS = 5 * 60 * 1000;

function shouldUpdateActivity(lastActivityAt: Date | string | null): boolean {
  if (lastActivityAt === null) return true;
  const timestamp = new Date(lastActivityAt).getTime();
  return !Number.isFinite(timestamp) || Date.now() - timestamp >= ACTIVITY_UPDATE_INTERVAL_MS;
}

export interface ResolvedSession {
  userId: string;
  userRole: string;
  userName: string;
  userUsername: string | null;
  userEmployeeId: string | null;
  persistent: boolean;
  /** true if the account hasn't set a password yet (first access/admin
   * reset) or if the password has gone more than 30 days without being
   * changed. Deciding what to do with this is up to each caller --
   * resolveSession never throws because of it (see the comment in
   * auth-middleware.ts for why). */
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

/** Issues the initial session on login: the one place that decides between
 * "keep me signed in" mode (fixed, 7 days) and normal mode (slides by
 * activity, 24h cap). */
export function issueSession(
  user: { id: string; role: string; tokenVersion: number },
  persistent: boolean,
): void {
  const loginAt = Math.floor(Date.now() / 1000);
  const token = signSessionToken(user, { persistent, loginAt });
  writeSessionCookie(token, persistent);
}

/**
 * Validates the session cookie and, if `slide` is true and the session is
 * "normal" (not persistent), re-issues the cookie with a new deadline:
 * that's what gives the inactivity-based expiration behavior. `slide: false`
 * is used by callers that only need to check identity (e.g. `getMe`, called
 * on every navigation and cached for 60s) without wanting the side effect of
 * re-issuing the cookie on every call.
 *
 * Throws on any authentication failure: every message starts with
 * "Unauthorized" for callers that need to distinguish the reason
 * (`requireAuth`); `getMe` only wants to know if it succeeded and converts
 * any exception into `null`.
 *
 * Does NOT throw because of `passwordChangeRequired`: that isn't an
 * authentication failure (the session is valid), it's a state each caller
 * decides how to handle -- see auth-middleware.ts.
 */
export async function resolveSession(
  token: string | undefined,
  opts: { slide: boolean },
): Promise<ResolvedSession> {
  if (!token) throw new Error("Unauthorized: no session cookie");

  const payload = jwt.verify(token, jwtSecret()) as SessionPayload;

  // password_change_required computed in SQL (not JS): the database
  // server's NOW() is the only source of time that matters here, and
  // comparing in SQL avoids depending on the Node process's timezone.
  //
  // password_changed_at IS NULL treats a missing timestamp as "needs to
  // change" (fail-safe), not as "never expires" (fail-open): in SQL, any
  // comparison with NULL is NULL/falsy, so without this explicit OR an
  // account whose password_changed_at was never filled in would be exempt
  // from ever expiring.
  const [rowsRaw] = await db.query(
    `SELECT id, name, role, is_active, token_version, username, employee_id, last_activity_at,
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

  // Revocation: resetPassword/changePassword/logout increment token_version,
  // so every token issued before that stops being valid here. `?? 0` covers
  // tokens issued before this column existed: they're born at 0 and stay
  // valid until they expire naturally.
  if ((payload.tokenVersion ?? 0) !== dbUser.token_version) {
    throw new Error("Unauthorized: session revoked");
  }

  if (!payload.persistent) {
    // Tokens issued before this change don't have `loginAt`: treated as if
    // login were now, giving a 24h cap from the deploy instead of expiring
    // everyone at once.
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

  if (shouldUpdateActivity(dbUser.last_activity_at)) {
    await db.query(
      `UPDATE users
       SET last_activity_at = NOW(), updated_at = updated_at
       WHERE id = ?
         AND (last_activity_at IS NULL OR last_activity_at < NOW() - INTERVAL 5 MINUTE)`,
      [dbUser.id],
    );
  }

  return {
    userId: payload.userId,
    userRole: dbUser.role,
    userName: dbUser.name,
    userUsername: dbUser.username,
    userEmployeeId: dbUser.employee_id,
    persistent: payload.persistent ?? false,
    passwordChangeRequired: Boolean(dbUser.password_change_required),
  };
}
