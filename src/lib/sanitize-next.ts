const FALLBACK = "/";

/**
 * `next` is only trustworthy if, once resolved by the URL parser, it points
 * to the same origin: comparing raw-string prefixes (`startsWith("/")`,
 * `!startsWith("//")`) isn't enough -- the WHATWG parser normalizes `\` to
 * `/` and strips tabs/newlines before resolving the URL, so strings like
 * "/\\evil.com" or "/\t/evil.com" pass a prefix check but resolve to an
 * external origin. Letting the parser itself resolve it and comparing the
 * final `.origin` is immune to any variation of that normalization trick,
 * instead of trying to guess case by case.
 */
export function sanitizeNext(next: unknown, origin: string): string {
  if (typeof next !== "string" || next === "") return FALLBACK;
  let url: URL;
  try {
    url = new URL(next, origin);
  } catch {
    return FALLBACK;
  }
  if (url.origin !== origin) return FALLBACK;
  return url.pathname + url.search + url.hash;
}
