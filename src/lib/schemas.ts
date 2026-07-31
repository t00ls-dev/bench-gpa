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

/**
 * Opções de itens/página do seletor de paginação da tela Área. Único lugar
 * onde a lista existe — o estado do seletor (`useState<25 | 50 | 100 | 250>`)
 * e as opções do dropdown a derivam, em vez de repetir os quatro números.
 */
export const AREA_PAGE_SIZE_OPTIONS = [25, 50, 100, 250] as const;

/**
 * Tamanho de página usado pelo export (PDF), que precisa da listagem inteira.
 *
 * Não é um número redondo por acaso: tem de ser (a) maior que o universo de PLUs
 * sob qualquer filtro — eram ~13,6k PLUs distintos em prod em 2026-07 —, (b)
 * menor ou igual ao teto do AreaAnalysisSchema, e (c) MAIOR que o limiar de
 * cache em area.functions.ts, que é o que mantém a listagem inteira fora do
 * SimpleCache. Ao mexer em qualquer um dos três, revisar os outros dois.
 */
export const EXPORT_PAGE_SIZE = 50_000;

/**
 * Teto de pageSize. Medido em 2026-07-25: um LIMIT grande NÃO encarece a
 * consulta (250 e 999999 deram o mesmo tempo, ~32s) porque o LIMIT não cria
 * linhas — o custo é dominado pelos agregados. O teto existe para limitar o
 * PAYLOAD serializado, não a CPU do banco, e para barrar pedidos absurdos de um
 * cliente autenticado. Precisa acomodar o EXPORT_PAGE_SIZE.
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
