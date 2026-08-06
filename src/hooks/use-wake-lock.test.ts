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

  it("requests the wake lock when active is true", async () => {
    const { request } = mockWakeLockSupport();
    renderHook(() => useWakeLock(true));
    await waitFor(() => expect(request).toHaveBeenCalledWith("screen"));
  });

  it("requests nothing when active is false", async () => {
    const { request } = mockWakeLockSupport();
    renderHook(() => useWakeLock(false));
    await Promise.resolve();
    expect(request).not.toHaveBeenCalled();
  });

  it("releases the lock when active goes back to false", async () => {
    const { request, release } = mockWakeLockSupport();
    const { rerender } = renderHook(({ active }) => useWakeLock(active), {
      initialProps: { active: true },
    });
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));

    rerender({ active: false });
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("releases the lock on unmount", async () => {
    const { request, release } = mockWakeLockSupport();
    const { unmount } = renderHook(() => useWakeLock(true));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));

    unmount();
    expect(release).toHaveBeenCalledTimes(1);
  });

  // Unsupported browser (old Safari, Firefox without the API, insecure
  // context): degrades gracefully, throwing no error that would interrupt
  // the import.
  it("throws no error in a browser without Wake Lock API support", async () => {
    delete (navigator as unknown as { wakeLock?: unknown }).wakeLock;
    expect(() => renderHook(() => useWakeLock(true))).not.toThrow();
    await Promise.resolve();
  });

  it("reacquires the lock when the tab becomes visible again after the browser released it on its own", async () => {
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
