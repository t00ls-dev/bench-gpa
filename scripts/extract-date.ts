#!/usr/bin/env bun
import { readFileSync } from "node:fs";
import { parseAnyWorkbook } from "../src/lib/xlsx-parser";

export function isValidDate(y: string, m: string, d: string): boolean {
  const year = parseInt(y, 10);
  const month = parseInt(m, 10);
  const day = parseInt(d, 10);
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  if (year < 2000 || year > 2099) return false;
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function extractDateFromFilename(filename: string): string | null {
  const base = filename.replace(/\.xlsx?$/i, "");

  // YYYY-MM-DD anywhere in name
  const ymd = base.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (ymd && isValidDate(ymd[1], ymd[2], ymd[3])) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;

  // DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY anywhere in name
  const dmy = base.match(/(\d{2})[-./](\d{2})[-./](\d{4})/);
  if (dmy && isValidDate(dmy[3], dmy[2], dmy[1])) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;

  // 8+ digit sequences — try DDMMYYYY then YYYYMMDD
  const seqs = base.match(/\d{8,}/g) || [];
  for (const seq of seqs) {
    const [d1, m1, y1] = [seq.slice(0, 2), seq.slice(2, 4), seq.slice(4, 8)];
    if (isValidDate(y1, m1, d1)) return `${y1}-${m1}-${d1}`;

    const [y2, m2, d2] = [seq.slice(0, 4), seq.slice(4, 6), seq.slice(6, 8)];
    if (isValidDate(y2, m2, d2)) return `${y2}-${m2}-${d2}`;
  }

  return null;
}

export function extractDateFromXLSX(filePath: string): string | null {
  try {
    const buffer = readFileSync(filePath).buffer;
    const parsed = parseAnyWorkbook(buffer);
    return parsed.sale_date;
  } catch {
    return null;
  }
}

export function extractDate(filePath: string): string | null {
  const filename = filePath.split("/").pop() || filePath;
  const fromName = extractDateFromFilename(filename);
  if (fromName) return fromName;
  return extractDateFromXLSX(filePath);
}

// CLI mode
if (import.meta.path === Bun.main) {
  const filePath = process.argv[2];
  if (!filePath || filePath === "--help") {
    console.error("Uso: bun run scripts/extract-date.ts <arquivo.xlsx>");
    process.exit(1);
  }
  const date = extractDate(filePath);
  if (date) console.log(date);
  else process.exit(1);
}
