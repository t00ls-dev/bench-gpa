/**
 * RFC 6266: Content-Disposition is Latin-1/ASCII by definition, and an
 * accented (or otherwise non-ASCII) filename dropped straight into the
 * header turns into garbage for the browser. `filename` is the ASCII-only
 * fallback; `filename*=UTF-8''...` (percent-encoded) is what current
 * browsers actually use. Today `slugifyFilename` (export-pdf.ts) already
 * guarantees ASCII before it reaches whoever calls this, so this never
 * fires in practice, but it's new code and costs nothing to get right for
 * any future caller.
 */
export function contentDispositionHeader(filename: string): string {
  const asciiFallback = filename.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
