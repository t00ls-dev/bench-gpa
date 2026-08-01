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

export function openPdfBlob(doc: jsPDF, filename?: string) {
  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  if (filename) {
    // Com `download` setado, o clique baixa o arquivo direto (com este nome)
    // em vez de abrir uma aba de preview — `target`/`rel` não fazem sentido
    // nesse caso.
    a.download = filename;
  } else {
    a.target = "_blank";
    a.rel = "noopener noreferrer";
  }
  // Firefox só respeita `download` se o <a> estiver na árvore do documento no
  // momento do clique — fora do DOM, ele cai pro comportamento padrão de
  // navegação e o arquivo salva com um nome genérico (hash/UUID) em vez de
  // `filename`. Chrome tolera clicar num elemento solto; Firefox não. O
  // clique é síncrono, então dá pra remover logo em seguida.
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
