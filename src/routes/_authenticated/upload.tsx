import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { beginImport, insertSalesChunk } from "@/lib/upload.functions";
import { parseWorkbook } from "@/lib/xlsx-parser";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/upload")({
  component: UploadPage,
});

interface Result {
  filename: string;
  ok: boolean;
  message: string;
  sale_date?: string;
  rows?: number;
}

const CHUNK = 400;

function UploadPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string>("");
  const begin = useServerFn(beginImport);
  const insertChunk = useServerFn(insertSalesChunk);

  const process = async () => {
    if (files.length === 0) return;
    setBusy(true);
    setResults([]);
    const r: Result[] = [];
    for (const f of files) {
      try {
        setProgress(`${f.name}: lendo arquivo…`);
        const buf = await f.arrayBuffer();
        setProgress(`${f.name}: processando planilha…`);
        const parsed = parseWorkbook(buf);

        setProgress(`${f.name}: preparando data ${parsed.sale_date}…`);
        await begin({ data: { sale_date: parsed.sale_date, stores: parsed.stores, products: parsed.products } });

        const total = parsed.sales.length;
        for (let i = 0; i < total; i += CHUNK) {
          const chunk = parsed.sales.slice(i, i + CHUNK);
          setProgress(`${f.name}: enviando ${Math.min(i + CHUNK, total).toLocaleString("pt-BR")}/${total.toLocaleString("pt-BR")}…`);
          await insertChunk({ data: { sale_date: parsed.sale_date, rows: chunk } });
        }

        r.push({
          filename: f.name, ok: true,
          message: `${total.toLocaleString("pt-BR")} linhas importadas`,
          sale_date: parsed.sale_date, rows: total,
        });
      } catch (e: any) {
        r.push({ filename: f.name, ok: false, message: e?.message ?? "Erro desconhecido" });
      }
      setResults([...r]);
    }
    setProgress("");
    setBusy(false);
    const ok = r.filter((x) => x.ok).length;
    if (ok === r.length) toast.success(`${ok} arquivo(s) importado(s).`);
    else if (ok > 0) toast.warning(`${ok} de ${r.length} importados.`);
    else toast.error("Nenhum arquivo importado.");
  };

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6">
        <h1 className="font-display text-3xl font-bold">Importar planilhas</h1>
        <p className="text-sm text-muted-foreground">
          A data dos dados é extraída automaticamente do conteúdo do arquivo (marcador <code className="rounded bg-muted px-1 text-xs">DTA_VENDA é DD/MM/AAAA</code>). Dados existentes na mesma data serão substituídos.
        </p>
      </header>

      <label
        htmlFor="files"
        className="kpi-card flex cursor-pointer flex-col items-center justify-center border-2 border-dashed border-border bg-muted/30 py-10 text-center transition hover:border-primary/50 hover:bg-primary/5"
      >
        <Upload className="mb-3 size-8 text-muted-foreground" />
        <div className="font-medium">Arraste arquivos ou clique para selecionar</div>
        <div className="mt-1 text-xs text-muted-foreground">.xlsx, .xls — múltiplos permitidos</div>
        <input
          id="files" type="file" multiple accept=".xlsx,.xls"
          className="sr-only"
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
        />
      </label>

      {files.length > 0 && (
        <div className="mt-4 kpi-card">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-medium">{files.length} arquivo(s) selecionado(s)</div>
            <Button onClick={process} disabled={busy}>
              {busy ? <><Loader2 className="mr-2 size-4 animate-spin" /> Importando…</> : "Iniciar importação"}
            </Button>
          </div>
          {busy && progress && (
            <div className="mb-3 rounded-md bg-primary/5 px-3 py-2 text-xs text-primary">{progress}</div>
          )}
          <ul className="space-y-2">
            {files.map((f) => (
              <li key={f.name} className="flex items-center gap-2 rounded-md bg-muted/40 px-3 py-2 text-sm">
                <FileSpreadsheet className="size-4 text-muted-foreground" />
                <span className="truncate">{f.name}</span>
                <span className="ml-auto text-xs text-muted-foreground">{(f.size / 1024).toFixed(0)} KB</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {results.length > 0 && (
        <div className="mt-6 kpi-card">
          <h2 className="font-display text-lg font-semibold">Resultado</h2>
          <ul className="mt-3 space-y-2">
            {results.map((r, i) => (
              <li key={i} className={`flex items-start gap-3 rounded-md border p-3 text-sm ${r.ok ? "border-[oklch(0.85_0.08_155)] bg-[oklch(0.96_0.04_155)]" : "border-destructive/30 bg-destructive/5"}`}>
                {r.ok ? <CheckCircle2 className="mt-0.5 size-4 text-[oklch(0.45_0.13_155)]" /> : <AlertCircle className="mt-0.5 size-4 text-destructive" />}
                <div className="flex-1">
                  <div className="font-medium">{r.filename}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.ok && r.sale_date && <>Data {new Date(r.sale_date + "T00:00:00").toLocaleDateString("pt-BR")} — </>}
                    {r.message}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
