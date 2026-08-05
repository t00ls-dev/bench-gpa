import type jsPDF from "jspdf";

const COMBINING_DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g");

/** Makes a string safe to use as a filename: no accents, no spaces, no
 * character the filesystem would reject. */
export function slugifyFilename(s: string): string {
  return s
    .normalize("NFD")
    .replace(COMBINING_DIACRITICS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Persistent anchor only for the preview path (open in a new tab): it never
// had the filename bug, so it keeps using a local blob: URL. The forced
// download path (with filename) no longer uses any anchor at all, see
// openPdfBlob below.
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
 * Without `filename`: opens the PDF in a new tab for preview (local blob:
 * URL, as it always worked).
 *
 * With `filename`: goes through the server (`/api/pdf-download` in
 * src/server.ts) to download with a real `Content-Disposition: attachment`,
 * instead of relying on the `download` attribute on a client-side blob:
 * URL. Two earlier fixes (anchor attached to the DOM before the click;
 * `dispatchEvent(MouseEvent)` instead of `.click()`) weren't enough. The
 * real problem runs deeper: Firefox's download manager doesn't trust the
 * `download` attribute for blob: URLs in several cases, falling back to the
 * blob URL's own UUID as the name (Mozilla Bugzilla #1282407).
 * Content-Disposition is metadata on a real HTTP response, reliably
 * honored by every browser, without depending on any client-side
 * anchor/blob trick.
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
