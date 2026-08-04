// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useWakeLock } from "./use-wake-lock";

function mockWakeLockSupport() {
  // EventTarget de verdade, não um objeto plano: o hook escuta o evento
  // "release" do próprio sentinel (dispara tanto por release() manual quanto
  // pelo navegador liberando sozinho ao esconder a aba) pra saber quando
  // reobter o lock. Um mock sem addEventListener/dispatchEvent de verdade
  // não exercitaria esse caminho.
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

  // Navegador sem suporte (Safari antigo, Firefox sem a API, contexto não
  // seguro): degrada bem, sem lançar erro nenhum que interrompesse o import.
  it("não lança erro em navegador sem suporte à Wake Lock API", async () => {
    delete (navigator as unknown as { wakeLock?: unknown }).wakeLock;
    expect(() => renderHook(() => useWakeLock(true))).not.toThrow();
    await Promise.resolve();
  });

  it("reobtém o lock quando a aba volta a ficar visível depois do navegador liberar sozinho", async () => {
    const { request, sentinel } = mockWakeLockSupport();
    renderHook(() => useWakeLock(true));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));

    // Simula o navegador liberando o lock sozinho ao esconder a aba (nunca
    // chamamos sentinel.release() nós mesmos aqui) — dispara o evento
    // "release" real que o hook escuta pra saber que perdeu o lock.
    sentinel.dispatchEvent(new Event("release"));

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));

    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  });
});
