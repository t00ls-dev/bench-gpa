type BootEnvironment = Partial<
  Record<
    | "NODE_ENV"
    | "PORT"
    | "DB_HOST"
    | "DB_PORT"
    | "DB_NAME"
    | "DB_USER"
    | "DB_PASS"
    | "JWT_SECRET"
    | "TURNSTILE_SECRET_KEY"
    | "TURNSTILE_BYPASS",
    string
  >
>;

const REQUIRED_PRODUCTION_VARIABLES = [
  "DB_HOST",
  "DB_NAME",
  "DB_USER",
  "DB_PASS",
  "JWT_SECRET",
  "TURNSTILE_SECRET_KEY",
] as const;

function isValidPort(value: string | undefined): boolean {
  if (!value || !/^[1-9]\d*$/.test(value)) return false;
  return Number(value) <= 65_535;
}

/** Stops production before it can serve requests with unsafe configuration. */
export function assertSafeBoot(env: BootEnvironment): void {
  if (env.NODE_ENV !== "production") return;

  const invalidVariables: string[] = REQUIRED_PRODUCTION_VARIABLES.filter(
    (name) => !env[name]?.trim(),
  );

  if (!isValidPort(env.DB_PORT)) invalidVariables.push("DB_PORT");
  if (env.PORT !== undefined && !isValidPort(env.PORT)) invalidVariables.push("PORT");
  if (env.TURNSTILE_BYPASS !== "false") invalidVariables.push("TURNSTILE_BYPASS");

  if (invalidVariables.length > 0) {
    throw new Error(`Invalid production environment variables: ${invalidVariables.join(", ")}`);
  }
}
