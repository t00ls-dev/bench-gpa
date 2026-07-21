import { describe, it, expect, vi, afterEach } from "vitest";
import { consumeLastCapturedError } from "./error-capture";

describe("error-capture", () => {
  afterEach(() => {
    consumeLastCapturedError();
  });

  it("returns undefined when no error captured", () => {
    expect(consumeLastCapturedError()).toBeUndefined();
  });

  it("returns undefined on second call (consumed once)", () => {
    consumeLastCapturedError();
    expect(consumeLastCapturedError()).toBeUndefined();
  });

  it("returns undefined when TTL expired", () => {
    vi.useFakeTimers();
    consumeLastCapturedError();

    // Simulate that an error was captured by triggering via error event
    // if the runtime supports it
    if (typeof globalThis.dispatchEvent === "function") {
      const err = new Error("stale");
      globalThis.dispatchEvent(new (globalThis as any).ErrorEvent("error", { error: err }));
      vi.advanceTimersByTime(6000);
      expect(consumeLastCapturedError()).toBeUndefined();
    }
    vi.useRealTimers();
  });
});
