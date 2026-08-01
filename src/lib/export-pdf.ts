import type jsPDF from "jspdf";

const COMBINING_DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g");

/** Deixa uma string segura pra usar como nome de arquivo: sem acento, sem
 * espaço, sem caractere que o sistema de arquivos rejeite. */
export function slugifyFilename(s: string): string {
  return s
    .normalize("NFD")
    .replace(COMBINING_DIACRITICS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Anchor persistente só pro caminho de preview (abrir em nova aba) — nunca
// teve o bug de nome de arquivo, então continua com blob: URL local. O
// caminho de download forçado (com filename) não usa mais anchor nenhum, ver
// openPdfBlob abaixo.
let previewAnchor: HTMLAnchorElement | undefined;

function getPreviewAnchor(): HTMLAnchorElement {
  if (!previewAnchor) {
    previewAnchor = document.createElement("a");
    previewAnchor.style.display = "none";
    document.body.appendChild(previewAnchor);
  }
  return previewAnchor;
}

/**
 * Sem `filename`: abre o PDF numa aba nova pra preview (blob: URL local,
 * como sempre funcionou).
 *
 * Com `filename`: passa pelo servidor (`/api/pdf-download` em src/server.ts)
 * pra baixar com `Content-Disposition: attachment` de verdade, em vez de
 * confiar no atributo `download` numa blob: URL do lado do cliente. Duas
 * correções anteriores (anchor anexado ao DOM antes do clique;
 * `dispatchEvent(MouseEvent)` em vez de `.click()`) não bastaram — o
 * problema real é mais fundo: o gerenciador de download do Firefox não
 * confia no atributo `download` pra blob: URLs em vários casos, caindo pro
 * UUID da própria blob URL como nome (Mozilla Bugzilla #1282407).
 * Content-Disposition é metadado de uma resposta HTTP real, respeitado de
 * forma confiável por todo navegador — não depende de nenhum truque de
 * anchor/blob do lado do cliente.
 */
export async function openPdfBlob(doc: jsPDF, filename?: string): Promise<void> {
  const blob = doc.output("blob");

  if (!filename) {
    const url = URL.createObjectURL(blob);
    const a = getPreviewAnchor();
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return;
  }

  const res = await fetch("/api/pdf-download", {
    method: "POST",
    headers: { "x-filename": encodeURIComponent(filename) },
    body: blob,
  });
  if (!res.ok) throw new Error("Falha ao preparar o download do PDF.");
  const { url } = (await res.json()) as { url: string };
  window.location.href = url;
}
