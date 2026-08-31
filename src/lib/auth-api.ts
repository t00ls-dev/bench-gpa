import { createServerFn } from "@tanstack/react-start";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { getRequest, getCookie, deleteCookie } from "@tanstack/react-start/server";
import db from "./db";
import { z } from "zod";
import { verifyTurnstile, isTurnstileEnabled } from "./turnstile";
import { authLimiter, authAccountLimiter, getClientIp } from "./rate-limit";
import { recordAudit } from "./audit";
import { SESSION_COOKIE, BCRYPT_COST } from "./auth-config";
import { issueSession, resolveSession } from "./session";
import { requireAuthAllowExpiredPassword } from "./auth-middleware";
import { requireRateLimit } from "./rate-limit.middleware";
import { rejectRateLimit } from "./rate-limit-response";
import { AuthIdentifierSchema, AuthPasswordInputSchema, PasswordSchema } from "./schemas";
import { markExpectedError } from "./sentry-error-metadata";

const JWT_SECRET = process.env.JWT_SECRET!;

interface UserRow {
  id: string;
  username: string | null;
  employee_id: string | null;
  name: string;
  password: string | null;
  role: string;
  is_active: boolean;
  token_version: number;
}

function clearSessionCookie(): void {
  deleteCookie(SESSION_COOKIE, { path: "/" });
}

const NewPasswordFields = {
  newPassword: PasswordSchema,
  confirmPassword: PasswordSchema,
};

function refinePasswordsMatch<T extends { newPassword: string; confirmPassword: string }>(
  schema: z.ZodType<T>,
) {
  return schema.refine((v) => v.newPassword === v.confirmPassword, {
    message: "As senhas não coincidem.",
    path: ["confirmPassword"],
  });
}

export const login = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        identifier: AuthIdentifierSchema,
        password: AuthPasswordInputSchema,
        turnstileToken: z.string().optional(),
        // "Keep me signed in": fixed 7-day session instead of the normal one
        // (slides by activity, 24h cap). See src/lib/auth-config.ts.
        rememberMe: z.boolean().optional().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const request = getRequest();
    const ip = getClientIp(request);
    // Lowercase only: employee_id is digits (case doesn't matter) and
    // username is already normalized to lowercase at creation/migration.
    const identifier = data.identifier.toLowerCase();

    const auditFail = (reason: string, actorId?: string | null, actorUsername?: string | null) =>
      recordAudit({
        action: "auth.login_failed",
        actorId: actorId ?? null,
        actorUsername: actorUsername ?? data.identifier,
        targetType: "session",
        detail: reason,
        ip,
      });

    const rl = authLimiter.check(ip);
    if (!rl.allowed) {
      await auditFail("excesso de tentativas (rate limit)");
      rejectRateLimit(rl, "Muitas tentativas de login. Aguarde um minuto.");
    }

    // Validate the challenge before looking up the account or consuming its
    // bucket, so invalid CAPTCHA traffic cannot lock out a real user.
    if (isTurnstileEnabled() && !data.turnstileToken) {
      await auditFail("Turnstile ausente");
      throw new Error("Falha na verificação de segurança. Recarregue e tente novamente.");
    }
    if (data.turnstileToken) {
      const turnstileOk = await verifyTurnstile(data.turnstileToken, ip);
      if (!turnstileOk) {
        await auditFail("falha no Turnstile");
        throw new Error("Falha na verificação de segurança. Recarregue e tente novamente.");
      }
    }

    const [rowsRaw] = await db.query(
      "SELECT id, username, employee_id, name, password, role, is_active, token_version FROM users WHERE username = ? OR employee_id = ?",
      [identifier, identifier],
    );
    const rows = rowsRaw as unknown as UserRow[];
    const user = rows[0] ?? null;

    // Bucket per account, keyed by the resolved id (not the string typed in):
    // protects against credential stuffing distributed across several IPs
    // against the same account, and switching between login by username and
    // by employee_id for the SAME account doesn't reset the bucket. Account
    // not found falls back to a key by the raw identifier, keeping the same
    // coverage against brute-force of a nonexistent account.
    const accountRateKey = user ? `user:${user.id}` : `identifier:${identifier}`;
    const rlAccount = authAccountLimiter.check(accountRateKey);
    if (!rlAccount.allowed) {
      await auditFail("excesso de tentativas na conta (rate limit)", user?.id, user?.username);
      rejectRateLimit(
        rlAccount,
        "Muitas tentativas de login para esta conta. Aguarde alguns minutos.",
      );
    }

    if (!user) {
      await auditFail("usuário não encontrado");
      throw new Error("Usuário/matrícula ou senha inválidos.");
    }
    if (!user.is_active) {
      await auditFail("usuário inativo", user.id, user.username);
      throw new Error("Usuário inativo. Procure o administrador.");
    }
    if (user.password === null) {
      await auditFail("primeiro acesso pendente", user.id, user.username);
      throw new Error(
        'Esta conta ainda não concluiu o primeiro acesso. Use a opção "Primeiro acesso" abaixo.',
      );
    }
    const valid = await bcrypt.compare(data.password, user.password);
    if (!valid) {
      await auditFail("senha incorreta", user.id, user.username);
      throw new Error("Usuário/matrícula ou senha inválidos.");
    }
    await db.query("UPDATE users SET last_login_at = NOW() WHERE id = ?", [user.id]);
    authAccountLimiter.reset(accountRateKey);
    issueSession(
      { id: user.id, role: user.role, tokenVersion: user.token_version },
      data.rememberMe,
    );
    await recordAudit({
      action: "auth.login",
      actorId: user.id,
      actorUsername: user.username,
      targetType: "session",
      ip,
    });
    return { ok: true } as const;
  });

export const getMe = createServerFn({ method: "GET" })
  .middleware([requireRateLimit()])
  .handler(async () => {
    const token = getCookie(SESSION_COOKIE);
    try {
      // slide: false (getMe runs on every navigation, cached 60s in the route
      // guard) and shouldn't have the side effect of re-issuing the cookie;
      // requireAuth is what renews the session by activity, called by the
      // functions that actually fetch data.
      const session = await resolveSession(token, { slide: false });
      return {
        id: session.userId,
        username: session.userUsername,
        employeeId: session.userEmployeeId,
        name: session.userName,
        role: session.userRole,
        passwordChangeRequired: session.passwordChangeRequired,
      };
    } catch {
      return null;
    }
  });

export const logout = createServerFn({ method: "POST" })
  .middleware([requireRateLimit()])
  .handler(async () => {
    const token = getCookie(SESSION_COOKIE);
    if (token) {
      try {
        const payload = jwt.verify(token, JWT_SECRET) as { userId: string };
        const [rowsRaw] = await db.query("SELECT username FROM users WHERE id = ?", [
          payload.userId,
        ]);
        const rows = rowsRaw as unknown as { username: string | null }[];
        // token_version + 1 revokes the JWT server-side, not just the browser
        // cookie (same pattern as resetPassword in admin-users.functions.ts).
        // Without this, a token captured before logout (proxy, shared device,
        // etc.) would keep being accepted until it expired on its own (up to
        // 7 days on a "keep me signed in" session, see auth-config.ts).
        // Accepted side effect: logs out all of the user's sessions, not just
        // this one.
        await db.query("UPDATE users SET token_version = token_version + 1 WHERE id = ?", [
          payload.userId,
        ]);
        await recordAudit({
          action: "auth.logout",
          actorId: payload.userId,
          actorUsername: rows[0]?.username ?? null,
          targetType: "session",
        });
      } catch {
        // Invalid/expired token: nothing to revoke or audit.
      }
    }
    clearSessionCookie();
    return { ok: true } as const;
  });

/**
 * Sets the password for an account with no password (first access, or after
 * an admin reset -- both leave `password` NULL, same state, same flow). No
 * session: since there's no password to check, the single identifier
 * (username OR employee_id, same resolution as login) serves as proof of
 * identity -- a product decision, one field only, to avoid requiring
 * information the user might not have on hand. Since this is a weaker proof
 * of identity than username+employee_id together, the login's three
 * protection layers stay mandatory here: rate limit by IP, by account (key =
 * resolved id), and fail-closed Turnstile.
 */
export const setInitialPassword = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    refinePasswordsMatch(
      z.object({
        identifier: AuthIdentifierSchema,
        turnstileToken: z.string().optional(),
        ...NewPasswordFields,
      }),
    ).parse(d),
  )
  .handler(async ({ data }) => {
    const request = getRequest();
    const ip = getClientIp(request);
    const identifier = data.identifier.toLowerCase();

    const rl = authLimiter.check(ip);
    if (!rl.allowed) {
      rejectRateLimit(rl, "Muitas tentativas. Aguarde um minuto.");
    }

    if (isTurnstileEnabled() && !data.turnstileToken) {
      throw new Error("Falha na verificação de segurança. Recarregue e tente novamente.");
    }
    if (data.turnstileToken) {
      const turnstileOk = await verifyTurnstile(data.turnstileToken, ip);
      if (!turnstileOk) {
        throw new Error("Falha na verificação de segurança. Recarregue e tente novamente.");
      }
    }

    const [rowsRaw] = await db.query(
      "SELECT id, username, role, password, token_version FROM users WHERE username = ? OR employee_id = ?",
      [identifier, identifier],
    );
    const rows = rowsRaw as unknown as {
      id: string;
      username: string | null;
      role: string;
      password: string | null;
      token_version: number;
    }[];
    const user = rows[0] ?? null;

    const accountRateKey = user ? `user:${user.id}` : `identifier:${identifier}`;
    const rlAccount = authAccountLimiter.check(accountRateKey);
    if (!rlAccount.allowed) {
      rejectRateLimit(rlAccount, "Muitas tentativas. Aguarde alguns minutos.");
    }

    // Generic message for both a nonexistent identifier and an account
    // that's already completed first access: don't become an account
    // enumeration oracle (revealing "this account already has a password"
    // is already too much information).
    if (!user || user.password !== null) {
      await recordAudit({
        action: "auth.first_access_failed",
        actorId: user?.id ?? null,
        actorUsername: user?.username ?? identifier,
        targetType: "session",
        ip,
      });
      throw markExpectedError(new Error("Usuário ou matrícula inválidos."));
    }

    const hash = await bcrypt.hash(data.newPassword, BCRYPT_COST);
    await db.query(
      "UPDATE users SET password = ?, password_changed_at = NOW(), last_login_at = NOW() WHERE id = ?",
      [hash, user.id],
    );
    authAccountLimiter.reset(accountRateKey);
    // Auto-login: the user just proved possession of the identifier AND
    // chose their own password in the same request, requiring a fresh login
    // right after gains no security at all, just adds a round trip.
    issueSession({ id: user.id, role: user.role, tokenVersion: user.token_version }, false);
    await recordAudit({
      action: "auth.first_access_completed",
      actorId: user.id,
      actorUsername: user.username ?? identifier,
      targetType: "session",
      ip,
    });
    return { ok: true } as const;
  });

/**
 * Authenticated password change: requires the current password. Serves both
 * the voluntary change and the forced-by-expiry flow (user already
 * authenticated with the current/expired password at login, just needs to
 * confirm it again) -- that's why it uses `requireAuthAllowExpiredPassword`,
 * not the default `requireAuth`: it's the function that resolves the
 * "expired password" state itself, it can't be blocked by it.
 */
export const changePassword = createServerFn({ method: "POST" })
  .middleware([requireAuthAllowExpiredPassword, requireRateLimit("auth")])
  .inputValidator((d: unknown) =>
    refinePasswordsMatch(
      z.object({
        currentPassword: AuthPasswordInputSchema,
        ...NewPasswordFields,
      }),
    ).parse(d),
  )
  .handler(async ({ data, context }) => {
    const [rowsRaw] = await db.query("SELECT password FROM users WHERE id = ?", [context.userId]);
    const rows = rowsRaw as unknown as { password: string | null }[];
    const currentHash = rows[0]?.password ?? null;
    if (currentHash === null || !(await bcrypt.compare(data.currentPassword, currentHash))) {
      throw new Error("Senha atual incorreta.");
    }

    const newHash = await bcrypt.hash(data.newPassword, BCRYPT_COST);
    // token_version + 1 revokes the other open sessions (same pattern as an
    // admin reset). Needs to read the new version back to re-issue the
    // session for the CURRENT request before returning: without this, the
    // tab that just changed the password self-destructs on the next call
    // (the cookie in hand carries the old token_version) -- in the
    // forced-by-expiry flow it's even worse, it turns into a
    // change-logout-change loop.
    await db.query(
      "UPDATE users SET password = ?, password_changed_at = NOW(), token_version = token_version + 1 WHERE id = ?",
      [newHash, context.userId],
    );
    const [freshRaw] = await db.query("SELECT token_version FROM users WHERE id = ?", [
      context.userId,
    ]);
    const fresh = (freshRaw as unknown as { token_version: number }[])[0];
    issueSession(
      { id: context.userId, role: context.userRole, tokenVersion: fresh.token_version },
      context.persistent,
    );
    await recordAudit({
      action: "auth.password_change",
      actorId: context.userId,
      actorUsername: context.userUsername,
      targetType: "session",
      detail: "sessões anteriores revogadas",
    });
    return { ok: true } as const;
  });
