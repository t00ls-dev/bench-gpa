import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "./auth-middleware";
import { requireRateLimit } from "./rate-limit.middleware";
import db from "./db";
import {
  ProductionForecastResult,
  ProductionSecaoForecast,
  asArray,
  asRecord,
  str,
  strOrNull,
  num,
} from "./api-types";
import { ProductionForecastSchema } from "./schemas";
import { CACHE_TTL_SHORT } from "./cache";

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
      const [rs] = await db.query("CALL production_forecast(?, ?, ?, ?)", [
        data.storeCode,
        data.targetDate,
        PRODUCTION_MIN_OCCURRENCES,
        PRODUCTION_LOOKBACK_OCCURRENCES,
      ]);
      const [individualRows, outrosRows, secoesRows, metaRows] = rs as unknown[];
      const meta = asRecord(asArray(metaRows)[0]);

      const individual = asArray(individualRows).map((r) => {
        const p = asRecord(r);
        return {
          prodCode: str(p.prod_code),
          prodName: str(p.prod_name),
          secao: strOrNull(p.secao),
          occurrences: num(p.occurrences),
          forecastVal: num(p.forecast_val),
        };
      });
      const outrosBySecao = new Map(
        asArray(outrosRows).map((r) => {
          const o = asRecord(r);
          return [
            str(o.secao),
            { numProdutos: num(o.num_produtos), outrosVal: num(o.outros_val) },
          ] as const;
        }),
      );

      // secoesRows (product_universe) is the source of truth for WHICH
      // sections exist for this store: guarantees a section with zero sales
      // on this weekday within the window (e.g. Bacalhau) still shows up,
      // with an empty product list and R$0 -- see the design doc.
      const secoes: ProductionSecaoForecast[] = asArray(secoesRows).map((r) => {
        const secao = str(asRecord(r).secao);
        const outros = outrosBySecao.get(secao);
        const produtos = individual.filter((p) => p.secao === secao);
        const outrosVal = outros?.outrosVal ?? 0;
        return {
          secao,
          produtos,
          outrosVal,
          outrosNumProdutos: outros?.numProdutos ?? 0,
          totalSecao: produtos.reduce((sum, p) => sum + p.forecastVal, 0) + outrosVal,
        };
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
    return cache.wrap(`production:${data.storeCode}:${data.targetDate}`, query, CACHE_TTL_SHORT);
  });
