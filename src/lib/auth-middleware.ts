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
  userUsername: string | null;
  persistent: boolean;
}

// Marks the error as already reported to Sentry: sentryFunctionErrorMiddleware
// (src/start.ts), being outside requireAuth in the middleware chain,
// recaptures any error re-thrown from here, duplicating the event. The
// capture here uses an explicit Scope (user context), the one there doesn't
// -- keeps the richer capture and makes the other one skip when it already
// happened. Also used for the PasswordChangeRequired case below, which is
// never actually reported (it's not an error, it's an expected flow state),
// just marked "already seen" so the other layer doesn't report it by
// mistake.
const SENTRY_REPORTED = Symbol("sentryReported");

export function isSentryReported(error: unknown): boolean {
  return typeof error === "object" && error !== null && SENTRY_REPORTED in error;
}

function markSentryReported(error: unknown) {
  if (typeof error === "object" && error !== null) {
    Object.defineProperty(error, SENTRY_REPORTED, { value: true });
  }
}

async function resolveAuthContext(
  allowPasswordChangeRequired: boolean,
): Promise<{ context: AuthContext; scope: Sentry.Scope }> {
  if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET not configured");

  const request = getRequest();
  const cookieHeader = request?.headers?.get("cookie") || "";
  const parsed = parseCookie(cookieHeader);
  const token = parsed[SESSION_COOKIE];

  let session;
  try {
    // slide: true: every authenticated call renews the "normal" session for
    // another INACTIVITY_TIMEOUT_SECONDS, that's what gives the
    // inactivity-based expiration behavior instead of a fixed deadline from
    // login.
    session = await resolveSession(token, { slide: true });
  } catch (err) {
    // Narrow scope on purpose: only covers session resolution. A broad
    // catch (including the next() below) would mask any real error inside
    // the handler as "Unauthorized: invalid token", losing the original
    // error (even going to .cause, it's the kind of bug that confuses
    // debugging).
    sentryServerClient?.captureException(err);
    if (err instanceof Error && err.message.startsWith("Unauthorized")) {
      markSentryReported(err);
      throw err;
    }
    const wrapped = new Error("Unauthorized: invalid token", { cause: err });
    markSentryReported(wrapped);
    throw wrapped;
  }

  // Outside the try/catch above on purpose: if it were inside, it'd fall
  // into the "else" branch (message doesn't start with "Unauthorized") and
  // get wrapped as "Unauthorized: invalid token", destroying the distinction
  // the client needs to redirect to /change-password instead of logging
  // out. Not reported to Sentry as a real error: it's an expected flow
  // state, just marked "already seen" so sentryFunctionErrorMiddleware
  // doesn't report it by mistake.
  if (!allowPasswordChangeRequired && session.passwordChangeRequired) {
    const err = new Error(
      "PasswordChangeRequired: a senha precisa ser definida ou atualizada antes de continuar.",
    );
    markSentryReported(err);
    throw err;
  }

  // Explicit reference to the client (see comment in instrument-server.ts):
  // ambient Sentry.setUser() isn't reliable inside a TanStack Start server
  // function's execution, so the isolated-scope API is used instead, which
  // doesn't depend on implicit lookup.
  const ip = getClientIp(request);
  const scope = new Sentry.Scope();
  scope.setClient(sentryServerClient);
  scope.setUser({
    id: session.userId,
    username: session.userUsername ?? undefined,
    ...(ip !== "unknown" && { ip_address: ip }),
  });

  return {
    scope,
    context: {
      userId: session.userId,
      // role comes from the DATABASE, not the payload: the JWT carries the
      // role frozen at issuance, so a demoted user would keep
      // `userRole: "admin"` in the context until the session expired.
      // Nothing decides privilege from this field today (assertAdmin
      // re-runs the query via has_role), but it exists and would be a trap
      // for the next use.
      userRole: session.userRole,
      userUsername: session.userUsername,
      persistent: session.persistent,
    },
  };
}

function buildRequireAuth(allowPasswordChangeRequired: boolean) {
  return createMiddleware({ type: "function" }).server(async ({ next }) => {
    const { context, scope } = await resolveAuthContext(allowPasswordChangeRequired);
    try {
      return await next({ context });
    } catch (err) {
      scope.captureException(err);
      markSentryReported(err);
      throw err;
    }
  });
}

export const requireAuth = buildRequireAuth(false);

/** Variant used only by `changePassword`: the function that resolves
 * `passwordChangeRequired` itself can't be blocked by it, or the user gets
 * stuck in a dead end (the forced-expiry flow turns into a loop). Still
 * requires a valid session (token, `is_active`, `token_version`) -- just
 * doesn't check password status. */
export const requireAuthAllowExpiredPassword = buildRequireAuth(true);
