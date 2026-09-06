import { describe, it, expect } from "vitest";
import {
  FilterSchema,
  AreaAnalysisSchema,
  UsernameSchema,
  EmployeeIdSchema,
  AuthIdentifierSchema,
  AuthPasswordInputSchema,
  PasswordSchema,
  ProductionForecastSchema,
  BeginImportSchema,
  InsertSalesChunkSchema,
  FinalizeImportSchema,
  CancelImportSchema,
  SavedAreaAnalysisIdSchema,
  SavedAreaAnalysisIdsSchema,
  TransferSavedAreaAnalysisSchema,
  CreateSavedAreaAnalysisSchema,
  UpdateSavedAreaAnalysisSchema,
  AuditLogQuerySchema,
  ImportHistoryQuerySchema,
  ProductSearchSchema,
  UpdateAdminUserSchema,
} from "./schemas";
import { IMPORT_CHUNK_SIZE, IMPORT_MAX_ROWS, IMPORT_MAX_STORES } from "./import-config";

describe("FilterSchema", () => {
  it("parses valid input with defaults", () => {
    const result = FilterSchema.parse({ dateFrom: "2024-01-01", dateTo: "2024-01-31" });
    expect(result.dateFrom).toBe("2024-01-01");
    expect(result.dateTo).toBe("2024-01-31");
    expect(result.stores).toEqual([]);
    expect(result.deptos).toEqual([]);
    expect(result.secoes).toEqual([]);
    expect(result.grupos).toEqual([]);
    expect(result.subgrupos).toEqual([]);
  });

  it("accepts optional fields", () => {
    const result = FilterSchema.parse({
      dateFrom: "2024-01-01",
      dateTo: "2024-01-31",
      stores: ["LOJA1"],
      deptos: ["D1"],
    });
    expect(result.stores).toEqual(["LOJA1"]);
    expect(result.deptos).toEqual(["D1"]);
  });

  it("accepts null dates", () => {
    const result = FilterSchema.parse({ dateFrom: null, dateTo: null });
    expect(result.dateFrom).toBeNull();
    expect(result.dateTo).toBeNull();
  });
});

describe("AreaAnalysisSchema", () => {
  it("parses with defaults", () => {
    const result = AreaAnalysisSchema.parse({ dateFrom: "2024-01-01", dateTo: "2024-01-31" });
    expect(result.pageSize).toBe(25);
    expect(result.search).toBe("");
    expect(result.sortBy).toBe("val");
    expect(result.sortDir).toBe("desc");
  });

  it("rejects missing dateFrom", () => {
    expect(() => AreaAnalysisSchema.parse({ dateTo: "2024-01-31" })).toThrow();
  });
});

describe("AuditLogQuerySchema", () => {
  it("parses defaults and trims search text", () => {
    expect(AuditLogQuerySchema.parse({})).toEqual({
      search: "",
      sortBy: "created_at",
      sortDir: "desc",
      limit: 25,
      offset: 0,
    });
    expect(AuditLogQuerySchema.parse({ search: "  admin  " }).search).toBe("admin");
  });

  it("only accepts page sizes exposed by the table", () => {
    expect(AuditLogQuerySchema.safeParse({ limit: 250 }).success).toBe(true);
    expect(AuditLogQuerySchema.safeParse({ limit: 10 }).success).toBe(false);
    expect(AuditLogQuerySchema.safeParse({ limit: 251 }).success).toBe(false);
  });
});

describe("ImportHistoryQuerySchema", () => {
  it("parses the shared pagination defaults", () => {
    expect(ImportHistoryQuerySchema.parse({})).toEqual({
      search: "",
      sortBy: "sale_date",
      sortDir: "desc",
      limit: 25,
      offset: 0,
    });
  });

  it("validates sorting and page size", () => {
    expect(
      ImportHistoryQuerySchema.safeParse({ sortBy: "row_count", sortDir: "asc", limit: 100 })
        .success,
    ).toBe(true);
    expect(ImportHistoryQuerySchema.safeParse({ sortBy: "invalid" }).success).toBe(false);
    expect(ImportHistoryQuerySchema.safeParse({ limit: 10 }).success).toBe(false);
  });
});

describe("ProductSearchSchema", () => {
  it("trims the query and defaults to all stores", () => {
    expect(ProductSearchSchema.parse({ q: "  leite int  " })).toEqual({
      q: "leite int",
      storeCodes: [],
    });
  });

  it("accepts multiple stores and rejects excessive search terms", () => {
    expect(
      ProductSearchSchema.parse({ q: "leite integral", storeCodes: ["1516", "1520"] }),
    ).toEqual({ q: "leite integral", storeCodes: ["1516", "1520"] });
    expect(
      ProductSearchSchema.safeParse({ q: "a b c d e f g h i j k", storeCodes: [] }).success,
    ).toBe(false);
  });
});

describe("UpdateAdminUserSchema", () => {
  const base = {
    userId: "550e8400-e29b-41d4-a716-446655440000",
    name: "Ana Silva",
    role: "user",
    isActive: true,
  };

  it("accepts either identifier and normalizes blank fields", () => {
    expect(
      UpdateAdminUserSchema.parse({ ...base, username: " Ana.Silva ", employeeId: "" }),
    ).toEqual({ ...base, username: "ana.silva", employeeId: undefined });
    expect(
      UpdateAdminUserSchema.safeParse({ ...base, username: "", employeeId: "0012" }).success,
    ).toBe(true);
  });

  it("requires at least one login identifier", () => {
    expect(UpdateAdminUserSchema.safeParse({ ...base, username: "", employeeId: "" }).success).toBe(
      false,
    );
  });
});

describe("saved area analysis schemas", () => {
  const id = "550e8400-e29b-41d4-a716-446655440000";

  it("accepts one store and a specific product composition", () => {
    expect(
      CreateSavedAreaAnalysisSchema.parse({
        name: "  Ponta de gôndola  ",
        description: "  Exposição próxima à entrada  ",
        storeCode: " 1516 ",
        productCodes: ["100", "200"],
      }),
    ).toEqual({
      name: "Ponta de gôndola",
      description: "Exposição próxima à entrada",
      storeCode: "1516",
      productCodes: ["100", "200"],
    });
  });

  it("requires at least one unique product", () => {
    expect(
      CreateSavedAreaAnalysisSchema.safeParse({
        name: "Área",
        storeCode: "1516",
        productCodes: [],
      }).success,
    ).toBe(false);
    expect(
      CreateSavedAreaAnalysisSchema.safeParse({
        name: "Área",
        storeCode: "1516",
        productCodes: ["100", "100"],
      }).success,
    ).toBe(false);
  });

  it("accepts a partial update but rejects an empty update", () => {
    expect(UpdateSavedAreaAnalysisSchema.parse({ id, name: "Novo nome" })).toEqual({
      id,
      name: "Novo nome",
    });
    expect(UpdateSavedAreaAnalysisSchema.safeParse({ id }).success).toBe(false);
    expect(UpdateSavedAreaAnalysisSchema.parse({ id, description: null })).toEqual({
      id,
      description: null,
    });
  });

  it("limits the optional description to 1000 characters", () => {
    expect(
      CreateSavedAreaAnalysisSchema.safeParse({
        name: "Área",
        description: "a".repeat(1001),
        storeCode: "1516",
        productCodes: ["100"],
      }).success,
    ).toBe(false);
  });

  it("requires UUID analysis identifiers", () => {
    expect(SavedAreaAnalysisIdSchema.parse({ id })).toEqual({ id });
    expect(SavedAreaAnalysisIdSchema.safeParse({ id: "predictable-id" }).success).toBe(false);
  });

  it("limits recent analysis lookups and validates transfers", () => {
    const targetUserId = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
    expect(SavedAreaAnalysisIdsSchema.parse({ ids: [id] })).toEqual({ ids: [id] });
    expect(
      SavedAreaAnalysisIdsSchema.safeParse({ ids: Array.from({ length: 11 }, () => id) }).success,
    ).toBe(false);
    expect(TransferSavedAreaAnalysisSchema.parse({ analysisId: id, targetUserId })).toEqual({
      analysisId: id,
      targetUserId,
    });
    expect(
      TransferSavedAreaAnalysisSchema.safeParse({ analysisId: id, targetUserId: "user-1" }).success,
    ).toBe(false);
  });
});

describe("UsernameSchema", () => {
  it("accepts letters, digits, ._-", () => {
    expect(UsernameSchema.parse("joao.silva-1")).toBe("joao.silva-1");
  });

  it("normalizes to lowercase", () => {
    expect(UsernameSchema.parse("Joao.Silva")).toBe("joao.silva");
  });

  it("rejects a digits-only string: ambiguity with employee_id at login (WHERE username = ? OR employee_id = ?)", () => {
    expect(() => UsernameSchema.parse("12345")).toThrow();
  });

  it("rejects a character outside the charset", () => {
    expect(() => UsernameSchema.parse("joao@silva")).toThrow();
  });

  it("rejects a value longer than the database column", () => {
    expect(() => UsernameSchema.parse(`a${"b".repeat(60)}`)).toThrow();
  });
});

describe("EmployeeIdSchema", () => {
  it("accepts a digits-only string", () => {
    expect(EmployeeIdSchema.parse("12345")).toBe("12345");
  });

  it("preserves a leading zero (no cast to number)", () => {
    expect(EmployeeIdSchema.parse("00099")).toBe("00099");
  });

  it("rejects a letter", () => {
    expect(() => EmployeeIdSchema.parse("123a5")).toThrow();
  });

  it("rejects a value longer than the database column", () => {
    expect(() => EmployeeIdSchema.parse("1".repeat(31))).toThrow();
  });
});

describe("ProductionForecastSchema", () => {
  it("accepts a future date", () => {
    const result = ProductionForecastSchema.parse({ storeCode: "1516", targetDate: "2099-01-01" });
    expect(result.targetDate).toBe("2099-01-01");
  });

  it("accepts a past date: conferência of a day that already happened", () => {
    const result = ProductionForecastSchema.parse({ storeCode: "1516", targetDate: "2020-01-01" });
    expect(result.targetDate).toBe("2020-01-01");
  });

  it("rejects a malformed date string", () => {
    expect(() =>
      ProductionForecastSchema.parse({ storeCode: "1516", targetDate: "not-a-date" }),
    ).toThrow();
  });

  it("accepts a single secao and defaults groups to empty arrays", () => {
    const result = ProductionForecastSchema.parse({ storeCode: "1516", targetDate: "2026-01-01" });
    expect(result.secao).toBeUndefined();
    expect(result.grupos).toEqual([]);
  });

  it("keeps a single secao when provided", () => {
    const result = ProductionForecastSchema.parse({
      storeCode: "1516",
      targetDate: "2026-01-01",
      secao: "CARNES E AVES",
    });
    expect(result.secao).toBe("CARNES E AVES");
  });
});

describe("PasswordSchema", () => {
  it("accepts 8+ char password", () => {
    expect(PasswordSchema.parse("12345678")).toBe("12345678");
  });

  it("rejects short password", () => {
    expect(() => PasswordSchema.parse("1234567")).toThrow();
  });
});

describe("authentication input schemas", () => {
  it("bounds identifiers to the database column length", () => {
    expect(AuthIdentifierSchema.parse("a".repeat(60))).toHaveLength(60);
    expect(() => AuthIdentifierSchema.parse("a".repeat(61))).toThrow();
  });

  it("bounds login passwords without applying new-password complexity rules", () => {
    expect(AuthPasswordInputSchema.parse("x")).toBe("x");
    expect(AuthPasswordInputSchema.parse("a".repeat(128))).toHaveLength(128);
    expect(() => AuthPasswordInputSchema.parse("a".repeat(129))).toThrow();
  });
});

const saleRow = {
  store_code: "1",
  store_name: "Loja",
  depto: null,
  secao: null,
  grupo: null,
  subgrupo: null,
  prod_code: "10",
  prod_name: "Produto",
  val_vda: 1,
};

describe("import input schemas", () => {
  it("rejects an empty batch id in every import stage", () => {
    expect(
      BeginImportSchema.safeParse({
        sale_date: "2026-08-18",
        batch_id: "",
        total_rows: 1,
        stores: [],
        products: [],
      }).success,
    ).toBe(false);
    expect(
      InsertSalesChunkSchema.safeParse({
        sale_date: "2026-08-18",
        batch_id: "",
        rows: [saleRow],
      }).success,
    ).toBe(false);
    expect(
      FinalizeImportSchema.safeParse({
        sale_date: "2026-08-18",
        batch_id: "",
        row_count: 1,
      }).success,
    ).toBe(false);
  });

  it("rejects a total above the maximum import size", () => {
    expect(() =>
      BeginImportSchema.parse({
        sale_date: "2026-08-18",
        batch_id: "batch",
        total_rows: IMPORT_MAX_ROWS + 1,
        stores: [],
        products: [],
      }),
    ).toThrow();
  });

  it("bounds metadata that is persisted with the import lease", () => {
    const store = { store_code: "1", store_name: "Loja" };
    expect(() =>
      BeginImportSchema.parse({
        sale_date: "2026-08-18",
        batch_id: "batch",
        total_rows: 1,
        stores: Array(IMPORT_MAX_STORES + 1).fill(store),
        products: [],
      }),
    ).toThrow();
  });

  it("rejects empty and oversized chunks", () => {
    const input = { sale_date: "2026-08-18", batch_id: "batch" };
    expect(() => InsertSalesChunkSchema.parse({ ...input, rows: [] })).toThrow();
    expect(() =>
      InsertSalesChunkSchema.parse({
        ...input,
        rows: Array(IMPORT_CHUNK_SIZE + 1).fill(saleRow),
      }),
    ).toThrow();
  });

  it("rejects row fields that exceed their database columns", () => {
    expect(() =>
      InsertSalesChunkSchema.parse({
        sale_date: "2026-08-18",
        batch_id: "batch",
        rows: [{ ...saleRow, prod_name: "x".repeat(256) }],
      }),
    ).toThrow();
  });

  it("rejects a final row count above the import maximum", () => {
    expect(() =>
      FinalizeImportSchema.parse({
        sale_date: "2026-08-18",
        batch_id: "batch",
        row_count: IMPORT_MAX_ROWS + 1,
      }),
    ).toThrow();
    expect(() =>
      FinalizeImportSchema.parse({
        sale_date: "2026-08-18",
        batch_id: "batch",
        row_count: 0,
      }),
    ).toThrow();
  });

  it("requires a bounded batch id when cancelling", () => {
    expect(CancelImportSchema.parse({ batch_id: "batch" })).toEqual({ batch_id: "batch" });
    expect(() => CancelImportSchema.parse({ batch_id: "" })).toThrow();
    expect(() => CancelImportSchema.parse({ batch_id: "x".repeat(37) })).toThrow();
  });
});
