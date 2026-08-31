import { z } from "zod";
import {
  IMPORT_CHUNK_SIZE,
  IMPORT_MAX_PRODUCTS,
  IMPORT_MAX_ROWS,
  IMPORT_MAX_STORES,
} from "./import-config";

const DateRangeSchema = z.object({
  dateFrom: z.string().optional().nullable(),
  dateTo: z.string().optional().nullable(),
});

export const FilterSchema = DateRangeSchema.extend({
  stores: z.array(z.string()).optional().default([]),
  deptos: z.array(z.string()).optional().default([]),
  secoes: z.array(z.string()).optional().default([]),
  grupos: z.array(z.string()).optional().default([]),
  subgrupos: z.array(z.string()).optional().default([]),
});

export type Filters = z.infer<typeof FilterSchema>;

/**
 * Shared items-per-page options for paginated tables. The one
 * place this list exists: the selector's state (`useState<25 | 50 | 100 |
 * 250>`) and the dropdown options derive from it, instead of repeating the
 * four numbers.
 */
export const PAGE_SIZE_OPTIONS = [25, 50, 100, 250] as const;
export const DEFAULT_PAGE_SIZE = PAGE_SIZE_OPTIONS[0];

const PageSizeSchema = z
  .number()
  .int()
  .refine(
    (value) => PAGE_SIZE_OPTIONS.some((option) => option === value),
    "Tamanho de página inválido",
  );

export const AuditLogQuerySchema = z.object({
  search: z.string().trim().max(255).optional().default(""),
  sortBy: z.enum(["created_at", "action", "actor_username", "ip"]).optional().default("created_at"),
  sortDir: z.enum(["asc", "desc"]).optional().default("desc"),
  limit: PageSizeSchema.optional().default(DEFAULT_PAGE_SIZE),
  offset: z.number().int().min(0).optional().default(0),
});

export type AuditLogQuery = z.infer<typeof AuditLogQuerySchema>;

export const ImportHistoryQuerySchema = z.object({
  search: z.string().trim().max(255).optional().default(""),
  sortBy: z.enum(["sale_date", "row_count", "imported_at"]).optional().default("sale_date"),
  sortDir: z.enum(["asc", "desc"]).optional().default("desc"),
  limit: PageSizeSchema.optional().default(DEFAULT_PAGE_SIZE),
  offset: z.number().int().min(0).optional().default(0),
});

export type ImportHistoryQuery = z.infer<typeof ImportHistoryQuerySchema>;

/**
 * Page size used by the export (PDF), which needs the full listing.
 *
 * Not a round number by accident: it has to be (a) larger than the universe
 * of PLUs under any filter (~13.6k distinct PLUs in prod as of 2026-07), (b)
 * less than or equal to AreaAnalysisSchema's ceiling, and (c) GREATER than
 * the cache threshold in area.functions.ts, which is what keeps the full
 * listing out of SimpleCache. Touching any of the three means reviewing the
 * other two.
 */
export const EXPORT_PAGE_SIZE = 50_000;

/**
 * pageSize ceiling. Measured on 2026-07-25: a large LIMIT does NOT make the
 * query more expensive (250 and 999999 took the same ~32s) because LIMIT
 * doesn't create rows: the cost is dominated by the aggregates. The ceiling
 * exists to limit the serialized PAYLOAD, not the database's CPU, and to
 * block absurd requests from an authenticated client. Needs to accommodate
 * EXPORT_PAGE_SIZE.
 */
const MAX_PAGE_SIZE = EXPORT_PAGE_SIZE;

export const AreaAnalysisSchema = z.object({
  dateFrom: z.string(),
  dateTo: z.string(),
  stores: z.array(z.string()).optional().default([]),
  deptos: z.array(z.string()).optional().default([]),
  secoes: z.array(z.string()).optional().default([]),
  grupos: z.array(z.string()).optional().default([]),
  subgrupos: z.array(z.string()).optional().default([]),
  products: z.array(z.string()).optional().default([]),
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().max(MAX_PAGE_SIZE).optional().default(DEFAULT_PAGE_SIZE),
  search: z.string().max(255).optional().default(""),
  sortBy: z.enum(["val", "prod_code", "prod_name", "daysSince"]).optional().default("val"),
  sortDir: z.enum(["asc", "desc"]).optional().default("desc"),
});

const SavedAreaProductCodeSchema = z.string().trim().min(1).max(20);
const SavedAreaProductCodesSchema = z
  .array(SavedAreaProductCodeSchema)
  .min(1)
  .max(5_000)
  .refine((codes) => new Set(codes).size === codes.length, {
    message: "A análise não pode conter produtos duplicados",
  });

export const SavedAreaAnalysisIdSchema = z.object({
  id: z.string().uuid(),
});

export const CreateSavedAreaAnalysisSchema = z.object({
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(1000).nullable().optional(),
  storeCode: z.string().trim().min(1).max(20),
  productCodes: SavedAreaProductCodesSchema,
});

export const UpdateSavedAreaAnalysisSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(255).optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    productCodes: SavedAreaProductCodesSchema.optional(),
  })
  .refine(
    (data) =>
      data.name !== undefined || data.description !== undefined || data.productCodes !== undefined,
    {
      message: "Informe o nome, a descrição ou os produtos para atualizar a análise",
    },
  );

export const AreaProductFilterOptionsSchema = FilterSchema.pick({
  stores: true,
  deptos: true,
  secoes: true,
  grupos: true,
  subgrupos: true,
});

export const DashboardRankingsSchema = FilterSchema.extend({
  limit: z.number().int().min(1).max(50).optional().default(10),
});

/**
 * Store and target date are always required singles here (never optional
 * multi-value filters like FilterSchema's): the Production Planning
 * screen always plans for exactly one store, one day. secao/grupos ARE
 * optional filters (added 2026-08-08), same shape as
 * FilterSchema's, narrowing the fixed PERECIVEIS scope further.
 *
 * targetDate has no past/future restriction (removed 2026-08-08): a
 * future date is a forecast, a past date recomputes what the forecast
 * would have said for a day that already happened (conferência) -- the
 * proc only ever looks at sale_date strictly before p_target_date either
 * way, so there's nothing direction-specific to validate here.
 */
export const ProductionForecastSchema = z.object({
  storeCode: z.string().min(1),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida."),
  secao: z.string().optional(),
  grupos: z.array(z.string()).optional().default([]),
});

export const UserIdSchema = z.string().uuid();

export const RoleEnum = z.enum(["admin", "user"]);

// Username and employee_id can never match the same value: login resolves
// `WHERE username = ? OR employee_id = ?` into a single identifier, and
// that query becomes ambiguous if a value could be read as either. Employee
// id is always digits-only, so username forbids a purely numeric string
// (negative lookahead) -- same rule used to classify the legacy email in
// scripts/migrate-users-to-username.ts.
export const UsernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(60)
  .regex(
    /^(?!\d+$)[a-z0-9._-]+$/,
    "Username deve conter letras, números, ._- e não pode ser só dígitos",
  );

// No .transform(Number): preserves leading zeros, common in HR employee IDs.
export const EmployeeIdSchema = z
  .string()
  .trim()
  .max(30)
  .regex(/^\d+$/, "Matrícula deve conter só dígitos");

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

export const UpdateAdminUserSchema = z
  .object({
    userId: UserIdSchema,
    username: z.preprocess(emptyToUndefined, UsernameSchema.optional()),
    employeeId: z.preprocess(emptyToUndefined, EmployeeIdSchema.optional()),
    name: z.string().trim().min(1, "Nome obrigatório").max(120),
    role: RoleEnum,
    isActive: z.boolean(),
  })
  .refine((data) => data.username !== undefined || data.employeeId !== undefined, {
    message: "Informe usuário ou matrícula.",
    path: ["username"],
  });

const MAX_AUTH_IDENTIFIER_LENGTH = 60;
const MAX_PASSWORD_LENGTH = 128;

export const AuthIdentifierSchema = z.string().trim().min(1).max(MAX_AUTH_IDENTIFIER_LENGTH);
export const AuthPasswordInputSchema = z.string().min(1).max(MAX_PASSWORD_LENGTH);
export const PasswordSchema = z
  .string()
  .min(8, "Senha deve ter ao menos 8 caracteres")
  .max(MAX_PASSWORD_LENGTH);

export const SaleRowSchema = z.object({
  store_code: z.string().max(20),
  store_name: z.string().max(255),
  depto: z.string().max(100).nullable(),
  secao: z.string().max(100).nullable(),
  grupo: z.string().max(100).nullable(),
  subgrupo: z.string().max(100).nullable(),
  prod_code: z.string().max(20),
  prod_name: z.string().max(255),
  val_vda: z.number(),
});

const ImportStoreSchema = z.object({
  store_code: z.string().max(20),
  store_name: z.string().max(255),
});

const ImportProductSchema = z.object({
  prod_code: z.string().max(20),
  prod_name: z.string().max(255),
});

export const BeginImportSchema = z.object({
  sale_date: z.string(),
  batch_id: z.string().min(1).max(36),
  total_rows: z.number().int().nonnegative().max(IMPORT_MAX_ROWS),
  stores: z.array(ImportStoreSchema).max(IMPORT_MAX_STORES),
  products: z.array(ImportProductSchema).max(IMPORT_MAX_PRODUCTS),
});

export const InsertSalesChunkSchema = z.object({
  sale_date: z.string(),
  batch_id: z.string().min(1).max(36),
  rows: z.array(SaleRowSchema).min(1).max(IMPORT_CHUNK_SIZE),
});

export const FinalizeImportSchema = z.object({
  sale_date: z.string(),
  batch_id: z.string().min(1).max(36),
  row_count: z.number().int().positive().max(IMPORT_MAX_ROWS),
});

export const CancelImportSchema = z.object({
  batch_id: z.string().min(1).max(36),
});

export const SingleSlugSchema = z.object({ slug: z.string().min(1) });

export const SingleQuerySchema = z.object({ q: z.string().min(3) });

export const SingleProdCodeSchema = z.object({ prodCode: z.string().min(1) });

export const SingleStoreCodeSchema = z.object({ storeCode: z.string().min(1) });
