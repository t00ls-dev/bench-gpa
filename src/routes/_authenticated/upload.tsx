import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { beginImport, insertSalesChunk, finalizeImport } from "@/lib/upload.functions";
import { getImportedDates } from "@/lib/analytics.functions";
import { parseAnyWorkbook } from "@/lib/xlsx-parser";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2, CalendarCheck } from "lucide-react";
import { ImportCalendar } from "@/components/import-calendar";

export const Route = createFileRoute("/_authenticated/upload")({
  component: UploadPage,
});

interface Result {
  filename: string;
  ok: boolean;
  message: string;
  date?: string;
  rows?: number;
}

const CHUNK = 400;
const fmtInt = (n: number) => n.toLocaleString("pt-BR");
const fmtDate = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("pt-BR");
const fmtDT = (iso: string) => new Date(iso).toLocaleString("pt-BR");

function UploadPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string>("");
  const begin = useServerFn(beginImport);
  const insertChunk = useServerFn(insertSalesChunk);
  const finalize = useServerFn(finalizeImport);
  const importedDates = useServerFn(getImportedDates);
  const qc = useQueryClient();

  const { data: dates } = useQuery({ queryKey: ["imported-dates"], queryFn: () => importedDates() });

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
        const parsed = parseAnyWorkbook(buf);

        setProgress(`${f.name}: preparando ${parsed.sale_date}…`);
        await begin({ data: { sale_date: parsed.sale_date, stores: parsed.stores, products: parsed.products } });
        const total = parsed.sales.length;
        for (let i = 0; i < total; i += CHUNK) {
          const chunk = parsed.sales.slice(i, i + CHUNK);
          setProgress(`${f.name}: ${Math.min(i + CHUNK, total).toLocaleString("pt-BR")}/${total.toLocaleString("pt-BR")}…`);
          await insertChunk({ data: { sale_date: parsed.sale_date, rows: chunk } });
        }
        await finalize({ data: { sale_date: parsed.sale_date, row_count: total } });
        r.push({ filename: f.name, ok: true, message: `${fmtInt(total)} vendas`, date: parsed.sale_date, rows: total });
      } catch (e: any) {
        r.push({ filename: f.name, ok: false, message: e?.message ?? "Erro desconhecido" });
      }
      setResults([...r]);
    }
    setProgress("");
    setBusy(false);
    qc.invalidateQueries({ queryKey: ["imported-dates"] });
    qc.invalidateQueries({ queryKey: ["filter-options"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    const ok = r.filter((x) => x.ok).length;
    if (ok === r.length) toast.success(`${ok} arquivo(s) importado(s).`);
    else if (ok > 0) toast.warning(`${ok} de ${r.length} importados.`);
    else toast.error("Nenhum arquivo importado.");
  };

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6">
        <h1 className="font-display text-3xl font-bold">Importar planilhas</h1>
        <p className="text-sm text-muted-foreground">
          Envie planilhas de vendas (DTA_VENDA). Dados existentes na mesma data são substituídos integralmente.
        </p>
      </header>

      <label
        htmlFor="files"
        className="kpi-card flex cursor-pointer flex-col items-center justify-center border-2 border-dashed border-border bg-muted/30 py-10 text-center transition hover:border-primary/50 hover:bg-primary/5"
      >
        <Upload className="mb-3 size-8 text-muted-foreground" />
        <div className="font-medium">Arraste arquivos ou clique para selecionar</div>
        <div className="mt-1 text-xs text-muted-foreground">.xlsx, .xls — múltiplos arquivos</div>
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
                    {r.ok && r.date && <>Data {fmtDate(r.date)} — </>}
                    {r.message}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6 kpi-card">
        <div className="mb-3 flex items-center gap-2">
          <CalendarCheck className="size-4 text-primary" />
          <h2 className="font-display text-base font-semibold">Calendário de importações</h2>
        </div>
        <ImportCalendar records={dates ?? []} />
      </div>

      <div className="mt-6 kpi-card">
        <h2 className="font-display text-base font-semibold mb-3">Histórico de datas importadas</h2>
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="py-2">Data</th>
                <th className="py-2 text-right">Linhas</th>
                <th className="py-2 text-right">Atualizado</th>
              </tr>
            </thead>
            <tbody>
              {(dates ?? []).map((d) => (
                <tr key={d.sale_date} className="border-b border-border/60">
                  <td className="py-2 font-medium">{fmtDate(d.sale_date)}</td>
                  <td className="num py-2 text-right">{fmtInt(d.row_count)}</td>
                  <td className="py-2 text-right text-xs text-muted-foreground">{fmtDT(d.imported_at)}</td>
                </tr>
              ))}
              {(!dates || dates.length === 0) && (
                <tr><td colSpan={3} className="py-6 text-center text-xs text-muted-foreground">Nenhuma data importada.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
