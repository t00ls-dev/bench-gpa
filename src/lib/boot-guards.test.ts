import { describe, expect, it } from "vitest";
import { assertSafeBoot } from "./boot-guards";

describe("assertSafeBoot", () => {
  it("lança quando TURNSTILE_BYPASS=true em produção", () => {
    expect(() => assertSafeBoot({ NODE_ENV: "production", TURNSTILE_BYPASS: "true" })).toThrow(
      "TURNSTILE_BYPASS=true em produção",
    );
  });

  it("não lança em produção com o bypass desligado", () => {
    expect(() =>
      assertSafeBoot({ NODE_ENV: "production", TURNSTILE_BYPASS: "false" }),
    ).not.toThrow();
  });

  it("não lança em produção quando a variável nem está definida", () => {
    expect(() => assertSafeBoot({ NODE_ENV: "production" })).not.toThrow();
  });

  it("não lança fora de produção mesmo com o bypass ligado (dev/test precisam dele)", () => {
    expect(() =>
      assertSafeBoot({ NODE_ENV: "development", TURNSTILE_BYPASS: "true" }),
    ).not.toThrow();
    expect(() => assertSafeBoot({ NODE_ENV: "test", TURNSTILE_BYPASS: "true" })).not.toThrow();
    expect(() => assertSafeBoot({ TURNSTILE_BYPASS: "true" })).not.toThrow();
  });

  it("não lança quando o valor não é exatamente a string 'true'", () => {
    expect(() =>
      assertSafeBoot({ NODE_ENV: "production", TURNSTILE_BYPASS: "TRUE" }),
    ).not.toThrow();
    expect(() => assertSafeBoot({ NODE_ENV: "production", TURNSTILE_BYPASS: "1" })).not.toThrow();
  });
});
