import { describe, expect, it } from "vitest";
import { assertSafeBoot } from "./boot-guards";

const validProductionEnv = {
  NODE_ENV: "production",
  DB_HOST: "localhost",
  DB_PORT: "3306",
  DB_NAME: "bench_gpa",
  DB_USER: "bench_gpa",
  DB_PASS: "database-secret",
  JWT_SECRET: "jwt-secret",
  TURNSTILE_SECRET_KEY: "turnstile-secret",
  TURNSTILE_BYPASS: "false",
};

describe("assertSafeBoot", () => {
  it("accepts a complete production environment", () => {
    expect(() => assertSafeBoot(validProductionEnv)).not.toThrow();
  });

  it.each([
    "DB_HOST",
    "DB_NAME",
    "DB_USER",
    "DB_PASS",
    "JWT_SECRET",
    "TURNSTILE_SECRET_KEY",
  ] as const)("rejects missing or blank %s", (name) => {
    expect(() => assertSafeBoot({ ...validProductionEnv, [name]: undefined })).toThrow(name);
    expect(() => assertSafeBoot({ ...validProductionEnv, [name]: "   " })).toThrow(name);
  });

  it.each(["1", "3306", "65535"])("accepts DB_PORT=%s", (port) => {
    expect(() => assertSafeBoot({ ...validProductionEnv, DB_PORT: port })).not.toThrow();
  });

  it.each([undefined, "", "0", "65536", "3306.5", " 3306", "text"])(
    "rejects DB_PORT=%s",
    (port) => {
      expect(() => assertSafeBoot({ ...validProductionEnv, DB_PORT: port })).toThrow("DB_PORT");
    },
  );

  it("allows PORT to be omitted and validates it when provided", () => {
    expect(() => assertSafeBoot(validProductionEnv)).not.toThrow();
    expect(() => assertSafeBoot({ ...validProductionEnv, PORT: "1" })).not.toThrow();
    expect(() => assertSafeBoot({ ...validProductionEnv, PORT: "65535" })).not.toThrow();
    expect(() => assertSafeBoot({ ...validProductionEnv, PORT: "0" })).toThrow("PORT");
    expect(() => assertSafeBoot({ ...validProductionEnv, PORT: "65536" })).toThrow("PORT");
    expect(() => assertSafeBoot({ ...validProductionEnv, PORT: "3000.5" })).toThrow("PORT");
  });

  it.each([undefined, "", "true", "TRUE", "0", "1"])(
    "rejects TURNSTILE_BYPASS=%s in production",
    (value) => {
      expect(() => assertSafeBoot({ ...validProductionEnv, TURNSTILE_BYPASS: value })).toThrow(
        "TURNSTILE_BYPASS",
      );
    },
  );

  it("lists invalid names without exposing their values", () => {
    expect(() =>
      assertSafeBoot({
        ...validProductionEnv,
        DB_PASS: "",
        JWT_SECRET: "",
        TURNSTILE_SECRET_KEY: "",
      }),
    ).toThrow(
      "Invalid production environment variables: DB_PASS, JWT_SECRET, TURNSTILE_SECRET_KEY",
    );
  });

  it("does not validate development, test, or unspecified environments", () => {
    expect(() =>
      assertSafeBoot({ NODE_ENV: "development", TURNSTILE_BYPASS: "true" }),
    ).not.toThrow();
    expect(() => assertSafeBoot({ NODE_ENV: "test", TURNSTILE_BYPASS: "true" })).not.toThrow();
    expect(() => assertSafeBoot({ TURNSTILE_BYPASS: "true" })).not.toThrow();
  });
});
