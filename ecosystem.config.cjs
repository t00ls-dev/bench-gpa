module.exports = {
  apps: [
    {
      name: "bench-gpa",
      script: ".output/server/index.mjs",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        TURNSTILE_SECRET_KEY: "0x4AAAAAAD4LavRXoMQw1dQBOPXZwz-G7C0",
        TURNSTILE_BYPASS: "false",
        JWT_SECRET: "jw8+Bg7h1vASsjBjLUNno1T40PCmL9Nv2q6f6XhinMuUySeFIlz/msURRjd8+i4n",
        JWT_EXPIRY: "604800",
        DB_HOST: "localhost",
        DB_PORT: "3306",
        DB_NAME: "bench_gpa",
        DB_USER: "bench_gpa",
        DB_PASS: "bjcis49wFoMRBhzRET9I",
      },
      max_memory_restart: "512M",
      error_file: "logs/pm2-error.log",
      out_file: "logs/pm2-out.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
  ],
};
