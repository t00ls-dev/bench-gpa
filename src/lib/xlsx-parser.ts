// Parsers for the GPA exports: sales (DTA_VENDA matrix) and stock (Pique columns).
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

export interface ParsedSalesFile {
  kind: "sales";
  sale_date: string; // YYYY-MM-DD
  sales: ParsedSale[];
  stores: Array<{ store_code: string; store_name: string }>;
  products: Array<{ prod_code: string; prod_name: string }>;
}

export interface ParsedStockRow {
  store_code: string;
  store_name: string;
  prod_code: string;
  prod_name: string;
  depto: string | null;
  qtd_estoque: number;
  valor_estoq: number;
}

export interface ParsedStockFile {
  kind: "stock";
  stock_date: string; // YYYY-MM-DD
  rows: ParsedStockRow[];
  stores: Array<{ store_code: string; store_name: string }>;
  products: Array<{ prod_code: string; prod_name: string }>;
}

export type ParsedFile = ParsedSalesFile | ParsedStockFile;

const DATE_RX = /DTA_VENDA\s+é\s+(\d{2})\/(\d{2})\/(\d{4})/i;

function findSalesDate(rows: unknown[][]): string | null {
  for (const row of rows) {
    for (const cell of row) {
      if (typeof cell === "string") {
        const m = cell.match(DATE_RX);
        if (m) return `${m[3]}-${m[2]}-${m[1]}`;
      }
    }
  }
  return null;
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

// Excel serial date (1900 system) → YYYY-MM-DD
function excelSerialToISO(serial: number): string {
  const d = XLSX.SSF.parse_date_code(serial);
  if (!d) throw new Error("Data inválida no Pique");
  const mm = String(d.m).padStart(2, "0");
  const dd = String(d.d).padStart(2, "0");
  return `${d.y}-${mm}-${dd}`;
}

function toISODate(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "number") return excelSerialToISO(v);
  if (v instanceof Date) {
    const mm = String(v.getMonth() + 1).padStart(2, "0");
    const dd = String(v.getDate()).padStart(2, "0");
    return `${v.getFullYear()}-${mm}-${dd}`;
  }
  if (typeof v === "string") {
    const s = v.trim();
    const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m2) return s.slice(0, 10);
  }
  return null;
}

function num(v: unknown): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return isFinite(v) ? v : 0;
  const n = parseFloat(String(v).replace(",", "."));
  return isFinite(n) ? n : 0;
}

// Detect file kind by header signature
export function parseAnyWorkbook(buffer: ArrayBuffer): ParsedFile {
  const wb = XLSX.read(buffer, { type: "array", cellDates: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true });

  // Pique signature: first row contains LOJA + DATA + QTD ESTOQUE
  const header0 = (rows[0] ?? []).map((c) => (typeof c === "string" ? c.trim().toUpperCase() : ""));
  const isPique = header0.includes("LOJA") && header0.includes("DATA") && header0.includes("QTD ESTOQUE");

  if (isPique) return parsePiqueRows(rows, header0);
  return parseSalesRows(rows);
}

// Sales matrix parser (kept compatible with the existing flow).
function parseSalesRows(rows: unknown[][]): ParsedSalesFile {
  const dateIso = findSalesDate(rows);
  if (!dateIso) throw new Error("Marcador 'DTA_VENDA é DD/MM/AAAA' não encontrado no arquivo de vendas.");

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
    const c0 = row[0]; const c1 = row[1]; const c2 = row[2]; const c3 = row[3]; const c4 = row[4];
    if (typeof c0 === "string" && c0.trim() === "Total" && c1 == null) continue;
    if (isVal(c0) && c1 != null && String(c1).trim() === "Total") { depto = String(c0).trim(); secao=null;grupo=null;subgrupo=null; continue; }
    if (isVal(c1) && c2 != null && String(c2).trim() === "Total") { secao = String(c1).trim(); grupo=null;subgrupo=null; continue; }
    if (isVal(c2) && c3 != null && String(c3).trim() === "Total") { grupo = String(c2).trim(); subgrupo=null; continue; }
    if (isVal(c3) && c4 != null && String(c4).trim() === "Total") { subgrupo = String(c3).trim(); continue; }

    if (typeof c4 === "string") {
      const cn = splitCodeName(c4);
      if (!cn) continue;
      productMap.set(cn.code, cn.name);
      for (const st of stores) {
        const v = row[st.idx];
        const n = num(v);
        if (n === 0) continue;
        sales.push({
          store_code: st.code, store_name: st.name,
          depto, secao, grupo, subgrupo,
          prod_code: cn.code, prod_name: cn.name,
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

// Pique parser — extracts only stock fields.
function parsePiqueRows(rows: unknown[][], header: string[]): ParsedStockFile {
  const col = (name: string) => header.indexOf(name);
  const idxLoja = col("LOJA");
  const idxData = col("DATA");
  const idxPlu = col("COD_PLU");
  const idxNom = col("NOM_PROD");
  const idxDep = col("DEPARTAMENTO");
  const idxQtd = col("QTD ESTOQUE");
  const idxVal = col("VALOR ESTOQ");

  if ([idxLoja, idxData, idxPlu, idxNom, idxQtd].some((i) => i < 0)) {
    throw new Error("Colunas obrigatórias ausentes no arquivo Pique.");
  }

  const storesMap = new Map<string, string>();
  const productsMap = new Map<string, string>();
  const stockMap = new Map<string, ParsedStockRow>(); // key = store|prod
  let stockDate: string | null = null;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;

    const dataIso = toISODate(row[idxData]);
    if (!dataIso) continue;
    if (stockDate == null) stockDate = dataIso;
    // keep the most common (assume single date file); ignore mismatches
    if (dataIso !== stockDate) continue;

    const cn = splitCodeName(row[idxLoja]);
    if (!cn) continue;
    const prodCode = String(row[idxPlu] ?? "").trim();
    if (!prodCode) continue;
    const prodName = String(row[idxNom] ?? "").trim();
    const depto = idxDep >= 0 && row[idxDep] != null ? String(row[idxDep]).trim().replace(/^\s*\d+-\s*/, "") : null;
    const qtd = num(row[idxQtd]);
    const valor = idxVal >= 0 ? num(row[idxVal]) : 0;

    storesMap.set(cn.code, cn.name);
    productsMap.set(prodCode, prodName);

    const k = `${cn.code}|${prodCode}`;
    // sum duplicates just in case
    const prev = stockMap.get(k);
    if (prev) {
      prev.qtd_estoque += qtd;
      prev.valor_estoq += valor;
    } else {
      stockMap.set(k, {
        store_code: cn.code,
        store_name: cn.name,
        prod_code: prodCode,
        prod_name: prodName,
        depto,
        qtd_estoque: qtd,
        valor_estoq: valor,
      });
    }
  }

  if (!stockDate) throw new Error("Não foi possível identificar a DATA no arquivo Pique.");

  return {
    kind: "stock",
    stock_date: stockDate,
    rows: Array.from(stockMap.values()),
    stores: Array.from(storesMap, ([store_code, store_name]) => ({ store_code, store_name })),
    products: Array.from(productsMap, ([prod_code, prod_name]) => ({ prod_code, prod_name })),
  };
}

// Backwards-compatible alias used by older code paths.
export function parseWorkbook(buffer: ArrayBuffer): ParsedSalesFile {
  const out = parseAnyWorkbook(buffer);
  if (out.kind !== "sales") throw new Error("Arquivo não é de vendas (use parseAnyWorkbook).");
  return out;
}
