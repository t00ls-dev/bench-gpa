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
 * Humanizes a byte size using binary units (1024), scaling up to the
 * largest unit where the value stays >= 1, so 1024 MB = 1 GB (GiB, labeled
 * "GB" per database-tooling convention). Decimal places grow with the
 * unit: 0 for B/kB, 1 for MB, 2 for GB/TB.
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

// Fixed timezone (America/Sao_Paulo) instead of the runtime environment's
// timezone: same philosophy as fmtBRL/fmtInt, which already fix "pt-BR"
// instead of depending on the browser's locale. Without this,
// `new Date(iso).getHours()` (local getters) reads the timezone of whoever
// is running the code -- server (UTC) during SSR, the user's browser
// (Brazil, UTC-3) during hydration -- producing different strings for the
// same instant and a real React hydration error (Sentry BENCH-GPA-Y, found
// on 08/04/2026, ~4h after a distinct hydration bug on the same day).
// `iso` always arrives with a "Z" suffix already (dateTimeStr() in
// api-types.ts uses toISOString()), so parsing the instant itself was
// never ambiguous -- only the formatting depended on where the code runs.
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

const todayFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * "Today" (YYYY-MM-DD) in the Brasília timezone, never the runtime
 * environment's timezone -- same reason as fmtDT above:
 * `new Date().getDate()` (local getters) read on the server (UTC) and on
 * the client (Brazil) can diverge by a full day during a daily window
 * (~9pm-midnight Brasília time, when UTC has already rolled over to the
 * next day). Real risk only if some component that compares against
 * "today" renders during SSR/hydration; today none do (see
 * import-calendar.tsx), but fixing the timezone here avoids the trap if
 * that changes in the future (e.g. a tab becoming a URL deep-link).
 */
export function todayISOBrazil(): string {
  const parts = Object.fromEntries(
    todayFormatter.formatToParts(new Date()).map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function fmtBRL(n: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(n);
}

/**
 * Standard compact format for visual display: DD/MM/YY.
 * Accepts an ISO string (YYYY-MM-DD) or a Date.
 */
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
  } else if (input instanceof Date || typeof input === "number") {
    // Fixed timezone (todayFormatter, already used by todayISOBrazil
    // above), not local getters: Date/number here is always an absolute
    // instant (e.g. new Date(u.created_at) in admin-user-management.tsx),
    // and getFullYear()/getMonth()/getDate() read in the timezone of
    // whoever runs the code -- the same class of bug as fmtDT (Sentry
    // BENCH-GPA-Y), just in this specific branch (the `string` branch
    // above was already safe since it never goes through a Date at all).
    const dt = input instanceof Date ? input : new Date(input);
    if (isNaN(dt.getTime())) return "(sem)";
    const parts = Object.fromEntries(
      todayFormatter.formatToParts(dt).map((p) => [p.type, p.value]),
    );
    y = Number(parts.year);
    m = Number(parts.month);
    d = Number(parts.day);
  } else {
    return "(sem)";
  }
  return `${pad2(d)}/${pad2(m)}/${String(y).slice(-2)}`;
}
