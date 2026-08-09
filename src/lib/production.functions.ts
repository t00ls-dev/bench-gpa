import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "./auth-middleware";
import { requireRateLimit } from "./rate-limit.middleware";
import db from "./db";
import {
  ProductionForecastResult,
  ProductionSecaoForecast,
  ProductionGrupoForecast,
  ProductionSubgrupoForecast,
  ProductionForecastProduct,
  ProductionFilterOption,
  asArray,
  asRecord,
  str,
  strOrNull,
  num,
} from "./api-types";
import { ProductionForecastSchema, SingleStoreCodeSchema } from "./schemas";
import { CACHE_TTL_SHORT, CACHE_TTL_LONG } from "./cache";

/**
 * Confidence floor for a product to be forecast individually (see
 * docs/planejamento-producao-perecveis-2026-08-07.md): needs at least this
 * many occurrences of the target weekday within the lookback window.
 * Starting point, not measured against real precision yet -- calibrate with
 * scripts/bench-procs.sh/validate-procs.sh before changing.
 */
export const PRODUCTION_MIN_OCCURRENCES = 4;

/** How many weekday occurrences the average is computed over. */
export const PRODUCTION_LOOKBACK_OCCURRENCES = 8;

export const getProductionForecast = createServerFn({ method: "POST" })
  .middleware([requireAuth, requireRateLimit()])
  .inputValidator((d: unknown) => ProductionForecastSchema.parse(d))
  .handler(async ({ data }): Promise<ProductionForecastResult> => {
    const query = async (): Promise<ProductionForecastResult> => {
      const [rs] = await db.query("CALL production_forecast(?, ?, ?, ?, ?, ?)", [
        data.storeCode,
        data.targetDate,
        PRODUCTION_MIN_OCCURRENCES,
        PRODUCTION_LOOKBACK_OCCURRENCES,
        JSON.stringify(data.secoes ?? []),
        JSON.stringify(data.grupos ?? []),
      ]);
      const [individualRows, outrosRows, secoesRows, metaRows] = rs as unknown[];
      const meta = asRecord(asArray(metaRows)[0]);

      const individual: ProductionForecastProduct[] = asArray(individualRows).map((r) => {
        const p = asRecord(r);
        return {
          prodCode: str(p.prod_code),
          prodName: str(p.prod_name),
          secao: strOrNull(p.secao),
          grupo: strOrNull(p.grupo),
          subgrupo: strOrNull(p.subgrupo),
          occurrences: num(p.occurrences),
          forecastVal: num(p.forecast_val),
          forecastMin: num(p.forecast_min),
          forecastMax: num(p.forecast_max),
        };
      });

      // secao -> grupo -> subgrupo -> bucket. Nested Maps preserve
      // insertion order, so walking `individual` first (already ordered by
      // the proc's `ORDER BY secao, grupo, subgrupo, forecast_val DESC`)
      // fixes the grupo/subgrupo order for free; `outrosRows` (also
      // ordered by secao/grupo/subgrupo) only adds a bucket when a combo
      // has ONLY below-threshold products (no individual row at all).
      interface SubgrupoBucket {
        subgrupo: string | null;
        produtos: ProductionForecastProduct[];
        outros: { numProdutos: number; outrosVal: number } | null;
      }
      const bySecao = new Map<
        string | null,
        Map<string | null, Map<string | null, SubgrupoBucket>>
      >();
      const getBucket = (
        secao: string | null,
        grupo: string | null,
        subgrupo: string | null,
      ): SubgrupoBucket => {
        let byGrupo = bySecao.get(secao);
        if (!byGrupo) bySecao.set(secao, (byGrupo = new Map()));
        let bySubgrupo = byGrupo.get(grupo);
        if (!bySubgrupo) byGrupo.set(grupo, (bySubgrupo = new Map()));
        let bucket = bySubgrupo.get(subgrupo);
        if (!bucket) bySubgrupo.set(subgrupo, (bucket = { subgrupo, produtos: [], outros: null }));
        return bucket;
      };

      for (const p of individual) {
        getBucket(p.secao, p.grupo, p.subgrupo).produtos.push(p);
      }
      for (const r of asArray(outrosRows)) {
        const o = asRecord(r);
        const bucket = getBucket(strOrNull(o.secao), strOrNull(o.grupo), strOrNull(o.subgrupo));
        bucket.outros = { numProdutos: num(o.num_produtos), outrosVal: num(o.outros_val) };
      }

      // secoesRows (product_universe) is the source of truth for WHICH
      // sections exist for this store: guarantees a section with zero sales
      // on this weekday within the window (e.g. Bacalhau) still shows up,
      // with an empty grupos list -- see the design doc. Grupo/Subgrupo,
      // unlike Seção, only exist here when bySecao actually has them: they
      // aren't padded from product_universe's full catalog.
      const secoes: ProductionSecaoForecast[] = asArray(secoesRows).map((r) => {
        const secao = str(asRecord(r).secao);
        const byGrupo = bySecao.get(secao);
        const grupos: ProductionGrupoForecast[] = byGrupo
          ? [...byGrupo.entries()].map(([grupo, bySubgrupo]) => {
              const subgrupos: ProductionSubgrupoForecast[] = [...bySubgrupo.values()].map(
                (bucket) => ({
                  subgrupo: bucket.subgrupo,
                  produtos: bucket.produtos,
                  outros: bucket.outros,
                  totalSubgrupo:
                    bucket.produtos.reduce((sum, p) => sum + p.forecastVal, 0) +
                    (bucket.outros?.outrosVal ?? 0),
                }),
              );
              const totalGrupo = subgrupos.reduce((sum, sg) => sum + sg.totalSubgrupo, 0);
              return { grupo, subgrupos, totalGrupo };
            })
          : [];
        const totalSecao = grupos.reduce((sum, g) => sum + g.totalGrupo, 0);
        return { secao, grupos, totalSecao };
      });

      return {
        secoes,
        weekdayNum: num(meta.weekday_num),
        minOccurrences: num(meta.min_occurrences),
        lookbackOccurrences: num(meta.lookback_occurrences),
      };
    };

    // Same characteristic that already justifies CACHE_TTL_SHORT everywhere
    // else in this project: the result only changes when a new import runs,
    // not on every clock tick. Nothing here is more special than
    // getAreaAnalysis in that respect.
    const { cache } = await import("./cache");
    const key = `production:${data.storeCode}:${data.targetDate}:${(data.secoes ?? []).join(",")}:${(data.grupos ?? []).join(",")}`;
    return cache.wrap(key, query, CACHE_TTL_SHORT);
  });

export const getProductionFilterOptions = createServerFn({ method: "POST" })
  .middleware([requireAuth, requireRateLimit()])
  .inputValidator((d: unknown) => SingleStoreCodeSchema.parse(d))
  .handler(async ({ data }): Promise<ProductionFilterOption[]> => {
    const { cache } = await import("./cache");
    return cache.wrap(
      `production-filter-options:${data.storeCode}`,
      async () => {
        const [rows] = await db.query(
          "SELECT DISTINCT secao, grupo, subgrupo FROM product_universe WHERE store_code = ? AND depto = 'PERECIVEIS'",
          [data.storeCode],
        );
        return asArray(rows).map((r) => {
          const p = asRecord(r);
          return {
            secao: str(p.secao),
            grupo: strOrNull(p.grupo),
            subgrupo: strOrNull(p.subgrupo),
          };
        });
      },
      CACHE_TTL_LONG,
    );
  });
