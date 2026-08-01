import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Cada teste precisa de um Map interno fresco: vi.resetModules() +
// import dinâmico evita um token vazar de um teste pro outro.
async function freshStore() {
  vi.resetModules();
  const mod = await import("./pdf-download-store");
  return mod;
}

const BYTES = new Uint8Array([1, 2, 3, 4]);

describe("pdf-download-store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("devolve os mesmos bytes/filename que foram guardados, pro mesmo usuário", async () => {
    const { storePdf, takePdf } = await freshStore();
    const token = storePdf("user-1", BYTES, "relatorio.pdf");
    const entry = takePdf(token, "user-1");
    expect(entry?.bytes).toEqual(BYTES);
    expect(entry?.filename).toBe("relatorio.pdf");
  });

  // Regressão de um bug real (01/08/2026): o token já foi uso único, e o
  // Firefox faz mais de uma requisição pra URL de download antes de salvar:
  // a segunda leitura vinha vazia (404 "Not found" salvo como se fosse o
  // PDF). TTL curto + isolamento por usuário já bastam como proteção; não
  // precisa também matar o token na primeira leitura.
  it("permite ler o mesmo token mais de uma vez dentro do TTL", async () => {
    const { storePdf, takePdf } = await freshStore();
    const token = storePdf("user-1", BYTES, "relatorio.pdf");
    expect(takePdf(token, "user-1")).toBeDefined();
    expect(takePdf(token, "user-1")).toBeDefined();
    expect(takePdf(token, "user-1")).toBeDefined();
  });

  it("token inexistente devolve undefined", async () => {
    const { takePdf } = await freshStore();
    expect(takePdf("token-que-nunca-existiu", "user-1")).toBeUndefined();
  });

  // Isolamento por usuário: mesmo token, usuário errado, não é só teoria,
  // é a única coisa que impede alguém de adivinhar o token de outro export.
  it("não devolve nada pra um userId diferente do que gerou o token", async () => {
    const { storePdf, takePdf } = await freshStore();
    const token = storePdf("user-1", BYTES, "relatorio.pdf");
    expect(takePdf(token, "user-2")).toBeUndefined();
  });

  it("uma tentativa com userId errado não invalida o token pro usuário certo depois", async () => {
    const { storePdf, takePdf } = await freshStore();
    const token = storePdf("user-1", BYTES, "relatorio.pdf");
    expect(takePdf(token, "user-2")).toBeUndefined(); // errado
    expect(takePdf(token, "user-1")).toBeDefined(); // certo, continua valendo
  });

  it("expira depois do TTL, token válido mas velho não devolve nada", async () => {
    const { storePdf, takePdf } = await freshStore();
    const token = storePdf("user-1", BYTES, "relatorio.pdf");
    vi.advanceTimersByTime(61_000);
    expect(takePdf(token, "user-1")).toBeUndefined();
  });

  it("dentro do TTL continua válido", async () => {
    const { storePdf, takePdf } = await freshStore();
    const token = storePdf("user-1", BYTES, "relatorio.pdf");
    vi.advanceTimersByTime(59_000);
    expect(takePdf(token, "user-1")).toBeDefined();
  });

  it("tokens de chamadas diferentes não colidem, mesmo pro mesmo usuário", async () => {
    const { storePdf, takePdf } = await freshStore();
    const t1 = storePdf("user-1", new Uint8Array([1]), "a.pdf");
    const t2 = storePdf("user-1", new Uint8Array([2]), "b.pdf");
    expect(t1).not.toBe(t2);
    expect(takePdf(t1, "user-1")?.filename).toBe("a.pdf");
    expect(takePdf(t2, "user-1")?.filename).toBe("b.pdf");
  });
});
