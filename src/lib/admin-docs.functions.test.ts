import { describe, it, expect, vi, beforeEach } from "vitest";

type Middleware = (opts: {
  next: (ctx: unknown) => unknown;
  context: unknown;
  data: unknown;
}) => unknown;
type Handler = (opts: { data?: unknown; context: unknown }) => unknown;

vi.mock("@tanstack/react-start", () => {
  const buildChain = () => {
    const chain: {
      middlewares: Middleware[];
      middleware?: unknown;
      inputValidator?: unknown;
      handler?: unknown;
    } = { middlewares: [] };
    chain.middleware = (mw: Middleware[]) => {
      chain.middlewares = mw;
      return {
        inputValidator: () => ({
          handler: (fn: Handler) => async (input: unknown) => fn({ data: input, context: {} }),
        }),
        handler: (fn: Handler) => async (input: unknown) => fn({ data: input, context: {} }),
      };
    };
    chain.inputValidator = () => chain;
    chain.handler = (fn: Handler) => (input?: unknown) => fn({ data: input, context: {} });
    return chain;
  };
  return { createServerFn: buildChain };
});

vi.mock("./auth-middleware", () => ({
  requireAuth: vi.fn(({ next }: { next: (ctx: unknown) => unknown }) => next({})),
}));
vi.mock("./rate-limit.middleware", () => ({
  requireRateLimit: vi.fn(
    () =>
      ({ next }: { next: (ctx: unknown) => unknown }) =>
        next({}),
  ),
}));
vi.mock("./admin-utils", () => ({ assertAdmin: vi.fn() }));

import { listDocs, getDocContent } from "./admin-docs.functions";
import { assertAdmin } from "./admin-utils";

// import.meta.glob roda de verdade (é transform do Vite, não dá pra mockar
// como db.query) — os testes usam a pasta docs/ real do repo em vez de um
// fixture, com asserções estruturais (não conteúdo exato) pra não acoplar
// nos textos dos docs, que mudam.

interface DocEntry {
  slug: string;
  title: string;
  category: string;
  date: string;
  lastModified: number | null;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listDocs", () => {
  it("lista os docs reais, exclui improvements/README e ordena por título (pt-BR)", async () => {
    const result = await (listDocs as () => Promise<DocEntry[]>)();

    expect(assertAdmin).toHaveBeenCalled();
    expect(result.length).toBeGreaterThan(0);
    expect(result.some((d) => d.slug === "improvements/README")).toBe(false);

    for (const entry of result) {
      expect(entry.slug).toBeTruthy();
      expect(entry.title).toBeTruthy();
      expect(["Análise do Código", "Documentação Técnica"]).toContain(entry.category);
    }

    const titles = result.map((d) => d.title);
    const sorted = [...titles].sort((a, b) => a.localeCompare(b, "pt-BR"));
    expect(titles).toEqual(sorted);
  });

  it('categoriza slugs "improvements/*" como Análise do Código, o resto como Documentação Técnica', async () => {
    const result = await (listDocs as () => Promise<DocEntry[]>)();
    const improvementsDoc = result.find((d) => d.slug.startsWith("improvements/"));
    const topLevelDoc = result.find((d) => !d.slug.includes("/"));

    expect(improvementsDoc?.category).toBe("Análise do Código");
    expect(topLevelDoc?.category).toBe("Documentação Técnica");
  });

  it("extrai o título do primeiro cabeçalho `# ...` do markdown", async () => {
    const result = await (listDocs as () => Promise<DocEntry[]>)();
    const continuar = result.find((d) => d.slug === "continuar");
    expect(continuar?.title).toBe("Onde parar e por onde retomar");
  });
});

describe("getDocContent", () => {
  it("devolve o conteúdo cru e o lastModified de um doc que existe", async () => {
    const result = await (
      getDocContent as (d: { slug: string }) => Promise<{
        content: string;
        lastModified: number | null;
      }>
    )({ slug: "continuar" });

    expect(assertAdmin).toHaveBeenCalled();
    expect(result.content).toContain("# Onde parar e por onde retomar");
    expect(typeof result.lastModified === "number" || result.lastModified === null).toBe(true);
  });

  it("rejeita slug que não corresponde a nenhum doc", async () => {
    await expect(
      (getDocContent as (d: { slug: string }) => Promise<unknown>)({
        slug: "este-doc-nao-existe-xyz",
      }),
    ).rejects.toThrow("Documento não encontrado.");
  });
});
