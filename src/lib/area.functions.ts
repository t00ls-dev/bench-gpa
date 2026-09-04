import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "./auth-middleware";
import { requireRateLimit } from "./rate-limit.middleware";
import db from "./db";
import {
  AreaAnalysisResult,
  AreaFilterHierarchyResult,
  AreaProductFilterOption,
  asArray,
  asRecord,
  str,
  strOrNull,
  num,
  parseDateVal,
} from "./api-types";
import { AreaAnalysisSchema, AreaProductFilterOptionsSchema } from "./schemas";
import { CACHE_TTL_LONG, CACHE_TTL_SHORT } from "./cache";
import { buildCacheKey } from "./cache-key";
import { buildAreaChartScopeKey } from "./area-chart-data";

/**
 * Above this page size the response doesn't get cached: this is the PDF
 * export path. See the invariant note in getAreaAnalysis's body and
 * EXPORT_PAGE_SIZE in schemas.ts, which needs to be greater than this
 * value.
 */
export const CACHE_BYPASS_PAGE_SIZE = 1000;

export const getAreaAnalysis = createServerFn({ method: "POST" })
  .middleware([requireAuth, requireRateLimit()])
  .inputValidator((d: unknown) => AreaAnalysisSchema.parse(d))
  .handler(async ({ data }): Promise<AreaAnalysisResult> => {
    const chartScopeKey = buildAreaChartScopeKey(data);
    // "days without a sale" isn't a column: it's sorted by last_sale_date
    // INVERTED, more days idle = older sale. The translation has to happen
    // on the server because the listing is paginated: sortBy 'daysSince'
    // used to be mapped to 'val' and the client would only reorder the
    // received page, which was flatly wrong once PLUs without a sale
    // entered the list: they have val = 0, land at the end of the sale
    // ordering, and would never reach the first page -- even though
    // they're exactly what this sort is meant to surface.
    const byDays = data.sortBy === "daysSince";
    const sortBy = byDays ? "last_sale_date" : data.sortBy;
    const sortDir = byDays ? (data.sortDir === "desc" ? "asc" : "desc") : data.sortDir;

    const query = async (): Promise<AreaAnalysisResult> => {
      const [rs] = await db.query("CALL area_analysis_v2(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [
        data.dateFrom,
        data.dateTo,
        JSON.stringify(data.stores ?? []),
        JSON.stringify(data.deptos ?? []),
        JSON.stringify(data.secoes ?? []),
        JSON.stringify(data.grupos ?? []),
        JSON.stringify(data.subgrupos ?? []),
        JSON.stringify(data.products ?? []),
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
        chartScopeKey,
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
        totalPages: data.pageSize
          ? Math.max(1, Math.ceil(totalProducts / data.pageSize))
          : undefined,
      };
    };

    // This used to be the most expensive screen in the system with no
    // cache at all. Measured in prod: 2.1s on the default 7-day window and
    // 23.0s when the user opens it for 28 (measured with
    // scripts/bench-procs.sh), on every page change, sort, or filter, all
    // repeated from scratch. This proc still scans the aggregate three
    // times: reducing that was tried and regressed, see the warning at the
    // top of area_analysis in scripts/migrate-schema.sql.
    //
    // The PDF export is the deliberate exception: it requests the entire
    // list (EXPORT_PAGE_SIZE), which comes out to megabytes per entry, and
    // is an isolated click that rarely repeats with the same filters.
    // Caching that would fill up the process's memory: the VPS has 1.9 GB
    // and SimpleCache has no size cap, only a TTL.
    //
    // INVARIANT: CACHE_BYPASS_PAGE_SIZE < EXPORT_PAGE_SIZE <= the
    // AreaAnalysisSchema cap (schemas.ts). If the export ever stops
    // exceeding this threshold, the entire listing silently starts getting
    // cached again and the process's memory usage grows with PDF usage.
    // Covered by a test in area.functions.test.ts.
    const { cache } = await import("./cache");
    if ((data.pageSize ?? 0) > CACHE_BYPASS_PAGE_SIZE) return query();

    const key = buildCacheKey("area", {
      dateFrom: data.dateFrom,
      dateTo: data.dateTo,
      stores: data.stores,
      deptos: data.deptos,
      secoes: data.secoes,
      grupos: data.grupos,
      subgrupos: data.subgrupos,
      products: data.products,
      page: data.page,
      pageSize: data.pageSize,
      search: data.search,
      sortBy,
      sortDir,
    });
    return cache.wrap(key, query, CACHE_TTL_SHORT);
  });

export const getAreaProductFilterOptions = createServerFn({ method: "POST" })
  .middleware([requireAuth, requireRateLimit()])
  .inputValidator((d: unknown) => AreaProductFilterOptionsSchema.parse(d))
  .handler(async ({ data }): Promise<AreaProductFilterOption[]> => {
    const fields = [
      ["store_code", data.stores],
      ["depto", data.deptos],
      ["secao", data.secoes],
      ["grupo", data.grupos],
      ["subgrupo", data.subgrupos],
    ] as const;
    const predicates: string[] = [];
    const params: string[] = [];
    for (const [column, values] of fields) {
      if (!values.length) continue;
      predicates.push(`u.${column} IN (${values.map(() => "?").join(", ")})`);
      params.push(...values);
    }

    const key = buildCacheKey("area-product-options", {
      stores: data.stores,
      deptos: data.deptos,
      secoes: data.secoes,
      grupos: data.grupos,
      subgrupos: data.subgrupos,
    });
    const { cache } = await import("./cache");
    return cache.wrap(
      key,
      async () => {
        const where = predicates.length ? `WHERE ${predicates.join(" AND ")}` : "";
        const [rows] = await db.query(
          `SELECT u.prod_code, MAX(u.prod_name) AS prod_name
           FROM product_universe u
           ${where}
           GROUP BY u.prod_code
           ORDER BY prod_name, u.prod_code`,
          params,
        );
        return asArray(rows).map((row) => {
          const record = asRecord(row);
          return { prodCode: str(record.prod_code), prodName: str(record.prod_name) };
        });
      },
      CACHE_TTL_LONG,
    );
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
