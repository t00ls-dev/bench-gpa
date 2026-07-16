import { z } from "zod";

export const DateRangeSchema = z.object({
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

export const AreaAnalysisSchema = z.object({
  dateFrom: z.string(),
  dateTo: z.string(),
  stores: z.array(z.string()).optional().default([]),
  deptos: z.array(z.string()).optional().default([]),
  secoes: z.array(z.string()).optional().default([]),
  grupos: z.array(z.string()).optional().default([]),
  subgrupos: z.array(z.string()).optional().default([]),
  page: z.number().int().optional(),
  pageSize: z.number().int().optional().default(50),
  search: z.string().optional().default(""),
  sortBy: z.enum(["val", "prod_code", "prod_name", "daysSince"]).optional().default("val"),
  sortDir: z.enum(["asc", "desc"]).optional().default("desc"),
});

export const CompareEnum = z.enum(["prev_period", "prev_week", "prev_month", "none"]);

export const DashboardSchema = FilterSchema.extend({
  compare: CompareEnum.optional().default("prev_period"),
});

export const DashboardRankingsSchema = FilterSchema.extend({
  limit: z.number().int().min(1).max(50).optional().default(10),
});

export const UserIdSchema = z.string().uuid();

export const RoleEnum = z.enum(["admin", "user"]);

export const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]+@gpabr\.com$/i, "E-mail deve terminar em @gpabr.com");

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
