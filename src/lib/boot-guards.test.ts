import { describe, expect, it } from "vitest";
import { assertSafeBoot } from "./boot-guards";

describe("assertSafeBoot", () => {
  it("throws when TURNSTILE_BYPASS=true in production", () => {
    expect(() => assertSafeBoot({ NODE_ENV: "production", TURNSTILE_BYPASS: "true" })).toThrow(
      "TURNSTILE_BYPASS=true em produção",
    );
  });

  it("does not throw in production with the bypass off", () => {
    expect(() =>
      assertSafeBoot({ NODE_ENV: "production", TURNSTILE_BYPASS: "false" }),
    ).not.toThrow();
  });

  it("does not throw in production when the variable isn't even defined", () => {
    expect(() => assertSafeBoot({ NODE_ENV: "production" })).not.toThrow();
  });

  it("does not throw outside production even with the bypass on (dev/test need it)", () => {
    expect(() =>
      assertSafeBoot({ NODE_ENV: "development", TURNSTILE_BYPASS: "true" }),
    ).not.toThrow();
    expect(() => assertSafeBoot({ NODE_ENV: "test", TURNSTILE_BYPASS: "true" })).not.toThrow();
    expect(() => assertSafeBoot({ TURNSTILE_BYPASS: "true" })).not.toThrow();
  });

  it("does not throw when the value isn't exactly the string 'true'", () => {
    expect(() =>
      assertSafeBoot({ NODE_ENV: "production", TURNSTILE_BYPASS: "TRUE" }),
    ).not.toThrow();
    expect(() => assertSafeBoot({ NODE_ENV: "production", TURNSTILE_BYPASS: "1" })).not.toThrow();
  });
});
