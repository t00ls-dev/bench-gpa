import { beforeEach, describe, expect, it, vi } from "vitest";

type Middleware = (options: {
  next: (context?: unknown) => unknown;
  context: unknown;
  data: unknown;
}) => unknown;
type Validator = (data: unknown) => unknown;
type Handler = (options: { data: unknown; context: Record<string, unknown> }) => unknown;

const mocks = vi.hoisted(() => {
  const connection = {
    beginTransaction: vi.fn(),
    query: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
  };
  return {
    connection,
    poolQuery: vi.fn(),
    getConnection: vi.fn(async () => connection),
    assertAdmin: vi.fn(),
    recordAudit: vi.fn(),
  };
});

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain: {
      middlewares: Middleware[];
      validate?: Validator;
      middleware: (middlewares: Middleware[]) => typeof chain;
      validator: (validator: Validator) => typeof chain;
      handler: (handler: Handler) => (input?: unknown) => Promise<unknown>;
    } = {
      middlewares: [],
      middleware(middlewares) {
        chain.middlewares = middlewares;
        return chain;
      },
      validator(validator) {
        chain.validate = validator;
        return chain;
      },
      handler(handler) {
        return async (input?: unknown) => {
          let context: Record<string, unknown> = {};
          for (const middleware of chain.middlewares) {
            const result = (await middleware({
              next: (nextContext?: unknown) => nextContext,
              context,
              data: input,
            })) as { context?: Record<string, unknown> } | undefined;
            if (result?.context) context = result.context;
          }
          return handler({ data: chain.validate ? chain.validate(input) : input, context });
        };
      },
    };
    return chain;
  },
}));

vi.mock("./auth-middleware", () => ({
  requireAuth: vi.fn(
    ({ next, context }: { next: (context: unknown) => unknown; context: unknown }) =>
      next({
        context: {
          ...(context as object),
          userId: "owner-1",
          userRole: "user",
          userUsername: "owner",
        },
      }),
  ),
}));

vi.mock("./rate-limit.middleware", () => ({
  requireRateLimit: vi.fn(
    () =>
      ({ next }: { next: (context?: unknown) => unknown }) =>
        next(),
  ),
}));

vi.mock("./db", () => ({
  default: {
    query: mocks.poolQuery,
    getConnection: mocks.getConnection,
  },
}));

vi.mock("./admin-utils", () => ({
  assertAdmin: mocks.assertAdmin,
}));

vi.mock("./audit", () => ({
  recordAudit: mocks.recordAudit,
}));

import {
  createSavedAreaAnalysis,
  deleteSavedAreaAnalysis,
  getSavedAreaAnalysis,
  listRecentSavedAreaAnalyses,
  listSavedAreaAnalyses,
  type SavedAreaAnalysis,
  updateSavedAreaAnalysis,
  transferSavedAreaAnalysis,
} from "./saved-area-analyses.functions";

const id = "550e8400-e29b-41d4-a716-446655440000";
const timestamps = {
  created_at: new Date("2026-08-26T12:00:00.000Z"),
  updated_at: new Date("2026-08-26T13:00:00.000Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.poolQuery.mockResolvedValue([[]]);
  mocks.connection.beginTransaction.mockResolvedValue(undefined);
  mocks.connection.query.mockResolvedValue([[]]);
  mocks.connection.commit.mockResolvedValue(undefined);
  mocks.connection.rollback.mockResolvedValue(undefined);
  mocks.assertAdmin.mockResolvedValue(undefined);
  mocks.recordAudit.mockResolvedValue(undefined);
});

describe("listSavedAreaAnalyses", () => {
  it("lists only the authenticated owner's analyses", async () => {
    mocks.poolQuery.mockResolvedValueOnce([
      [
        {
          id,
          owner_user_id: "owner-1",
          name: "Ponta de gôndola",
          store_code: "1516",
          store_name: "Loja 1516",
          product_count: 2,
          ...timestamps,
        },
      ],
    ]);

    const result = await (listSavedAreaAnalyses as () => Promise<unknown>)();

    expect(result).toEqual([
      {
        id,
        ownerUserId: "owner-1",
        name: "Ponta de gôndola",
        storeCode: "1516",
        storeName: "Loja 1516",
        productCount: 2,
        createdAt: "2026-08-26T12:00:00.000Z",
        updatedAt: "2026-08-26T13:00:00.000Z",
      },
    ]);
    expect(mocks.poolQuery).toHaveBeenCalledWith(expect.stringContaining("a.owner_user_id = ?"), [
      "owner-1",
    ]);
  });
});

describe("getSavedAreaAnalysis", () => {
  it("loads the metadata and persisted product composition", async () => {
    mocks.poolQuery.mockResolvedValueOnce([
      [
        {
          id,
          owner_user_id: "owner-2",
          owner_name: "Responsável",
          owner_username: "responsavel",
          name: "Ponta de gôndola",
          description: "Exposição próxima à entrada",
          store_code: "1516",
          store_name: "Loja 1516",
          prod_code: "100",
          ...timestamps,
        },
        {
          id,
          owner_user_id: "owner-2",
          owner_name: "Responsável",
          owner_username: "responsavel",
          name: "Ponta de gôndola",
          description: "Exposição próxima à entrada",
          store_code: "1516",
          store_name: "Loja 1516",
          prod_code: "200",
          ...timestamps,
        },
      ],
    ]);
    mocks.poolQuery.mockResolvedValueOnce([
      [
        {
          prod_code: "100",
          depto: "PERECIVEIS",
          secao: "PADARIA",
          grupo: "PAES",
          subgrupo: "FRANCES",
        },
        {
          prod_code: "200",
          depto: "MERCEARIA",
          secao: "BEBIDAS",
          grupo: "REFRIGERANTES",
          subgrupo: "COLA",
        },
      ],
    ]);

    const result = await (
      getSavedAreaAnalysis as (input: { id: string }) => Promise<SavedAreaAnalysis>
    )({ id });

    expect(result.productCodes).toEqual(["100", "200"]);
    expect(result.productHierarchy).toEqual([
      {
        productCode: "100",
        depto: "PERECIVEIS",
        secao: "PADARIA",
        grupo: "PAES",
        subgrupo: "FRANCES",
      },
      {
        productCode: "200",
        depto: "MERCEARIA",
        secao: "BEBIDAS",
        grupo: "REFRIGERANTES",
        subgrupo: "COLA",
      },
    ]);
    expect(result).toMatchObject({
      ownerUserId: "owner-2",
      ownerName: "Responsável",
      ownerUsername: "responsavel",
      description: "Exposição próxima à entrada",
    });
    expect(mocks.poolQuery).toHaveBeenNthCalledWith(
      1,
      expect.not.stringContaining("product_universe"),
      [id],
    );
    expect(mocks.poolQuery).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("FROM product_universe"),
      ["1516", "100", "200"],
    );
    expect(mocks.poolQuery).toHaveBeenCalledTimes(2);
  });

  it("reports a missing analysis without disclosing metadata", async () => {
    mocks.poolQuery.mockResolvedValueOnce([[]]);

    await expect(
      (getSavedAreaAnalysis as (input: { id: string }) => Promise<unknown>)({ id }),
    ).rejects.toThrow("Análise salva não encontrada.");
    expect(mocks.poolQuery).toHaveBeenCalledTimes(1);
  });
});

describe("listRecentSavedAreaAnalyses", () => {
  it("returns current summaries in the requested recent order", async () => {
    const secondId = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
    mocks.poolQuery.mockResolvedValueOnce([
      [
        {
          id,
          owner_user_id: "owner-1",
          name: "Primeira",
          store_code: "1516",
          store_name: "Loja 1516",
          product_count: 2,
          ...timestamps,
        },
        {
          id: secondId,
          owner_user_id: "owner-2",
          name: "Segunda",
          store_code: "2000",
          store_name: "Loja 2000",
          product_count: 3,
          ...timestamps,
        },
      ],
    ]);

    const result = await (
      listRecentSavedAreaAnalyses as (input: {
        ids: string[];
      }) => Promise<{ id: string; ownerUserId: string }[]>
    )({ ids: [secondId, id] });

    expect(result.map((analysis) => analysis.id)).toEqual([secondId, id]);
    expect(result[0]?.ownerUserId).toBe("owner-2");
    expect(mocks.poolQuery).toHaveBeenCalledWith(expect.stringContaining("a.id IN (?, ?)"), [
      secondId,
      id,
    ]);
  });
});

describe("createSavedAreaAnalysis", () => {
  it("validates store membership and inserts both tables atomically", async () => {
    mocks.connection.query
      .mockResolvedValueOnce([[{ matched_count: 2 }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{ affectedRows: 2 }]);

    const result = await (
      createSavedAreaAnalysis as (input: {
        name: string;
        description?: string;
        storeCode: string;
        productCodes: string[];
      }) => Promise<{ ok: true; id: string }>
    )({
      name: "Área 1",
      description: "Exposição sazonal",
      storeCode: "1516",
      productCodes: ["100", "200"],
    });

    expect(result.ok).toBe(true);
    expect(result.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(mocks.connection.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("FROM product_universe"),
      ["1516", "100", "200"],
    );
    expect(mocks.connection.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("INSERT INTO saved_area_analyses"),
      [result.id, "owner-1", "Área 1", "Exposição sazonal", "1516"],
    );
    expect(mocks.connection.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("INSERT INTO saved_area_analysis_products"),
      [result.id, "100", result.id, "200"],
    );
    expect(mocks.connection.commit).toHaveBeenCalledOnce();
    expect(mocks.connection.rollback).not.toHaveBeenCalled();
    expect(mocks.connection.release).toHaveBeenCalledOnce();
  });

  it("rolls back when any product does not belong to the selected store", async () => {
    mocks.connection.query.mockResolvedValueOnce([[{ matched_count: 1 }]]);

    await expect(
      (
        createSavedAreaAnalysis as (input: {
          name: string;
          storeCode: string;
          productCodes: string[];
        }) => Promise<unknown>
      )({ name: "Área 1", storeCode: "1516", productCodes: ["100", "999"] }),
    ).rejects.toThrow("não pertencem à loja selecionada");
    expect(mocks.connection.query).toHaveBeenCalledTimes(1);
    expect(mocks.connection.rollback).toHaveBeenCalledOnce();
    expect(mocks.connection.commit).not.toHaveBeenCalled();
  });

  it("rolls back when inserting products fails after inserting the analysis", async () => {
    mocks.connection.query
      .mockResolvedValueOnce([[{ matched_count: 2 }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockRejectedValueOnce(new Error("insert products failed"));

    await expect(
      (
        createSavedAreaAnalysis as (input: {
          name: string;
          storeCode: string;
          productCodes: string[];
        }) => Promise<unknown>
      )({ name: "Área 1", storeCode: "1516", productCodes: ["100", "200"] }),
    ).rejects.toThrow("insert products failed");
    expect(mocks.connection.rollback).toHaveBeenCalledOnce();
    expect(mocks.connection.commit).not.toHaveBeenCalled();
  });
});

describe("updateSavedAreaAnalysis", () => {
  it("clears an optional description without changing the composition", async () => {
    mocks.connection.query
      .mockResolvedValueOnce([[{ store_code: "1516" }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    await (
      updateSavedAreaAnalysis as (input: {
        id: string;
        description: string | null;
      }) => Promise<unknown>
    )({ id, description: null });

    expect(mocks.connection.query).toHaveBeenNthCalledWith(
      2,
      "UPDATE saved_area_analyses SET description = ? WHERE id = ? AND owner_user_id = ?",
      [null, id, "owner-1"],
    );
    expect(mocks.connection.commit).toHaveBeenCalledOnce();
  });

  it("replaces the composition within the analysis store", async () => {
    mocks.connection.query
      .mockResolvedValueOnce([[{ store_code: "1516" }]])
      .mockResolvedValueOnce([[{ matched_count: 2 }]])
      .mockResolvedValueOnce([{ affectedRows: 2 }])
      .mockResolvedValueOnce([{ affectedRows: 2 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    await (
      updateSavedAreaAnalysis as (input: { id: string; productCodes: string[] }) => Promise<unknown>
    )({ id, productCodes: ["300", "400"] });

    expect(mocks.connection.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("owner_user_id = ?"),
      [id, "owner-1"],
    );
    expect(mocks.connection.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("FROM product_universe"),
      ["1516", "300", "400"],
    );
    expect(mocks.connection.query).toHaveBeenNthCalledWith(
      3,
      "DELETE FROM saved_area_analysis_products WHERE analysis_id = ?",
      [id],
    );
    expect(mocks.connection.commit).toHaveBeenCalledOnce();
  });

  it("rejects an update when the analysis belongs to another user", async () => {
    mocks.connection.query.mockResolvedValueOnce([[]]);

    await expect(
      (updateSavedAreaAnalysis as (input: { id: string; name: string }) => Promise<unknown>)({
        id,
        name: "Outro nome",
      }),
    ).rejects.toThrow("Análise salva não encontrada.");
    expect(mocks.connection.query).toHaveBeenCalledTimes(1);
    expect(mocks.connection.rollback).toHaveBeenCalledOnce();
  });

  it("rolls back when reinserting a replacement composition fails", async () => {
    mocks.connection.query
      .mockResolvedValueOnce([[{ store_code: "1516" }]])
      .mockResolvedValueOnce([[{ matched_count: 2 }]])
      .mockResolvedValueOnce([{ affectedRows: 2 }])
      .mockRejectedValueOnce(new Error("replace products failed"));

    await expect(
      (
        updateSavedAreaAnalysis as (input: {
          id: string;
          productCodes: string[];
        }) => Promise<unknown>
      )({ id, productCodes: ["300", "400"] }),
    ).rejects.toThrow("replace products failed");
    expect(mocks.connection.rollback).toHaveBeenCalledOnce();
    expect(mocks.connection.commit).not.toHaveBeenCalled();
  });
});

describe("deleteSavedAreaAnalysis", () => {
  it("hard-deletes products before their owned analysis", async () => {
    mocks.connection.query
      .mockResolvedValueOnce([[{ store_code: "1516" }]])
      .mockResolvedValueOnce([{ affectedRows: 2 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    await (deleteSavedAreaAnalysis as (input: { id: string }) => Promise<unknown>)({ id });

    expect(mocks.connection.query).toHaveBeenNthCalledWith(
      2,
      "DELETE FROM saved_area_analysis_products WHERE analysis_id = ?",
      [id],
    );
    expect(mocks.connection.query).toHaveBeenNthCalledWith(
      3,
      "DELETE FROM saved_area_analyses WHERE id = ? AND owner_user_id = ?",
      [id, "owner-1"],
    );
    expect(mocks.connection.commit).toHaveBeenCalledOnce();
  });

  it("does not delete anything when the analysis belongs to another user", async () => {
    mocks.connection.query.mockResolvedValueOnce([[]]);

    await expect(
      (deleteSavedAreaAnalysis as (input: { id: string }) => Promise<unknown>)({ id }),
    ).rejects.toThrow("Análise salva não encontrada.");
    expect(mocks.connection.query).toHaveBeenCalledTimes(1);
    expect(mocks.connection.rollback).toHaveBeenCalledOnce();
  });

  it("rolls back when deleting the parent fails after deleting its products", async () => {
    mocks.connection.query
      .mockResolvedValueOnce([[{ store_code: "1516" }]])
      .mockResolvedValueOnce([{ affectedRows: 2 }])
      .mockRejectedValueOnce(new Error("delete analysis failed"));

    await expect(
      (deleteSavedAreaAnalysis as (input: { id: string }) => Promise<unknown>)({ id }),
    ).rejects.toThrow("delete analysis failed");
    expect(mocks.connection.rollback).toHaveBeenCalledOnce();
    expect(mocks.connection.commit).not.toHaveBeenCalled();
  });
});

describe("transferSavedAreaAnalysis", () => {
  const targetUserId = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

  it("transfers only ownership and records the administrative action", async () => {
    mocks.connection.query
      .mockResolvedValueOnce([[{ owner_user_id: "owner-1", owner_username: "owner" }]])
      .mockResolvedValueOnce([[{ id: targetUserId, username: "recipient" }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    await (
      transferSavedAreaAnalysis as (input: {
        analysisId: string;
        targetUserId: string;
      }) => Promise<unknown>
    )({ analysisId: id, targetUserId });

    expect(mocks.assertAdmin).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "owner-1", userUsername: "owner" }),
    );
    expect(mocks.connection.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("SET owner_user_id = ?"),
      [targetUserId, id, "owner-1"],
    );
    expect(mocks.connection.commit).toHaveBeenCalledOnce();
    expect(mocks.recordAudit).toHaveBeenCalledWith({
      action: "saved_area.transfer",
      actorId: "owner-1",
      actorUsername: "owner",
      targetType: "saved_area_analysis",
      targetId: id,
      detail: "proprietário anterior: owner; novo proprietário: recipient",
    });
  });

  it("rejects an inactive, pending or missing recipient", async () => {
    mocks.connection.query
      .mockResolvedValueOnce([[{ owner_user_id: "owner-1", owner_username: "owner" }]])
      .mockResolvedValueOnce([[]]);

    await expect(
      (
        transferSavedAreaAnalysis as (input: {
          analysisId: string;
          targetUserId: string;
        }) => Promise<unknown>
      )({ analysisId: id, targetUserId }),
    ).rejects.toThrow("usuário ativo que já tenha concluído o primeiro acesso");
    expect(mocks.connection.rollback).toHaveBeenCalledOnce();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it("rejects the current owner as recipient", async () => {
    mocks.connection.query.mockResolvedValueOnce([
      [{ owner_user_id: targetUserId, owner_username: "recipient" }],
    ]);

    await expect(
      (
        transferSavedAreaAnalysis as (input: {
          analysisId: string;
          targetUserId: string;
        }) => Promise<unknown>
      )({ analysisId: id, targetUserId }),
    ).rejects.toThrow("já é o proprietário");
    expect(mocks.connection.query).toHaveBeenCalledOnce();
    expect(mocks.connection.rollback).toHaveBeenCalledOnce();
  });

  it("stops before opening a transaction when admin authorization fails", async () => {
    mocks.assertAdmin.mockRejectedValueOnce(new Error("Acesso negado"));

    await expect(
      (
        transferSavedAreaAnalysis as (input: {
          analysisId: string;
          targetUserId: string;
        }) => Promise<unknown>
      )({ analysisId: id, targetUserId }),
    ).rejects.toThrow("Acesso negado");
    expect(mocks.getConnection).not.toHaveBeenCalled();
  });

  it("rolls back if ownership changes concurrently", async () => {
    mocks.connection.query
      .mockResolvedValueOnce([[{ owner_user_id: "owner-1", owner_username: "owner" }]])
      .mockResolvedValueOnce([[{ id: targetUserId, username: "recipient" }]])
      .mockResolvedValueOnce([{ affectedRows: 0 }]);

    await expect(
      (
        transferSavedAreaAnalysis as (input: {
          analysisId: string;
          targetUserId: string;
        }) => Promise<unknown>
      )({ analysisId: id, targetUserId }),
    ).rejects.toThrow("alterada por outra operação");
    expect(mocks.connection.rollback).toHaveBeenCalledOnce();
    expect(mocks.connection.commit).not.toHaveBeenCalled();
  });
});
