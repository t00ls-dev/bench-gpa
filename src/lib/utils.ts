import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function fmtInt(n: number): string {
  return n.toLocaleString("pt-BR");
}

export function fmtDT(iso: string | Date | null | undefined): string {
  if (!iso) return "(sem)";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "(sem)";
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${String(d.getFullYear()).slice(-2)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * Formato compacto padrão para exibição visual: DD/MM/AA.
 * Aceita string ISO (YYYY-MM-DD) ou Date.
 */
export function fmtBRL(n: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(n);
}

export function fmtBRShort(input: string | Date | number | null | undefined): string {
  if (!input && input !== 0) return "(sem)";
  let y: number, m: number, d: number;
  if (typeof input === "string") {
    const cleaned = input.trim().slice(0, 10);
    const parts = cleaned.split("-");
    if (parts.length !== 3) return "(sem)";
    const [Y, M, D] = parts;
    if (!Y || !M || !D || !/^\d+$/.test(Y) || !/^\d+$/.test(M) || !/^\d+$/.test(D)) return "(sem)";
    y = Number(Y);
    m = Number(M);
    d = Number(D);
  } else if (input instanceof Date) {
    if (isNaN(input.getTime())) return "(sem)";
    y = input.getFullYear();
    m = input.getMonth() + 1;
    d = input.getDate();
  } else if (typeof input === "number") {
    const dt = new Date(input);
    if (isNaN(dt.getTime())) return "(sem)";
    y = dt.getFullYear();
    m = dt.getMonth() + 1;
    d = dt.getDate();
  } else {
    return "(sem)";
  }
  return `${pad2(d)}/${pad2(m)}/${String(y).slice(-2)}`;
}
