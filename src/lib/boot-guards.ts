/**
 * Checks that must stop the process from booting, not just log a warning.
 * `TURNSTILE_BYPASS=true` disables the entire login CAPTCHA: it's a dev/test
 * flag (see .opencode/skills/run) that should never leak into production, but
 * today it flows straight from `.env` into the PM2 process
 * (`ecosystem.config.cjs`) with no validation. Called once, when the
 * server's entry module loads (`src/server.ts`): if it throws, the process
 * never even boots, instead of running in production with the CAPTCHA
 * silently disabled.
 */
export function assertSafeBoot(env: { NODE_ENV?: string; TURNSTILE_BYPASS?: string }): void {
  if (env.NODE_ENV === "production" && env.TURNSTILE_BYPASS === "true") {
    throw new Error(
      "TURNSTILE_BYPASS=true em produção (NODE_ENV=production) desliga o CAPTCHA de login " +
        "inteiro. Corrija a variável de ambiente antes de subir o servidor.",
    );
  }
}
