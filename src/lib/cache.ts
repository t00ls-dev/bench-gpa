/**
 * TTLs nomeados. Os valores estavam soltos nas chamadas de `cache.wrap`:
 * `300_000` repetido em três arquivos sem nada que os ligasse, e o de 60s
 * INVISÍVEL: quem chamava `wrap(key, fn)` sem o terceiro argumento caía no
 * default do SimpleCache, então era impossível saber o TTL lendo a chamada.
 *
 * A escolha entre os dois é sobre o que invalida o dado, não sobre "quanto
 * tempo parece razoável":
 *
 * - `CACHE_TTL_SHORT` para o que muda a cada import (métricas, rankings,
 *   listagens, datas importadas). Um minuto de defasagem após um import é
 *   aceitável; mais que isso começa a confundir quem acabou de subir a planilha.
 * - `CACHE_TTL_LONG` para o que só muda quando a hierarquia muda (opções de
 *   filtro, hierarquia da área) e para o veredito de admin: coisas que passam
 *   dias iguais.
 */
export const CACHE_TTL_SHORT = 60_000;
export const CACHE_TTL_LONG = 300_000;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class SimpleCache {
  private store = new Map<string, CacheEntry<unknown>>();
  private pending = new Map<string, Promise<unknown>>();
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor(private defaultTtlMs: number = 60_000) {
    this.cleanupTimer = setInterval(() => this.cleanup(), 30_000);
    if (this.cleanupTimer.unref) this.cleanupTimer.unref();
  }

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry || Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs?: number): void {
    this.store.set(key, { value, expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs) });
  }

  async wrap<T>(key: string, fn: () => Promise<T>, ttlMs?: number): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== undefined) return cached;

    const inFlight = this.pending.get(key);
    if (inFlight) return inFlight as Promise<T>;

    const promise = fn()
      .then((result) => {
        this.set(key, result, ttlMs);
        return result;
      })
      .finally(() => this.pending.delete(key));

    this.pending.set(key, promise);
    return promise;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) this.store.delete(key);
    }
  }

  destroy(): void {
    clearInterval(this.cleanupTimer);
  }
}

export const cache = new SimpleCache();
