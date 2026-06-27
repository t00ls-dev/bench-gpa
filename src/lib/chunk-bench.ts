// Lightweight client-side benchmark to pick an optimal import chunk size.
// Runs transparently during the first import and caches the winner in
// localStorage. The cache is invalidated when the app version or the
// browser user-agent changes.

const KEY = "bench-gpa:chunk-bench:v1";
const VERSION = 1;

export const CANDIDATE_SIZES = [200, 400, 800, 1500] as const;
export const DEFAULT_CHUNK = 400;

interface ChunkBenchCache {
  version: number;
  ua: string;
  chunkSize: number;
  ts: number;
}

function safeUA(): string {
  try {
    return typeof navigator !== "undefined" ? navigator.userAgent : "";
  } catch {
    return "";
  }
}

export function loadChunkSize(): number | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as ChunkBenchCache;
    if (c.version !== VERSION) return null;
    if (c.ua !== safeUA()) return null;
    if (!CANDIDATE_SIZES.includes(c.chunkSize as (typeof CANDIDATE_SIZES)[number])) return null;
    return c.chunkSize;
  } catch {
    return null;
  }
}

export function saveChunkSize(chunkSize: number): void {
  try {
    const c: ChunkBenchCache = { version: VERSION, ua: safeUA(), chunkSize, ts: Date.now() };
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    // ignore quota / unavailable
  }
}

export interface BenchSample {
  size: number;
  rowsPerMs: number;
}

export function pickBest(samples: BenchSample[]): number {
  if (samples.length === 0) return DEFAULT_CHUNK;
  return samples.reduce((a, b) => (b.rowsPerMs > a.rowsPerMs ? b : a)).size;
}
