// Complementa admin-system.functions.test.ts, que mocka `assertAdmin` como
// no-op e só confirma que foi *chamado*. Aqui o guard é o de verdade — prova
// que um não-admin é de fato *bloqueado*, e que nenhuma consulta de negócio
// roda antes disso (ver docs/auditoria-qa-2026-08-01.md, item 3).
import { describe, it, expect, vi, beforeEach } from "vitest";

type Middleware = (opts: {
  next: (ctx: unknown) => unknown;
  context: unknown;
  data: unknown;
}) => unknown;
type Handler = (opts: { data?: unknown; context: unknown }) => unknown;

vi.mock("@tanstack/react-start", () => {
  const buildChain = () => {
    const chain: { middlewares: Middleware[] } = { middlewares: [] };
    const run = (fn: Handler) => async (input: unknown) => {
      let ctx: unknown = { userId: "user-nao-admin" };
      for (const m of chain.middlewares) {
        const r = (await m({ next: (c: unknown) => c, context: ctx, data: input })) as
          { context?: unknown } | undefined;
        if (r?.context) ctx = r.context;
      }
      return fn({ data: input, context: ctx });
    };
    return {
      middleware: (mw: Middleware[]) => {
        chain.middlewares = mw;
        return {
          inputValidator: () => ({ handler: (fn: Handler) => run(fn) }),
          handler: (fn: Handler) => run(fn),
        };
      },
    };
  };
  return { createServerFn: buildChain };
});

vi.mock("./auth-middleware", () => ({
  requireAuth: vi.fn(({ next, context }: { next: (ctx: unknown) => unknown; context: unknown }) =>
    next({ context }),
  ),
}));
vi.mock("./rate-limit.middleware", () => ({
  requireRateLimit: vi.fn(
    () =>
      ({ next, context }: { next: (ctx: unknown) => unknown; context: unknown }) =>
        next({ context }),
  ),
}));
// admin-utils NÃO é mockado — é exatamente o que esta suíte prova de verdade.
vi.mock("./db", () => ({ default: { query: vi.fn() } }));

import { diagnoseData } from "./admin-system.functions";
import db from "./db";

beforeEach(() => {
  vi.mocked(db.query).mockReset();
});

describe("diagnoseData — guard de admin real (assertAdmin não mockado)", () => {
  it("rejeita usuário não-admin sem executar nenhuma consulta de negócio", async () => {
    vi.mocked(db.query).mockResolvedValueOnce([[[{ has_role: 0 }]]] as never); // CALL has_role

    await expect((diagnoseData as () => Promise<unknown>)()).rejects.toThrow(
      "Apenas administradores",
    );
    // Só a checagem do próprio assertAdmin rodou — as 6 contagens de tabela e
    // a consulta de datas distintas nunca chegaram a ser disparadas.
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.query).toHaveBeenCalledWith("CALL has_role(?, ?)", ["user-nao-admin", "admin"]);
  });
});
