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

  // Regressão real (04/08/2026, poucas horas em produção): csp.ts é
  // importado por router.tsx, que roda no bundle do client também.
  // `node:async_hooks` não existe no navegador — um import estático dele
  // aqui, mesmo sem nunca ser chamado, já quebrava a hidratação da aplicação
  // inteira assim que o bundle do client carregava (Vite externaliza o
  // import, acessar o nome exportado do stub já lança). Este teste roda em
  // Node (onde node:async_hooks existe e o import não falharia), então não
  // reproduz o erro do navegador — só garante, por inspeção estática do
  // arquivo fonte, que ninguém reintroduza um import de módulo do Node aqui.
  // A implementação real fica em csp-server.ts, importado só por
  // src/server.ts (nunca por código compartilhado com o client).
  it("csp.ts não importa nenhum módulo do Node (mantém o arquivo seguro pro bundle do client)", () => {
    const source = readFileSync(new URL("./csp.ts", import.meta.url), "utf-8");
    const importLines = source.split("\n").filter((line) => line.trimStart().startsWith("import "));
    for (const line of importLines) {
      expect(line).not.toMatch(/from\s+["']node:/);
    }
  });
});
