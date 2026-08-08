import { z } from "zod";
import { todayISOBrazil } from "./utils";

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
 * Items-per-page options for the Area screen's pagination selector. The one
 * place this list exists: the selector's state (`useState<25 | 50 | 100 |
 * 250>`) and the dropdown options derive from it, instead of repeating the
 * four numbers.
 */
export const PAGE_SIZE_OPTIONS = [25, 50, 100, 250] as const;

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
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().max(MAX_PAGE_SIZE).optional().default(50),
  search: z.string().max(255).optional().default(""),
  sortBy: z.enum(["val", "prod_code", "prod_name", "daysSince"]).optional().default("val"),
  sortDir: z.enum(["asc", "desc"]).optional().default("desc"),
});

export const DashboardRankingsSchema = FilterSchema.extend({
  limit: z.number().int().min(1).max(50).optional().default(10),
});

/**
 * Store and target date are always required singles here (never optional
 * multi-value filters like FilterSchema's): the Production Planning
 * screen always plans for exactly one store, one future day.
 *
 * targetDate must be strictly after "today" in the Brasília timezone
 * (todayISOBrazil, utils.ts) -- reused instead of comparing against a raw
 * `new Date()`, for the same reason it exists: the server (UTC) and a
 * client in Brazil can disagree about what day it is by a few hours.
 */
export const ProductionForecastSchema = z.object({
  storeCode: z.string().min(1),
  targetDate: z.string().refine((d) => d > todayISOBrazil(), {
    message: "A data deve ser um dia futuro.",
  }),
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
  .regex(
    /^(?!\d+$)[a-z0-9._-]+$/,
    "Username deve conter letras, números, ._- e não pode ser só dígitos",
  );

// No .transform(Number): preserves leading zeros, common in HR employee IDs.
export const EmployeeIdSchema = z
  .string()
  .trim()
  .regex(/^\d+$/, "Matrícula deve conter só dígitos");

export const PasswordSchema = z.string().min(8, "Senha deve ter ao menos 8 caracteres").max(128);

export const SaleRowSchema = z.object({
  store_code: z.string(),
  store_name: z.string(),
  depto: z.string().nullable(),
  secao: z.string().nullable(),
  grupo: z.string().nullable(),
  subgrupo: z.string().nullable(),
  prod_code: z.string(),
  prod_name: z.string(),
  val_vda: z.number(),
});

export const SingleSlugSchema = z.object({ slug: z.string().min(1) });

export const SingleQuerySchema = z.object({ q: z.string().min(3) });

export const SingleProdCodeSchema = z.object({ prodCode: z.string().min(1) });
