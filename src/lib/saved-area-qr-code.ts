const QUIET_ZONE_MODULES = 4;
const PNG_MODULE_SIZE = 8;

type QrMatrix = {
  size: number;
  get: (x: number, y: number) => 0 | 1;
};

export type SavedAreaQrCode = {
  svgDataUrl: string;
  pngDataUrl: string;
};

export function getSavedAreaAnalysisUrl(origin: string, analysisId: string): string {
  return new URL(`/area/${encodeURIComponent(analysisId)}`, origin).toString();
}

function renderSvg(matrix: QrMatrix): string {
  const size = matrix.size + QUIET_ZONE_MODULES * 2;
  const modules: string[] = [];

  for (let y = 0; y < matrix.size; y += 1) {
    for (let x = 0; x < matrix.size; x += 1) {
      if (matrix.get(x, y)) {
        modules.push(`M${x + QUIET_ZONE_MODULES} ${y + QUIET_ZONE_MODULES}h1v1h-1z`);
      }
    }
  }

  return [
    '<svg xmlns="http://www.w3.org/2000/svg"',
    ` viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">`,
    '<rect width="100%" height="100%" fill="#fff"/>',
    `<path d="${modules.join("")}" fill="#000"/>`,
    "</svg>",
  ].join("");
}

function renderPng(matrix: QrMatrix): string {
  const canvas = document.createElement("canvas");
  const size = (matrix.size + QUIET_ZONE_MODULES * 2) * PNG_MODULE_SIZE;
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");

  if (!context) throw new Error("Não foi possível gerar a imagem do QR Code.");

  context.fillStyle = "#fff";
  context.fillRect(0, 0, size, size);
  context.fillStyle = "#000";

  for (let y = 0; y < matrix.size; y += 1) {
    for (let x = 0; x < matrix.size; x += 1) {
      if (matrix.get(x, y)) {
        context.fillRect(
          (x + QUIET_ZONE_MODULES) * PNG_MODULE_SIZE,
          (y + QUIET_ZONE_MODULES) * PNG_MODULE_SIZE,
          PNG_MODULE_SIZE,
          PNG_MODULE_SIZE,
        );
      }
    }
  }

  return canvas.toDataURL("image/png");
}

export async function generateSavedAreaQrCode(url: string): Promise<SavedAreaQrCode> {
  const { Byte, Encoder } = await import("@nuintun/qrcode");
  const matrix = new Encoder({ level: "M" }).encode(new Byte(url));
  const svg = renderSvg(matrix);

  return {
    svgDataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    pngDataUrl: renderPng(matrix),
  };
}
