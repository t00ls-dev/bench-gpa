import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { getCspNonce } from "./csp";
import { runWithCspNonce } from "./csp-server";

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

  // Regression from a real bug (08/04/2026): a plain module-level variable
  // let a concurrent request overwrite another's nonce before it finished
  // rendering. Simulates two interleaved "requests" (the second starts in
  // the middle of the first) and confirms each one only sees its own nonce.
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

  // Real regression (08/04/2026, a few hours in production): csp.ts is
  // imported by router.tsx, which also runs in the client bundle.
  // `node:async_hooks` doesn't exist in the browser -- a static import of
  // it here, even if never called, already broke hydration for the entire
  // application as soon as the client bundle loaded (Vite externalizes the
  // import, and accessing the stub's exported name throws immediately).
  // This test runs on Node (where node:async_hooks exists and the import
  // wouldn't fail), so it doesn't reproduce the browser error -- it only
  // guarantees, via static inspection of the source file, that no one
  // reintroduces a Node module import here. The real implementation lives
  // in csp-server.ts, imported only by src/server.ts (never by code shared
  // with the client).
  it("csp.ts não importa nenhum módulo do Node (mantém o arquivo seguro pro bundle do client)", () => {
    const source = readFileSync(new URL("./csp.ts", import.meta.url), "utf-8");
    const importLines = source.split("\n").filter((line) => line.trimStart().startsWith("import "));
    for (const line of importLines) {
      expect(line).not.toMatch(/from\s+["']node:/);
    }
  });
});
