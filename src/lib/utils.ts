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

export function fmtDT(iso: string): string {
  const d = new Date(iso);
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

export function fmtBRShort(input: string | Date | null | undefined): string {
  if (!input) return "(sem)";
  let y: number, m: number, d: number;
  if (typeof input === "string") {
    const [Y, M, D] = input.slice(0, 10).split("-");
    if (!Y || !M || !D) return "(sem)";
    y = Number(Y);
    m = Number(M);
    d = Number(D);
  } else {
    y = input.getFullYear();
    m = input.getMonth() + 1;
    d = input.getDate();
  }
  return `${pad2(d)}/${pad2(m)}/${String(y).slice(-2)}`;
}
