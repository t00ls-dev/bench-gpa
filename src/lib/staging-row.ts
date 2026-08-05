// Column layout of the staging_sales table, shared with the CLI import
// (scripts/import.ts). The default for each column missing from the source
// row is critical to data integrity:
//
//   - numeric column (val_vda)             -> 0
//   - text columns (names/categories)      -> NULL
//
// A null depto/secao/grupo/subgrupo MUST stay NULL. If it falls back to `0`,
// MariaDB coerces the number to the string "0" in the VARCHAR, and that "0"
// leaks into filter_hierarchy and the rankings (bySubgrupo etc.) as if it
// were a real category.
//
// val_vda is the only measure: the GPA export doesn't carry quantity, cost,
// returns, or margin (verified across the 68 spreadsheets in data/). The
// corresponding columns were removed in migration 0002.

export const STAGING_COLS = [
  "sale_date",
  "batch_id",
  "store_code",
  "store_name",
  "prod_code",
  "prod_name",
  "depto",
  "secao",
  "grupo",
  "subgrupo",
  "val_vda",
] as const;

// Numeric columns: default to 0 when missing. Everything else is text (default NULL).
const NUMERIC_COLS = new Set<string>(["val_vda"]);

/** Default value for a staging column when it's missing/null in the source. */
export function stagingCellDefault(col: string): 0 | null {
  return NUMERIC_COLS.has(col) ? 0 : null;
}

/**
 * Builds the positional row for the staging_sales INSERT, filling in
 * sale_date/batch_id and applying the correct default per column type.
 */
export function toStagingRow(
  row: Record<string, unknown>,
  batchId: string,
  saleDate: string,
): unknown[] {
  return STAGING_COLS.map((c) => {
    if (c === "sale_date") return saleDate;
    if (c === "batch_id") return batchId;
    return row[c] ?? stagingCellDefault(c);
  });
}
