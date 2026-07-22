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
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: env.PORT ?? "3000",
        DB_HOST: env.DB_HOST ?? "localhost",
        DB_PORT: env.DB_PORT ?? "3306",
        DB_NAME: env.DB_NAME ?? "bench_gpa",
        DB_USER: env.DB_USER ?? "bench_gpa",
        DB_PASS: env.DB_PASS ?? "",
        JWT_SECRET: env.JWT_SECRET ?? "",
        JWT_EXPIRY: env.JWT_EXPIRY ?? "604800",
        TURNSTILE_SECRET_KEY: env.TURNSTILE_SECRET_KEY ?? "",
        TURNSTILE_BYPASS: env.TURNSTILE_BYPASS ?? "false",
      },
      max_memory_restart: "512M",
      error_file: "logs/pm2-error.log",
      out_file: "logs/pm2-out.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
  ],
};
