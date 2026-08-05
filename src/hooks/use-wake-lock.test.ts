// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useWakeLock } from "./use-wake-lock";

function mockWakeLockSupport() {
  // A real EventTarget, not a plain object: the hook listens for the
  // sentinel's own "release" event (fired both by a manual release() and
  // by the browser releasing it on its own when the tab is hidden) to know
  // when to reacquire the lock. A mock without real
  // addEventListener/dispatchEvent wouldn't exercise this path.
  class FakeSentinel extends EventTarget {
    release = vi.fn(async () => {
      this.dispatchEvent(new Event("release"));
    });
  }
  const sentinel = new FakeSentinel();
  const request = vi.fn().mockResolvedValue(sentinel);
  Object.defineProperty(navigator, "wakeLock", {
    configurable: true,
    value: { request },
  });
  return { request, release: sentinel.release, sentinel };
}

describe("useWakeLock", () => {
  const originalWakeLock = (navigator as unknown as { wakeLock?: unknown }).wakeLock;

  afterEach(() => {
    if (originalWakeLock === undefined) {
      delete (navigator as unknown as { wakeLock?: unknown }).wakeLock;
    } else {
      Object.defineProperty(navigator, "wakeLock", {
        configurable: true,
        value: originalWakeLock,
      });
    }
    vi.restoreAllMocks();
  });

  it("pede o wake lock quando active é true", async () => {
    const { request } = mockWakeLockSupport();
    renderHook(() => useWakeLock(true));
    await waitFor(() => expect(request).toHaveBeenCalledWith("screen"));
  });

  it("não pede nada quando active é false", async () => {
    const { request } = mockWakeLockSupport();
    renderHook(() => useWakeLock(false));
    await Promise.resolve();
    expect(request).not.toHaveBeenCalled();
  });

  it("libera o lock quando active volta a false", async () => {
    const { request, release } = mockWakeLockSupport();
    const { rerender } = renderHook(({ active }) => useWakeLock(active), {
      initialProps: { active: true },
    });
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));

    rerender({ active: false });
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("libera o lock ao desmontar", async () => {
    const { request, release } = mockWakeLockSupport();
    const { unmount } = renderHook(() => useWakeLock(true));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));

    unmount();
    expect(release).toHaveBeenCalledTimes(1);
  });

  // Unsupported browser (old Safari, Firefox without the API, insecure
  // context): degrades gracefully, throwing no error that would interrupt
  // the import.
  it("não lança erro em navegador sem suporte à Wake Lock API", async () => {
    delete (navigator as unknown as { wakeLock?: unknown }).wakeLock;
    expect(() => renderHook(() => useWakeLock(true))).not.toThrow();
    await Promise.resolve();
  });

  it("reobtém o lock quando a aba volta a ficar visível depois do navegador liberar sozinho", async () => {
    const { request, sentinel } = mockWakeLockSupport();
    renderHook(() => useWakeLock(true));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));

    // Simulates the browser releasing the lock on its own when the tab is
    // hidden (we never call sentinel.release() ourselves here) -- fires
    // the real "release" event the hook listens for to know it lost the lock.
    sentinel.dispatchEvent(new Event("release"));

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));

    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  });
});
