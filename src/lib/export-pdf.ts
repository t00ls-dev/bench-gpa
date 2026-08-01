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

// Anchor único e persistente, reaproveitado em toda chamada — não criado e
// removido a cada clique. `openPdfInNewTab` (use-area-pdf-export.ts) é
// assíncrona (await na busca do servidor + import dinâmico de jspdf/
// jspdf-autotable) antes de chegar aqui, então o `.click()` programático
// acontece bem depois do clique real do usuário que disparou o export.
// Firefox é mais estrito que o Chrome em honrar `download` num cenário
// assim — um <a> criado, inserido e removido na mesma chamada demonstrou
// continuar salvando com nome genérico mesmo já anexado ao DOM no momento
// do clique (ver histórico do commit). Um elemento estável, que já existe
// na página antes do clique, é o padrão documentado como mais confiável
// entre navegadores para download programático.
let downloadAnchor: HTMLAnchorElement | undefined;

function getDownloadAnchor(): HTMLAnchorElement {
  if (!downloadAnchor) {
    downloadAnchor = document.createElement("a");
    downloadAnchor.style.display = "none";
    document.body.appendChild(downloadAnchor);
  }
  return downloadAnchor;
}

export function openPdfBlob(doc: jsPDF, filename?: string) {
  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  const a = getDownloadAnchor();
  a.href = url;
  if (filename) {
    // Com `download` setado, o clique baixa o arquivo direto (com este nome)
    // em vez de abrir uma aba de preview — `target`/`rel` não fazem sentido
    // nesse caso. Precisa limpar explicitamente porque o anchor é reusado:
    // uma chamada anterior sem filename pode ter deixado target/rel setados.
    a.download = filename;
    a.removeAttribute("target");
    a.removeAttribute("rel");
  } else {
    a.removeAttribute("download");
    a.target = "_blank";
    a.rel = "noopener noreferrer";
  }
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
