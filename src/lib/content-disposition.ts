/**
 * RFC 6266: Content-Disposition é Latin-1/ASCII por definição — um filename
 * com acento (ou qualquer não-ASCII) direto no header vira lixo pro
 * navegador. `filename` é o fallback ASCII-only; `filename*=UTF-8''...`
 * (percent-encoded) é o que os navegadores atuais realmente usam. Hoje
 * `slugifyFilename` (export-pdf.ts) já garante ASCII antes de chegar em
 * quem chama isto, então isto nunca dispara na prática — mas é código novo
 * e não custa nada deixar certo pra qualquer chamador futuro.
 */
export function contentDispositionHeader(filename: string): string {
  const asciiFallback = filename.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
