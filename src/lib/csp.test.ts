import { describe, it, expect } from "vitest";
import { runWithCspNonce, getCspNonce } from "./csp";

describe("csp", () => {
  it("não tem nonce fora de qualquer runWithCspNonce", () => {
    expect(getCspNonce()).toBeUndefined();
  });

  it("devolve o nonce durante a execução do callback", () => {
    runWithCspNonce("abc123", () => {
      expect(getCspNonce()).toBe("abc123");
    });
  });

  it("volta a undefined depois que o callback termina", () => {
    runWithCspNonce("abc123", () => {});
    expect(getCspNonce()).toBeUndefined();
  });

  it("propaga através de await dentro do callback", async () => {
    await runWithCspNonce("async-nonce", async () => {
      await Promise.resolve();
      expect(getCspNonce()).toBe("async-nonce");
    });
  });

  // Regressão do bug real (04/08/2026): variável de módulo comum deixava uma
  // requisição concorrente sobrescrever o nonce da outra antes dela terminar
  // de renderizar. Simula duas "requisições" entrelaçadas (a segunda começa
  // no meio da primeira) e confirma que cada uma só enxerga o próprio nonce.
  it("duas execuções concorrentes não vazam o nonce uma pra outra", async () => {
    const seenByFirst: (string | undefined)[] = [];
    const seenBySecond: (string | undefined)[] = [];

    const first = runWithCspNonce("nonce-1", async () => {
      seenByFirst.push(getCspNonce());
      await new Promise((r) => setTimeout(r, 10));
      seenByFirst.push(getCspNonce());
    });

    await new Promise((r) => setTimeout(r, 2));

    const second = runWithCspNonce("nonce-2", async () => {
      seenBySecond.push(getCspNonce());
      await new Promise((r) => setTimeout(r, 5));
      seenBySecond.push(getCspNonce());
    });

    await Promise.all([first, second]);

    expect(seenByFirst).toEqual(["nonce-1", "nonce-1"]);
    expect(seenBySecond).toEqual(["nonce-2", "nonce-2"]);
  });
});
