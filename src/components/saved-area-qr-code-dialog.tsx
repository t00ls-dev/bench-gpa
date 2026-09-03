import { useEffect, useState } from "react";
import { Download, Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { slugifyFilename } from "@/lib/export-pdf";
import {
  generateSavedAreaQrCode,
  getSavedAreaAnalysisUrl,
  type SavedAreaQrCode,
} from "@/lib/saved-area-qr-code";
import {
  downloadSavedAreaQrCodePdf,
  type SavedAreaQrCodeLabel,
} from "@/lib/saved-area-qr-code-pdf";

export function SavedAreaQrCodeDialog({
  analysis,
  open,
  onOpenChange,
}: {
  analysis: SavedAreaQrCodeLabel;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [result, setResult] = useState<{
    requestKey: string;
    qrCode?: SavedAreaQrCode;
    error?: string;
  } | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [pdfLoading, setPdfLoading] = useState(false);
  const url =
    open && typeof window !== "undefined"
      ? getSavedAreaAnalysisUrl(window.location.origin, analysis.id)
      : "";
  const requestKey = `${url}\0${retryCount}`;
  const currentResult = result?.requestKey === requestKey ? result : null;
  const qrCode = currentResult?.qrCode;
  const error = currentResult?.error;

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    void generateSavedAreaQrCode(url)
      .then((generated) => {
        if (!cancelled) setResult({ requestKey, qrCode: generated });
      })
      .catch(() => {
        if (!cancelled) setResult({ requestKey, error: "Não foi possível gerar o QR Code." });
      });

    return () => {
      cancelled = true;
    };
  }, [open, requestKey, url]);

  const filename = `${slugifyFilename(analysis.name) || analysis.id}-qr-code`;

  const downloadPdf = async () => {
    if (!qrCode || pdfLoading) return;
    setPdfLoading(true);
    try {
      await downloadSavedAreaQrCodePdf(url, analysis);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar o PDF.");
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] min-w-0 overflow-x-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>QR Code da análise</DialogTitle>
          <DialogDescription>
            Qualquer usuário autenticado que receber este QR Code poderá visualizar
            {` “${analysis.name}”.`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-64 items-center justify-center rounded-lg border bg-white p-4">
          {qrCode ? (
            <img
              src={qrCode.svgDataUrl}
              alt={`QR Code para ${analysis.name}`}
              className="size-56 max-w-full"
            />
          ) : error ? (
            <div className="text-center">
              <p className="text-sm text-destructive">{error}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => setRetryCount((count) => count + 1)}
              >
                Tentar novamente
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Gerando QR Code…
            </div>
          )}
        </div>

        <p className="break-all rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          {url}
        </p>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={!qrCode || pdfLoading}
            onClick={downloadPdf}
          >
            {pdfLoading ? <Loader2 className="animate-spin" /> : <Printer />}
            PDF para impressão
          </Button>
          <Button asChild variant="outline" disabled={!qrCode}>
            <a href={qrCode?.svgDataUrl} download={`${filename}.svg`} aria-disabled={!qrCode}>
              <Download /> Baixar SVG
            </a>
          </Button>
          <Button asChild disabled={!qrCode}>
            <a href={qrCode?.pngDataUrl} download={`${filename}.png`} aria-disabled={!qrCode}>
              <Download /> Baixar PNG
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
