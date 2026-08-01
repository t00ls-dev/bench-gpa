/**
 * Checagens que devem impedir o processo de subir, não só logar um aviso.
 * `TURNSTILE_BYPASS=true` desliga o CAPTCHA do login inteiro — é uma flag de
 * dev/teste (ver .claude/skills/run) que nunca deveria vazar pra produção,
 * mas hoje passa direto do `.env` pro processo do PM2
 * (`ecosystem.config.cjs`) sem nenhuma validação. Chamado uma vez, no
 * carregamento do módulo de entrada do servidor (`src/server.ts`) — se
 * lançar, o processo nem chega a subir, em vez de rodar em produção com o
 * CAPTCHA desligado silenciosamente.
 */
export function assertSafeBoot(env: { NODE_ENV?: string; TURNSTILE_BYPASS?: string }): void {
  if (env.NODE_ENV === "production" && env.TURNSTILE_BYPASS === "true") {
    throw new Error(
      "TURNSTILE_BYPASS=true em produção (NODE_ENV=production) desliga o CAPTCHA de login " +
        "inteiro. Corrija a variável de ambiente antes de subir o servidor.",
    );
  }
}
