const FALLBACK = "/";

/**
 * `next` só é confiável se, depois de resolvido pelo parser de URL, aponta
 * pra a mesma origem: comparar prefixos da string crua (`startsWith("/")`,
 * `!startsWith("//")`) não basta: o parser WHATWG normaliza `\` para `/` e
 * remove tab/quebra de linha antes de resolver a URL, então strings como
 * "/\\evil.com" ou "/\t/evil.com" passam num check de prefixo mas resolvem
 * pra uma origem externa. Deixar o próprio parser resolver e comparar o
 * `.origin` final é imune a qualquer variação desse truque de normalização,
 * em vez de tentar adivinhar caso a caso.
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
