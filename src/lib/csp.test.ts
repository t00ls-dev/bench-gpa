import { describe, it, expect } from "vitest";
import { setCspNonce, getCspNonce } from "./csp";

describe("csp", () => {
  it("returns undefined initially", () => {
    expect(getCspNonce()).toBeUndefined();
  });

  it("returns the set nonce", () => {
    setCspNonce("abc123");
    expect(getCspNonce()).toBe("abc123");
  });

  it("updates when set again", () => {
    setCspNonce("def456");
    expect(getCspNonce()).toBe("def456");
  });

  it("accepts undefined", () => {
    setCspNonce(undefined);
    expect(getCspNonce()).toBeUndefined();
  });
});
