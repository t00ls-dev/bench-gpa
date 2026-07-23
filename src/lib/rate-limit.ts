interface WindowEntry {
  count: number;
  resetAt: number;
}

export class RateLimiter {
  private windows = new Map<string, WindowEntry>();
  private globalWindows = new Map<string, WindowEntry>();
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor(
    private windowMs: number,
    private maxPerIp: number,
    private maxGlobal: number,
    private label: string,
  ) {
    this.cleanupTimer = setInterval(() => this.cleanup(), 60_000);
    if (this.cleanupTimer.unref) this.cleanupTimer.unref();
  }

  check(ip: string): { allowed: boolean; remaining: number; resetAt: number } {
    const now = Date.now();

    const entry = this.windows.get(ip);
    if (!entry || now > entry.resetAt) {
      this.windows.set(ip, { count: 1, resetAt: now + this.windowMs });
    } else {
      entry.count++;
    }

    const globalEntry = this.globalWindows.get("global");
    if (!globalEntry || now > globalEntry.resetAt) {
      this.globalWindows.set("global", { count: 1, resetAt: now + this.windowMs });
    } else {
      globalEntry.count++;
    }

    const ipEntry = this.windows.get(ip)!;
    const gEntry = this.globalWindows.get("global")!;

    if (ipEntry.count > this.maxPerIp || gEntry.count > this.maxGlobal) {
      const resetAt = Math.max(ipEntry.resetAt, gEntry.resetAt);
      return { allowed: false, remaining: 0, resetAt };
    }

    return {
      allowed: true,
      remaining: Math.min(this.maxPerIp - ipEntry.count, this.maxGlobal - gEntry.count),
      resetAt: Math.min(ipEntry.resetAt, gEntry.resetAt),
    };
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.windows) {
      if (now > entry.resetAt) this.windows.delete(key);
    }
    for (const [key, entry] of this.globalWindows) {
      if (now > entry.resetAt) this.globalWindows.delete(key);
    }
  }

  destroy() {
    clearInterval(this.cleanupTimer);
  }
}

/** Normaliza um IP: tira espaços, porta (1.2.3.4:5678) e prefixo IPv4-mapeado. */
function normalizeIp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let ip = raw.trim();
  if (!ip) return null;
  // IPv4-mapeado em IPv6: ::ffff:1.2.3.4 → 1.2.3.4
  ip = ip.replace(/^::ffff:/i, "");
  // Remove porta de IPv4 (1.2.3.4:5678); IPv6 fica intacto (contém vários ":").
  if (ip.includes(".") && ip.includes(":")) ip = ip.split(":")[0];
  return ip || null;
}

/**
 * IP real do cliente cobrindo múltiplos cenários de proxy.
 *
 * Ordem de confiança (atrás do Cloudflare, X-Forwarded-For[0] é FALSIFICÁVEL —
 * o CF apenas acrescenta o IP do visitante, então o primeiro salto pode ser
 * forjado pelo cliente; por isso os headers do próprio CF vêm primeiro):
 *   1. CF-Connecting-IP  — Cloudflare padrão (sobrescrito pelo CF)
 *   2. True-Client-IP    — Cloudflare Enterprise
 *   3. X-Real-IP         — nginx de origem, acesso direto sem CF
 *   4. X-Forwarded-For   — último recurso (primeiro salto)
 *
 * Observação de infra: para confiar plenamente no CF-Connecting-IP, a origem
 * deve aceitar tráfego só do Cloudflare (allowlist de faixas de IP do CF ou
 * Authenticated Origin Pulls); caso contrário, um acesso direto à VPS poderia
 * forjar esse header.
 */
export function getClientIp(request?: Request): string {
  if (!request) return "unknown";
  const h = request.headers;
  const candidate =
    normalizeIp(h.get("cf-connecting-ip")) ??
    normalizeIp(h.get("true-client-ip")) ??
    normalizeIp(h.get("x-real-ip")) ??
    normalizeIp(h.get("x-forwarded-for")?.split(",")[0]);
  return candidate ?? "unknown";
}

export const apiLimiter = new RateLimiter(60_000, 300, 1000, "api");
export const authLimiter = new RateLimiter(60_000, 10, 40, "auth");
export const uploadLimiter = new RateLimiter(60_000, 200, 500, "upload");
export const ssrLimiter = new RateLimiter(60_000, 300, 1500, "ssr");
