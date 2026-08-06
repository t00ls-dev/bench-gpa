const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Turnstile is active (and therefore required) when a secret is configured
 * and bypass isn't on. Used so login requires the token: fail-closed, when
 * active a request without a token must be rejected, not ignored.
 */
export function isTurnstileEnabled(): boolean {
  return process.env.TURNSTILE_BYPASS !== "true" && !!process.env.TURNSTILE_SECRET_KEY;
}

export async function verifyTurnstile(token: string, ip?: string): Promise<boolean> {
  if (process.env.TURNSTILE_BYPASS === "true") {
    console.warn("[Turnstile] Bypass enabled via env");
    return true;
  }

  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.error("[Turnstile] TURNSTILE_SECRET_KEY not configured");
    return false;
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const body = new URLSearchParams({ secret, response: token });
      if (ip) body.set("remoteip", ip);

      const res = await fetch(TURNSTILE_VERIFY_URL, {
        method: "POST",
        body,
        signal: AbortSignal.timeout(5_000),
      });

      if (!res.ok) {
        console.error(`[Turnstile] HTTP ${res.status} during verification`);
        continue;
      }

      const data = (await res.json()) as { success: boolean };
      return data.success === true;
    } catch (err) {
      console.error(`[Turnstile] Attempt ${attempt + 1} failed:`, err);
      if (attempt === 1) {
        console.error("[Turnstile] API unavailable after 2 attempts: fail-closed");
        return false;
      }
    }
  }

  return false;
}
