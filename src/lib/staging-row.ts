// Layout de colunas da tabela staging_sales, compartilhado pelo import via CLI
// (scripts/import.ts). O default de cada coluna ausente na linha de origem é
// crítico para a integridade dos dados:
//
//   - coluna numérica (val_vda)            -> 0
//   - colunas de texto (nomes/categorias)  -> NULL
//
// Um depto/secao/grupo/subgrupo nulo TEM de permanecer NULL. Se cair num
// default `0`, o MariaDB coage o número para a string "0" no VARCHAR e esse
// "0" vaza para a filter_hierarchy e para os rankings (bySubgrupo etc.) como
// se fosse uma categoria real.
//
// val_vda é a única medida: o export do GPA não traz quantidade, custo,
// devolução nem margem (verificado nas 68 planilhas de data/). As colunas
// correspondentes foram removidas na migration 0002.

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

// Colunas numéricas: default 0 quando ausentes. Todo o resto é texto (default NULL).
const NUMERIC_COLS = new Set<string>(["val_vda"]);

/** Valor default de uma coluna do staging quando ela está ausente/nula na origem. */
export function stagingCellDefault(col: string): 0 | null {
  return NUMERIC_COLS.has(col) ? 0 : null;
}

/**
 * Monta a linha posicional para o INSERT em staging_sales, preenchendo
 * sale_date/batch_id e aplicando o default correto por tipo de coluna.
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
