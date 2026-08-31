// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.resetModules();
  document.head.querySelectorAll('script[src*="turnstile"]').forEach((script) => script.remove());
  delete (window as unknown as { turnstile?: unknown }).turnstile;
});

describe("useTurnstile", () => {
  it("always renders the widget in the light theme", async () => {
    vi.useFakeTimers();
    vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "test-site-key");
    vi.stubEnv("VITE_TURNSTILE_BYPASS", "false");

    const renderWidget = vi.fn(() => "widget-1");
    const removeWidget = vi.fn();
    (window as unknown as { turnstile: unknown }).turnstile = {
      render: renderWidget,
      remove: removeWidget,
      reset: vi.fn(),
    };

    const { useTurnstile } = await import("./use-turnstile");
    function Harness() {
      const { ref } = useTurnstile();
      return <div ref={ref} />;
    }

    const view = render(<Harness />);
    await act(() => vi.advanceTimersByTimeAsync(100));

    expect(renderWidget).toHaveBeenCalledWith(
      expect.any(HTMLDivElement),
      expect.objectContaining({ sitekey: "test-site-key", theme: "light" }),
    );

    view.unmount();
    expect(removeWidget).toHaveBeenCalledWith("widget-1");
  });
});
