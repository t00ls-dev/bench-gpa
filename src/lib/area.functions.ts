import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "./auth-middleware";
import { requireRateLimit } from "./rate-limit.middleware";
import db from "./db";
import {
  AreaAnalysisResult,
  AreaFilterHierarchyResult,
  asArray,
  asRecord,
  str,
  strOrNull,
  num,
  parseDateVal,
} from "./api-types";
import { AreaAnalysisSchema } from "./schemas";
import { CACHE_TTL_LONG, CACHE_TTL_SHORT } from "./cache";

/**
 * Acima deste tamanho de página a resposta não entra no cache: é o caminho do
 * export para PDF. Ver a nota de invariante no corpo de getAreaAnalysis e o
 * EXPORT_PAGE_SIZE em schemas.ts, que precisa ser maior que este valor.
 */
export const CACHE_BYPASS_PAGE_SIZE = 1000;

export const getAreaAnalysis = createServerFn({ method: "POST" })
  .middleware([requireAuth, requireRateLimit()])
  .inputValidator((d: unknown) => AreaAnalysisSchema.parse(d))
  .handler(async ({ data }): Promise<AreaAnalysisResult> => {
    // "dias sem vender" não é coluna: ordena-se por last_sale_date INVERTIDO,
    // mais dias parado = venda mais antiga. A tradução precisa acontecer no
    // servidor porque a listagem é paginada: antes o sortBy 'daysSince' era
    // mapeado para 'val' e o cliente reordenava só a página recebida, o que
    // ficou francamente errado quando os PLUs sem venda entraram na lista:
    // eles têm val = 0, caem no fim da ordenação por venda e nunca chegariam
    // à primeira página, justamente sendo eles o alvo dessa ordenação.
    const byDays = data.sortBy === "daysSince";
    const sortBy = byDays ? "last_sale_date" : data.sortBy;
    const sortDir = byDays ? (data.sortDir === "desc" ? "asc" : "desc") : data.sortDir;

    const query = async (): Promise<AreaAnalysisResult> => {
      const [rs] = await db.query("CALL area_analysis(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [
        data.dateFrom,
        data.dateTo,
        JSON.stringify(data.stores ?? []),
        JSON.stringify(data.deptos ?? []),
        JSON.stringify(data.secoes ?? []),
        JSON.stringify(data.grupos ?? []),
        JSON.stringify(data.subgrupos ?? []),
        data.page ?? null,
        data.pageSize,
        data.search,
        sortBy,
        sortDir,
      ]);
      const [kpiRows, totalCountRows, byDate, products] = rs as unknown[];
      const kpi = asRecord(asArray(kpiRows)[0]);
      const totalProducts = num(asRecord(asArray(totalCountRows)[0]).total_products);
      return {
        total: num(kpi.total),
        plusTotal: num(kpi.plus_total),
        plusWithSale: num(kpi.plus_with_sale),
        plusWithoutSale: num(kpi.plus_without_sale),
        avgPerPlu: num(kpi.plus_with_sale) > 0 ? num(kpi.total) / num(kpi.plus_with_sale) : 0,
        products: asArray(products).map((p) => {
          const r = asRecord(p);
          return {
            prod_code: str(r.prod_code),
            prod_name: str(r.prod_name),
            depto: strOrNull(r.depto),
            secao: strOrNull(r.secao),
            grupo: strOrNull(r.grupo),
            subgrupo: strOrNull(r.subgrupo),
            val: num(r.val),
            lastSaleDate: strOrNull(r.last_sale_date),
          };
        }),
        byDate: parseDateVal(byDate),
        totalProducts,
        page: data.page ?? undefined,
        pageSize: data.pageSize,
        totalPages: data.pageSize ? Math.ceil(totalProducts / data.pageSize) : undefined,
      };
    };

    // Esta era a tela mais cara do sistema sem nenhum cache. Medido em prod:
    // 2,1s na janela padrão de 7 dias e 23,0s quando o usuário abre para 28
    // (medido com scripts/bench-procs.sh), a cada troca de página, de ordenação
    // ou de filtro, tudo repetido do zero. Esta proc segue varrendo o agregado
    // três vezes: reduzir isso foi tentado e regrediu, ver o aviso no cabeçalho
    // de area_analysis em scripts/migrate-schema.sql.
    //
    // O export para PDF é a exceção deliberada: ele pede a lista inteira
    // (EXPORT_PAGE_SIZE), o que dá megabytes por entrada, e é um clique isolado
    // que raramente se repete com os mesmos filtros. Cachear isso encheria a
    // memória do processo: a VPS tem 1,9 GB e o SimpleCache não tem teto de
    // tamanho, só TTL.
    //
    // INVARIANTE: CACHE_BYPASS_PAGE_SIZE < EXPORT_PAGE_SIZE <= o teto do
    // AreaAnalysisSchema (schemas.ts). Se o export deixar de superar este
    // limiar, a listagem inteira volta a ser cacheada silenciosamente e o
    // consumo de memória do processo passa a crescer com o uso do PDF.
    // Coberto por teste em area.functions.test.ts.
    const { cache } = await import("./cache");
    if ((data.pageSize ?? 0) > CACHE_BYPASS_PAGE_SIZE) return query();

    const key = `area:${data.dateFrom}:${data.dateTo}:${(data.stores ?? []).join(",")}:${(data.deptos ?? []).join(",")}:${(data.secoes ?? []).join(",")}:${(data.grupos ?? []).join(",")}:${(data.subgrupos ?? []).join(",")}:${data.page ?? ""}:${data.pageSize}:${data.search}:${sortBy}:${sortDir}`;
    return cache.wrap(key, query, CACHE_TTL_SHORT);
  });

export const getAreaFilterHierarchy = createServerFn({ method: "POST" })
  .middleware([requireAuth, requireRateLimit()])
  .handler(async (): Promise<AreaFilterHierarchyResult> => {
    const { cache } = await import("./cache");
    return cache.wrap(
      "area_filter_hierarchy",
      async () => {
        const [rs2] = await db.query("CALL area_filter_hierarchy()");
        const [latestDateRows, hierarchy, availableDates] = rs2 as unknown[];
        return {
          latestDate: strOrNull(asRecord(asArray(latestDateRows)[0]).latest_date ?? null),
          hierarchy: asArray(hierarchy).map((h) => {
            const r = asRecord(h);
            return {
              store_code: str(r.store_code),
              store_name: str(r.store_name),
              depto: strOrNull(r.depto),
              secao: strOrNull(r.secao),
              grupo: strOrNull(r.grupo),
              subgrupo: strOrNull(r.subgrupo),
            };
          }),
          // Sort ascending at the boundary (see the matching note in
          // dashboard.functions.ts). Consumers assume availableDates[0] is the
          // earliest date; a prod proc that returned them descending produced
          // an inverted from>to range that loaded no data. ISO strings sort
          // chronologically, so this holds the invariant regardless of the DB.
          availableDates: asArray(availableDates)
            .map((r) => str(asRecord(r).sale_date))
            .sort(),
        };
      },
      CACHE_TTL_LONG,
    );
  });
