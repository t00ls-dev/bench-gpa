type CacheKeyValue = string | number | boolean | null | undefined | readonly string[];

export function buildCacheKey(namespace: string, fields: Record<string, CacheKeyValue>): string {
  const normalized = Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [
      key,
      Array.isArray(value) ? [...value].sort() : (value ?? null),
    ]),
  );
  return `${namespace}:${JSON.stringify(normalized)}`;
}
