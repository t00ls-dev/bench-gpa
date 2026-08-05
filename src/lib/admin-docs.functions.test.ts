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

// import.meta.glob actually runs (it's a Vite transform, can't be mocked
// like db.query), the tests use the repo's real docs/ folder instead of a
// fixture, with structural assertions (not exact content) to avoid
// coupling to the docs' text, which changes.

interface DocEntry {
  slug: string;
  title: string;
  date: string;
  lastModified: number | null;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listDocs", () => {
  it("lista os docs reais (lista única, sem categoria) ordenados por título (pt-BR)", async () => {
    const result = await (listDocs as () => Promise<DocEntry[]>)();

    expect(assertAdmin).toHaveBeenCalled();
    expect(result.length).toBeGreaterThan(0);

    for (const entry of result) {
      expect(entry.slug).toBeTruthy();
      expect(entry.title).toBeTruthy();
      expect(entry.slug.includes("/")).toBe(false);
    }

    const titles = result.map((d) => d.title);
    const sorted = [...titles].sort((a, b) => a.localeCompare(b, "pt-BR"));
    expect(titles).toEqual(sorted);
  });

  it("extrai o título do primeiro cabeçalho `# ...` do markdown", async () => {
    const result = await (listDocs as () => Promise<DocEntry[]>)();
    const continuar = result.find((d) => d.slug === "continuar");
    expect(continuar?.title).toBe("Estado do projeto e itens em aberto (30/07/2026, histórico)");
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
    expect(result.content).toContain(
      "# Estado do projeto e itens em aberto (30/07/2026, histórico)",
    );
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
