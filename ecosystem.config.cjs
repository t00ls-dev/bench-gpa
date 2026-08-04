const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");

function loadEnv() {
  const envFile = resolve(__dirname, ".env");
  try {
    const content = readFileSync(envFile, "utf-8");
    const env = {};
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const sep = trimmed.indexOf("=");
      if (sep === -1) continue;
      const key = trimmed.slice(0, sep).trim();
      let val = trimmed.slice(sep + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (key) env[key] = val;
    }
    return env;
  } catch {
    return {};
  }
}

const env = loadEnv();

module.exports = {
  apps: [
    {
      name: "bench-gpa",
      script: ".output/server/index.mjs",
      // cluster (não fork): pm2 reload faz troca gradual worker por worker
      // (sobe o novo, espera responder, só então mata o antigo) em vez do
      // restart completo do fork mode. VPS de 1 núcleo: 2 instâncias não
      // ganha paralelismo real de CPU, é só o suficiente pra sempre ter pelo
      // menos um worker de pé durante a troca.
      //
      // Estado em memória de processo deixa de ser global do app com isto:
      // SimpleCache (src/lib/cache.ts) e os RateLimiter (src/lib/rate-limit.ts)
      // passam a ser por worker, não mais únicos. Cache: só reduz um pouco o
      // hit rate, sem bug. Rate limit: o teto efetivo por IP dilui por worker,
      // aceito conscientemente (ver docs/medicao-performance.md) porque o
      // gargalo real do authLimiter é o custo de CPU do bcrypt, compartilhado
      // entre os workers no mesmo núcleo, não o contador em si.
      instances: 2,
      exec_mode: "cluster",
      // Default do PM2 (GRACEFUL_LISTEN_TIMEOUT) é 3000ms: tempo curto demais
      // pro nosso boot real sob reload. Medido em produção (04/08/2026, duas
      // falhas de deploy seguidas causadas por isto): cada worker leva
      // consistentemente ~4,8s do pedido de reload até confirmar "listening"
      // (pool de conexão do MariaDB, SDK do Sentry, registro de rotas, tudo
      // competindo pela CPU única com o outro worker subindo ao mesmo tempo).
      // Sem isto, o PM2 desiste de esperar antes do worker novo responder,
      // considera o reload malsucedido e o workflow de deploy reverte pro
      // build anterior mesmo com os dois workers saudáveis um instante depois.
      // 8000ms dá margem confortável acima do medido, mesma ordem de grandeza
      // do GRACEFUL_TIMEOUT (8000ms) que o próprio PM2 já usa como padrão.
      listen_timeout: 8000,
      env: {
        NODE_ENV: "production",
        PORT: env.PORT ?? "3000",
        DB_HOST: env.DB_HOST ?? "localhost",
        DB_PORT: env.DB_PORT ?? "3306",
        DB_NAME: env.DB_NAME ?? "admin_gpa",
        DB_USER: env.DB_USER ?? "admin_gpa",
        DB_PASS: env.DB_PASS ?? "",
        JWT_SECRET: env.JWT_SECRET ?? "",
        TURNSTILE_SECRET_KEY: env.TURNSTILE_SECRET_KEY ?? "",
        TURNSTILE_BYPASS: env.TURNSTILE_BYPASS ?? "false",
        SENTRY_DSN: env.SENTRY_DSN ?? "",
      },
      max_memory_restart: "512M",
      error_file: "logs/pm2-error.log",
      out_file: "logs/pm2-out.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
  ],
};
