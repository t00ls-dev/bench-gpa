// Pure parser for the GPA pivoted export.
// Handles: hierarchical fill-down (depto/secao/grupo/subgrupo), product rows,
// per-store columns, extraction of DTA_VENDA é DD/MM/AAAA.
import * as XLSX from "xlsx";

export interface ParsedSale {
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

export interface ParsedFile {
  sale_date: string; // YYYY-MM-DD
  sales: ParsedSale[];
  stores: Array<{ store_code: string; store_name: string }>;
  products: Array<{ prod_code: string; prod_name: string }>;
}

const DATE_RX = /DTA_VENDA\s+é\s+(\d{2})\/(\d{2})\/(\d{4})/i;

function findDate(rows: unknown[][]): string {
  for (const row of rows) {
    for (const cell of row) {
      if (typeof cell === "string") {
        const m = cell.match(DATE_RX);
        if (m) return `${m[3]}-${m[2]}-${m[1]}`;
      }
    }
  }
  throw new Error("Marcador 'DTA_VENDA é DD/MM/AAAA' não encontrado no arquivo.");
}

// "1272-VIVEIROS DE CASTRO" => { code, name }
function splitCodeName(s: string): { code: string; name: string } | null {
  if (!s) return null;
  const trimmed = String(s).trim();
  const idx = trimmed.indexOf("-");
  if (idx <= 0) return null;
  const code = trimmed.slice(0, idx).trim();
  const name = trimmed.slice(idx + 1).trim();
  if (!/^\d+$/.test(code)) return null;
  return { code, name };
}

export function parseWorkbook(buffer: ArrayBuffer): ParsedFile {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true });

  const sale_date = findDate(rows);

  // Row 0: store columns. First 5 cells = Loja label + blanks; last col = "Total".
  const headerLojas = rows[0];
  const stores: Array<{ idx: number; code: string; name: string }> = [];
  for (let c = 5; c < headerLojas.length; c++) {
    const v = headerLojas[c];
    if (typeof v !== "string") continue;
    if (v.trim() === "Total") continue;
    const cn = splitCodeName(v);
    if (cn) stores.push({ idx: c, code: cn.code, name: cn.name });
  }

  // Walk data rows (skip 0 header lojas, 1 header NOM_*)
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

    const c0 = row[0]; // NOM_DEPTO
    const c1 = row[1]; // NOM_SECAO
    const c2 = row[2]; // NOM_GRUPO
    const c3 = row[3]; // NOM_SUBGRUPO
    const c4 = row[4]; // NOM_PROD

    // Skip the grand 'Total' summary row at the very bottom
    if (typeof c0 === "string" && c0.trim() === "Total" && c1 == null) continue;

    // Hierarchy level updates
    if (isVal(c0) && c1 != null && String(c1).trim() === "Total") {
      depto = String(c0).trim(); secao = null; grupo = null; subgrupo = null;
      continue;
    }
    if (isVal(c1) && c2 != null && String(c2).trim() === "Total") {
      secao = String(c1).trim(); grupo = null; subgrupo = null;
      continue;
    }
    if (isVal(c2) && c3 != null && String(c3).trim() === "Total") {
      grupo = String(c2).trim(); subgrupo = null;
      continue;
    }
    if (isVal(c3) && c4 != null && String(c4).trim() === "Total") {
      subgrupo = String(c3).trim();
      continue;
    }

    // Product row: c4 has "    CODE-DESC", others null
    if (typeof c4 === "string") {
      const cn = splitCodeName(c4);
      if (!cn) continue;
      const prod_code = cn.code;
      const prod_name = cn.name;
      productMap.set(prod_code, prod_name);
      for (const st of stores) {
        const v = row[st.idx];
        if (v == null || v === "") continue;
        const num = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
        if (!isFinite(num) || num === 0) continue;
        sales.push({
          store_code: st.code,
          store_name: st.name,
          depto, secao, grupo, subgrupo,
          prod_code, prod_name,
          val_vda: Math.round(num * 100) / 100,
        });
      }
    }
  }

  return {
    sale_date,
    sales,
    stores: stores.map((s) => ({ store_code: s.code, store_name: s.name })),
    products: Array.from(productMap, ([prod_code, prod_name]) => ({ prod_code, prod_name })),
  };
}
