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

/**
 * Humaniza um tamanho em bytes com unidades binárias (1024), escalando até a
 * maior unidade em que o valor fica >= 1, logo 1024 MB = 1 GB (GiB, rotulado
 * "GB" pela convenção de ferramentas de banco). Casas decimais crescem com a
 * unidade: 0 para B/kB, 1 para MB, 2 para GB/TB.
 */
export function fmtBytes(bytes: number): string {
  if (!bytes || bytes < 0) return "0 kB";
  const units = ["B", "kB", "MB", "GB", "TB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  const decimals = i <= 1 ? 0 : i === 2 ? 1 : 2;
  return `${v.toFixed(decimals)} ${units[i]}`;
}

// Fuso fixo (America/Sao_Paulo) em vez do fuso ambiente de onde o código
// roda: mesma filosofia de fmtBRL/fmtInt, que já fixam "pt-BR" em vez de
// depender do locale do navegador. Sem isto, `new Date(iso).getHours()`
// (getters locais) lê o horário do fuso de quem está rodando o código —
// servidor (UTC) no SSR, navegador do usuário (Brasil, UTC-3) na
// hidratação — produzindo strings diferentes pro mesmo instante e um erro
// real de hidratação no React (Sentry BENCH-GPA-Y, achado em 04/08/2026,
// ~4h depois de outro bug de hidratação distinto no mesmo dia). `iso` já
// chega sempre com sufixo "Z" (dateTimeStr() em api-types.ts usa
// toISOString()), então o parsing do instante em si nunca foi ambíguo —
// só a formatação dependia de onde o código roda.
const dtFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function fmtDT(iso: string | Date | null | undefined): string {
  if (!iso) return "(sem)";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "(sem)";
  const parts = Object.fromEntries(dtFormatter.formatToParts(d).map((p) => [p.type, p.value]));
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`;
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
