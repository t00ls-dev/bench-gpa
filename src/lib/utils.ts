import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formato compacto padrão para exibição visual: DD/MM/AA.
 * Aceita string ISO (YYYY-MM-DD) ou Date.
 */
export function fmtBRShort(input: string | Date | null | undefined): string {
  if (!input) return "(sem)";
  let y: number, m: number, d: number;
  if (typeof input === "string") {
    const [Y, M, D] = input.slice(0, 10).split("-");
    if (!Y || !M || !D) return "(sem)";
    y = Number(Y); m = Number(M); d = Number(D);
  } else {
    y = input.getFullYear(); m = input.getMonth() + 1; d = input.getDate();
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d)}/${pad(m)}/${String(y).slice(-2)}`;
}
