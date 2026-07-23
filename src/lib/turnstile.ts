const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Turnstile está ativo (e portanto obrigatório) quando há uma secret
 * configurada e o bypass não está ligado. Serve para o login exigir o token —
 * fail-closed: quando ativo, uma requisição sem token deve ser recusada, não
 * ignorada.
 */
export function isTurnstileEnabled(): boolean {
  return process.env.TURNSTILE_BYPASS !== "true" && !!process.env.TURNSTILE_SECRET_KEY;
}

export async function verifyTurnstile(token: string, ip?: string): Promise<boolean> {
  if (process.env.TURNSTILE_BYPASS === "true") {
    console.warn("[Turnstile] Bypass ativado via env");
    return true;
  }

  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.error("[Turnstile] TURNSTILE_SECRET_KEY não configurada");
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
        console.error(`[Turnstile] HTTP ${res.status} na verificação`);
        continue;
      }

      const data = (await res.json()) as { success: boolean };
      return data.success === true;
    } catch (err) {
      console.error(`[Turnstile] Tentativa ${attempt + 1} falhou:`, err);
      if (attempt === 1) {
        console.error("[Turnstile] API indisponível após 2 tentativas — fail-closed");
        return false;
      }
    }
  }

  return false;
}
