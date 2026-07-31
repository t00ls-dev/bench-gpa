// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useHotkey, useGotoHotkey } from "./use-hotkey";

function setup() {
  const handler = vi.fn();
  return { handler };
}

function keydown(key: string, target?: HTMLElement) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true });
  if (target) {
    vi.spyOn(event, "target", "get").mockReturnValue(target);
  }
  document.dispatchEvent(event);
  return event;
}

describe("useHotkey", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls handler when matching key is pressed", () => {
    const { handler } = setup();
    renderHook(() => useHotkey("Escape", handler));
    keydown("Escape");
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("does not call handler for non-matching key", () => {
    const { handler } = setup();
    renderHook(() => useHotkey("Escape", handler));
    keydown("Enter");
    expect(handler).not.toHaveBeenCalled();
  });

  it("does not call handler when disabled", () => {
    const { handler } = setup();
    renderHook(() => useHotkey("Escape", handler, false));
    keydown("Escape");
    expect(handler).not.toHaveBeenCalled();
  });

  it("does not call handler when target is an input", () => {
    const { handler } = setup();
    renderHook(() => useHotkey("Escape", handler));
    const input = document.createElement("input");
    keydown("Escape", input);
    expect(handler).not.toHaveBeenCalled();
  });

  it("does not call handler when target is a textarea", () => {
    const { handler } = setup();
    renderHook(() => useHotkey("Escape", handler));
    const textarea = document.createElement("textarea");
    keydown("Escape", textarea);
    expect(handler).not.toHaveBeenCalled();
  });

  it("calls handler when enabled toggles back on", () => {
    const { handler } = setup();
    const { rerender } = renderHook(({ enabled }) => useHotkey("Escape", handler, enabled), {
      initialProps: { enabled: false },
    });
    keydown("Escape");
    expect(handler).not.toHaveBeenCalled();

    rerender({ enabled: true });
    keydown("Escape");
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe("useGotoHotkey", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls handler after g + letter sequence", () => {
    const { handler } = setup();
    renderHook(() => useGotoHotkey("d", handler));
    keydown("g");
    keydown("d");
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("does not call handler for wrong second key", () => {
    const { handler } = setup();
    renderHook(() => useGotoHotkey("d", handler));
    keydown("g");
    keydown("x");
    expect(handler).not.toHaveBeenCalled();
  });

  it("does not call handler without g prefix", () => {
    const { handler } = setup();
    renderHook(() => useGotoHotkey("d", handler));
    keydown("d");
    expect(handler).not.toHaveBeenCalled();
  });

  it("resets pending state after 500ms", () => {
    const { handler } = setup();
    renderHook(() => useGotoHotkey("d", handler));
    keydown("g");
    vi.advanceTimersByTime(600);
    keydown("d");
    expect(handler).not.toHaveBeenCalled();
  });

  it("does not call handler when disabled", () => {
    const { handler } = setup();
    renderHook(() => useGotoHotkey("d", handler, false));
    keydown("g");
    keydown("d");
    expect(handler).not.toHaveBeenCalled();
  });

  it("does not call handler when target is an input", () => {
    const { handler } = setup();
    renderHook(() => useGotoHotkey("d", handler));
    const input = document.createElement("input");
    keydown("g", input);
    keydown("d", input);
    expect(handler).not.toHaveBeenCalled();
  });
});
