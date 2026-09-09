// Parser for GPA sales export (DTA_VENDA matrix).
import * as XLSX from "xlsx";

interface ParsedSale {
  store_code: string;
  store_name: string;
  depto: string | null;
  secao: string | null;
  grupo: string | null;
  subgrupo: string | null;
  prod_code: string;
  prod_name: string;
  val_vda: number;
}

export interface ParsedSalesFile {
  kind: "sales";
  sale_date: string; // YYYY-MM-DD
  sales: ParsedSale[];
  stores: Array<{ store_code: string; store_name: string }>;
  products: Array<{ prod_code: string; prod_name: string }>;
}

const TRUNCATED_EXPORT_MESSAGE =
  "Exported data exceeded the allowed volume. Some data may have been omitted.";
const FILTERS_PREFIX = "Filtros aplicados:";
const SALES_FILTERS_RX =
  /^Filtros aplicados:\nFormato é PAO DE ACUCAR\nREGIONAL é PA RIO DE JANEIRO\nANO é (\d{4})\nMES é ([1-9]|1[0-2])\nDTA_VENDA é (\d{2})\/(\d{2})\/(\d{4})$/;

function validateSalesFilters(rows: unknown[][]): string {
  for (const row of rows) {
    for (const cell of row) {
      if (typeof cell === "string" && cell.includes(TRUNCATED_EXPORT_MESSAGE)) {
        throw new Error(
          "O arquivo está incompleto: a exportação excedeu o volume permitido e pode ter omitido dados.",
        );
      }
    }
  }

  const filterFooters: string[] = [];
  for (const row of rows) {
    for (const cell of row) {
      if (typeof cell === "string" && cell.startsWith(FILTERS_PREFIX)) {
        filterFooters.push(cell.replace(/\r\n/g, "\n").trim());
      }
    }
  }

  if (filterFooters.length === 0) {
    throw new Error("Rodapé 'Filtros aplicados:' não encontrado no arquivo de vendas.");
  }
  if (filterFooters.length > 1) {
    throw new Error("O arquivo contém mais de um rodapé de filtros.");
  }

  const match = filterFooters[0].match(SALES_FILTERS_RX);
  if (!match) {
    throw new Error(
      "Os filtros aplicados não correspondem ao relatório esperado. Exporte sem filtros adicionais.",
    );
  }

  const [, filterYear, filterMonth, day, month, year] = match;
  if (filterYear !== year || Number(filterMonth) !== Number(month)) {
    throw new Error("ANO e MES dos filtros não correspondem à DTA_VENDA.");
  }

  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() + 1 !== Number(month) ||
    date.getUTCDate() !== Number(day)
  ) {
    throw new Error("DTA_VENDA inválida no rodapé de filtros.");
  }

  return `${year}-${month}-${day}`;
}

function splitCodeName(s: unknown): { code: string; name: string } | null {
  if (!s) return null;
  const trimmed = String(s).trim();
  const idx = trimmed.indexOf("-");
  if (idx <= 0) return null;
  const code = trimmed.slice(0, idx).trim();
  const name = trimmed.slice(idx + 1).trim();
  if (!/^\d+$/.test(code)) return null;
  return { code, name };
}

/**
 * Converts a cell to a number, assuming the GPA export's pt-BR format: dot
 * separates thousands, comma separates decimals ("1.234,56" -> 1234.56).
 *
 * In practice XLSX almost always delivers a `number` (we read with
 * `raw: true`), which is why the `.replace(",", ".")` bug (which only
 * swapped the FIRST comma and left the thousands dots in place, turning
 * "1.234,56" into 1.234) never showed up. All it takes is one column
 * formatted as text at the source for values to arrive as strings and the
 * day's total to come out a thousand times smaller.
 *
 * Exported for direct testing: there are too many thousands/decimal
 * combinations to cover through `parseAnyWorkbook` alone.
 */
export function parseCellNumber(v: unknown): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return isFinite(v) ? v : 0;

  // Discards anything that isn't part of the number: "R$", spaces
  // (including NBSP), etc.
  const s = String(v)
    .trim()
    .replace(/[^\d,.-]/g, "");
  if (!s) return 0;

  let normalized = s;
  if (s.includes(",")) {
    // Has a comma -> it's the decimal (the last one, if there's more than
    // one) and every dot before it is a thousands separator.
    const dec = s.lastIndexOf(",");
    normalized = s.slice(0, dec).replace(/[.,]/g, "") + "." + s.slice(dec + 1);
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    // Only dots, all delimiting groups of exactly 3 digits -> thousands.
    // "1.234" is 1234; but "1.23" and "1.2345" are still decimals.
    normalized = s.replace(/\./g, "");
  }

  const n = parseFloat(normalized);
  return isFinite(n) ? n : 0;
}

export function parseAnyWorkbook(buffer: ArrayBuffer): ParsedSalesFile {
  const wb = XLSX.read(buffer, { type: "array", cellDates: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true });
  return parseSalesRows(rows);
}

function parseSalesRows(rows: unknown[][]): ParsedSalesFile {
  const dateIso = validateSalesFilters(rows);

  const headerLojas = rows[0];
  const stores: Array<{ idx: number; code: string; name: string }> = [];
  for (let c = 5; c < headerLojas.length; c++) {
    const v = headerLojas[c];
    if (typeof v !== "string") continue;
    if (v.trim() === "Total") continue;
    const cn = splitCodeName(v);
    if (cn) stores.push({ idx: c, code: cn.code, name: cn.name });
  }

  let depto: string | null = null;
  let secao: string | null = null;
  let grupo: string | null = null;
  let subgrupo: string | null = null;

  const sales: ParsedSale[] = [];
  const productMap = new Map<string, string>();

  const isVal = (v: unknown): v is string =>
    typeof v === "string" && v.trim() !== "" && v.trim() !== "Total";

  for (let r = 2; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;
    const c0 = row[0];
    const c1 = row[1];
    const c2 = row[2];
    const c3 = row[3];
    const c4 = row[4];
    if (typeof c0 === "string" && c0.trim() === "Total" && c1 == null) continue;
    if (isVal(c0) && c1 != null && String(c1).trim() === "Total") {
      depto = String(c0).trim();
      secao = null;
      grupo = null;
      subgrupo = null;
      continue;
    }
    if (isVal(c1) && c2 != null && String(c2).trim() === "Total") {
      secao = String(c1).trim();
      grupo = null;
      subgrupo = null;
      continue;
    }
    if (isVal(c2) && c3 != null && String(c3).trim() === "Total") {
      grupo = String(c2).trim();
      subgrupo = null;
      continue;
    }
    if (isVal(c3) && c4 != null && String(c4).trim() === "Total") {
      subgrupo = String(c3).trim();
      continue;
    }

    if (typeof c4 === "string") {
      const cn = splitCodeName(c4);
      if (!cn) continue;
      productMap.set(cn.code, cn.name);
      for (const st of stores) {
        const v = row[st.idx];
        const n = parseCellNumber(v);
        if (n === 0) continue;
        sales.push({
          store_code: st.code,
          store_name: st.name,
          depto,
          secao,
          grupo,
          subgrupo,
          prod_code: cn.code,
          prod_name: cn.name,
          val_vda: Math.round(n * 100) / 100,
        });
      }
    }
  }

  return {
    kind: "sales",
    sale_date: dateIso,
    sales,
    stores: stores.map((s) => ({ store_code: s.code, store_name: s.name })),
    products: Array.from(productMap, ([prod_code, prod_name]) => ({ prod_code, prod_name })),
  };
}
