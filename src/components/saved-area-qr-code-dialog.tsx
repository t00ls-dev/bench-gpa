import { useEffect, useState } from "react";
import { Download, Loader2 } from "lucide-react";
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

type AnalysisReference = {
  id: string;
  name: string;
};

export function SavedAreaQrCodeDialog({
  analysis,
  open,
  onOpenChange,
}: {
  analysis: AnalysisReference;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [result, setResult] = useState<{
    requestKey: string;
    qrCode?: SavedAreaQrCode;
    error?: string;
  } | null>(null);
  const [retryCount, setRetryCount] = useState(0);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>QR Code da análise</DialogTitle>
          <DialogDescription>
            O acesso a “{analysis.name}” continua exigindo login na conta autorizada.
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
