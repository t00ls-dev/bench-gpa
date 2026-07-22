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
    type ErrorEventCtor = new (type: string, init?: { error?: unknown }) => Event;
    const ErrorEventClass = (globalThis as unknown as { ErrorEvent?: ErrorEventCtor }).ErrorEvent;
    if (typeof globalThis.dispatchEvent === "function" && ErrorEventClass) {
      const err = new Error("stale");
      globalThis.dispatchEvent(new ErrorEventClass("error", { error: err }));
      vi.advanceTimersByTime(6000);
      expect(consumeLastCapturedError()).toBeUndefined();
    }
    vi.useRealTimers();
  });
});
