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
