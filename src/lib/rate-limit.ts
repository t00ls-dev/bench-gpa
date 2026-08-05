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
  ) {
    this.cleanupTimer = setInterval(() => this.cleanup(), 60_000);
    if (this.cleanupTimer.unref) this.cleanupTimer.unref();
  }

  /**
   * A ordem dos dois orçamentos importa: o teto por IP é avaliado PRIMEIRO e,
   * se já reprovar, a requisição sai sem tocar o contador global.
   *
   * Antes os dois contadores eram incrementados de uma vez, antes de qualquer
   * veredito: então as rejeições do próprio abusador continuavam empurrando o
   * contador compartilhado. Com o authLimiter (10/IP, 40 global), bastava um
   * curl em loop de um único IP: as 10 primeiras passavam, da 11ª em diante
   * eram rejeitadas mas seguiam somando, e ao chegar em 41 o login caía para
   * TODOS os usuários: um atacante amplificado para 100% da base, sem botnet.
   *
   * Com o curto-circuito, a contribuição máxima de um IP para o orçamento
   * global é maxPerIp. O teto global volta a ser o que deveria ser: um
   * disjuntor de carga agregada, que só dispara com tráfego de fato
   * distribuído.
   */
  check(ip: string): { allowed: boolean; remaining: number; resetAt: number } {
    const now = Date.now();

    let ipEntry = this.windows.get(ip);
    if (!ipEntry || now > ipEntry.resetAt) {
      ipEntry = { count: 0, resetAt: now + this.windowMs };
      this.windows.set(ip, ipEntry);
    }
    ipEntry.count++;

    if (ipEntry.count > this.maxPerIp) {
      return { allowed: false, remaining: 0, resetAt: ipEntry.resetAt };
    }

    let gEntry = this.globalWindows.get("global");
    if (!gEntry || now > gEntry.resetAt) {
      gEntry = { count: 0, resetAt: now + this.windowMs };
      this.globalWindows.set("global", gEntry);
    }
    gEntry.count++;

    if (gEntry.count > this.maxGlobal) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: Math.max(ipEntry.resetAt, gEntry.resetAt),
      };
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
 * Ordem de confiança (atrás do Cloudflare, X-Forwarded-For[0] é FALSIFICÁVEL,
 * já que o CF apenas acrescenta o IP do visitante, então o primeiro salto pode ser
 * forjado pelo cliente; por isso os headers do próprio CF vêm primeiro):
 *   1. CF-Connecting-IP: Cloudflare padrão (sobrescrito pelo CF)
 *   2. True-Client-IP: Cloudflare Enterprise
 *   3. X-Real-IP: nginx de origem, acesso direto sem CF
 *   4. X-Forwarded-For: último recurso (primeiro salto)
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

/**
 * Janela de contagem dos quatro tiers. Um minuto em todos: o valor estava
 * repetido literal em cada construção, dando a impressão de serem ajustáveis
 * separadamente quando na prática nunca divergiram.
 */
const RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * Tetos por tier: `[porIp, global]`.
 *
 * Não afrouxar sem medir: a VPS tem um núcleo e dois usuários reais. O teto do
 * `auth` é o mais sensível: cada tentativa de login custa um bcrypt de custo 12
 * (ver BCRYPT_COST em auth-config.ts), que satura o núcleo sozinho.
 *
 * O teto global é um disjuntor de carga agregada, não um limite por usuário: a
 * contribuição máxima de um IP para ele é o próprio teto por IP, graças ao
 * curto-circuito documentado em `check()`.
 *
 * `auth` afrouxado de [10, 40] para [15, 60] (mesma proporção ~4x): as duas
 * rotas que recebem tráfego anônimo neste tier (login, primeiro acesso) já
 * exigem Turnstile antes de aceitar a tentativa, cobrindo a parte
 * automatizada do problema -- este teto por IP é a defesa que sobra. Também
 * apoiado no que já está registrado em docs/medicao-performance.md (entrada
 * de 2026-08-04): em cluster mode (2 workers) o contador já é diluído por
 * processo e o gargalo real continua sendo a CPU compartilhada, não o
 * contador -- subir o teto não aumenta o número de bcrypt/s que a VPS
 * consegue de fato processar. `changePassword` também usa este tier mas só é
 * alcançável por quem já tem sessão válida (`requireAuthAllowExpiredPassword`
 * roda antes do rate limit no middleware), então o afrouxamento não abre
 * superfície nova para tráfego anônimo ali.
 */
const RATE_LIMITS = {
  api: [300, 1000],
  auth: [15, 60],
  upload: [200, 500],
  ssr: [300, 1500],
} as const;

export const apiLimiter = new RateLimiter(RATE_LIMIT_WINDOW_MS, ...RATE_LIMITS.api);
export const authLimiter = new RateLimiter(RATE_LIMIT_WINDOW_MS, ...RATE_LIMITS.auth);
export const uploadLimiter = new RateLimiter(RATE_LIMIT_WINDOW_MS, ...RATE_LIMITS.upload);
export const ssrLimiter = new RateLimiter(RATE_LIMIT_WINDOW_MS, ...RATE_LIMITS.ssr);

/**
 * Balde por conta, independente do `authLimiter` acima (que é por IP). Cobre
 * o caso em que um ataque de credential stuffing distribui as tentativas
 * contra UMA conta por vários IPs: cada IP isolado nunca estoura o teto de
 * 10/min do authLimiter, mas a conta-alvo continua recebendo tentativa atrás
 * de tentativa.
 *
 * Janela deliberadamente mais longa (15min) que os outros tiers: o objetivo
 * aqui não é o throughput agregado da VPS (isso já é papel do authLimiter):
 * é conter quem já sabe qual conta está mirando, mesmo trocando de IP a cada
 * request. `maxGlobal` como `Number.MAX_SAFE_INTEGER` desliga de propósito o
 * segundo tier da classe (o disjuntor de carga agregada já existe no
 * authLimiter); este balde só precisa do teto por chave.
 *
 * A chave é `user:<id>` quando a conta é resolvida (não a string digitada):
 * alternar entre login por username e por matrícula da MESMA conta não pode
 * resetar o balde, e `id` nunca muda mesmo que o admin edite o username
 * depois. Conta não encontrada usa `identifier:<bruto>` como chave, mantendo
 * a mesma cobertura contra brute-force de conta inexistente.
 *
 * 10 (não menos): tanto login quanto primeiro acesso já exigem Turnstile
 * antes de aceitar a tentativa, o que cobre a parte automatizada do
 * problema; este balde é a defesa que sobra contra um humano/script
 * insistindo numa conta específica. 10/15min dá folga real para erro de
 * digitação sem abrir mão dessa contenção.
 */
const AUTH_ACCOUNT_WINDOW_MS = 15 * 60_000;
const AUTH_ACCOUNT_MAX_PER_KEY = 10;
export const authAccountLimiter = new RateLimiter(
  AUTH_ACCOUNT_WINDOW_MS,
  AUTH_ACCOUNT_MAX_PER_KEY,
  Number.MAX_SAFE_INTEGER,
);
