import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { beginImport, insertSalesChunk, finalizeImport } from "@/lib/upload.functions";
import { getImportedDates } from "@/lib/analytics.functions";
import { parseAnyWorkbook } from "@/lib/xlsx-parser";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2, CalendarCheck, Clock, Gauge } from "lucide-react";
import { ImportCalendar } from "@/components/import-calendar";
import { AdminGate } from "@/components/admin-gate";
import { supabase } from "@/integrations/supabase/client";
import { fmtBRShort, fmtInt, fmtDT } from "@/lib/utils";

const CHUNK_SIZE = 1000;
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_TOTAL_ROWS = 500_000;

export const Route = createFileRoute("/_authenticated/upload")({
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw redirect({ to: "/auth" });
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: u.user.id,
      _role: "admin",
    });
    if (isAdmin !== true) throw redirect({ to: "/" });
  },
  component: () => <AdminGate><UploadPage /></AdminGate>,
});


type FileStatus = "pending" | "processing" | "done" | "error";

interface Result {
  filename: string;
  ok: boolean;
  message: string;
  date?: string;
  rows?: number;
}

function UploadPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);
  const [statuses, setStatuses] = useState<Record<string, FileStatus>>({});
  const [progressLabel, setProgressLabel] = useState<string>("");
  const [progressPct, setProgressPct] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [eta, setEta] = useState(0);
  const [processed, setProcessed] = useState(0);
  const [currentFile, setCurrentFile] = useState("");
  const begin = useServerFn(beginImport);
  const insertChunk = useServerFn(insertSalesChunk);
  const finalize = useServerFn(finalizeImport);
  const importedDates = useServerFn(getImportedDates);
  const qc = useQueryClient();

  const { data: dates } = useQuery({ queryKey: ["imported-dates"], queryFn: () => importedDates() });

  const setFileStatus = (name: string, st: FileStatus) =>
    setStatuses((s) => ({ ...s, [name]: st }));

  const processFiles = async () => {
    if (files.length === 0) return;
    setBusy(true);
    setResults([]);
    setStatuses({});
    setProgressPct(0);
    setSpeed(0);
    setEta(0);
    setProcessed(0);
    setCurrentFile("");
    setProgressLabel("");
    const r: Result[] = [];

    const allNames = files.map((f) => f.name);
    setStatuses(Object.fromEntries(allNames.map((n) => [n, "pending"])));

    for (let fi = 0; fi < files.length; fi++) {
      const f = files[fi];
      const startTime = Date.now();
      let totalLines = 0;
      setCurrentFile(f.name);
      setFileStatus(f.name, "processing");

      try {
        setProgressLabel("Lendo arquivo…");
        setProgressPct(0);
        setProcessed(0);
        const buf = await f.arrayBuffer();
        setProgressLabel("Processando planilha…");
        const parsed = parseAnyWorkbook(buf);

        totalLines = parsed.sales.length;
        if (totalLines > MAX_TOTAL_ROWS) {
          throw new Error(`Arquivo excede o limite de ${fmtInt(MAX_TOTAL_ROWS)} linhas (${fmtInt(totalLines)}).`);
        }

        setProgressLabel("Preparando…");
        setProgressPct(0);
        await begin({ data: { sale_date: parsed.sale_date, stores: parsed.stores, products: parsed.products } });

        let i = 0;
        let done = 0;
        while (i < totalLines) {
          const chunk = parsed.sales.slice(i, i + CHUNK_SIZE);
          const elapsed = (Date.now() - startTime) / 1000;
          const rate = elapsed > 0 ? Math.round(done / elapsed) : 0;
          const rem = rate > 0 ? Math.round((totalLines - done) / rate) : 0;
          setSpeed(rate);
          setEta(rem);
          setProcessed(Math.min(i + CHUNK_SIZE, totalLines));
          setProgressPct(totalLines > 0 ? Math.round((done / totalLines) * 100) : 0);
          setProgressLabel(`${fmtInt(Math.min(i + CHUNK_SIZE, totalLines))} / ${fmtInt(totalLines)} linhas`);
          await insertChunk({ data: { sale_date: parsed.sale_date, rows: chunk } });
          i += CHUNK_SIZE;
          done = i;
        }

        setProgressLabel("Finalizando…");
        setProgressPct(100);
        await finalize({ data: { sale_date: parsed.sale_date, row_count: totalLines } });

        r.push({ filename: f.name, ok: true, message: `${fmtInt(totalLines)} linhas`, date: parsed.sale_date, rows: totalLines });
        setFileStatus(f.name, "done");
      } catch (e: any) {
        r.push({ filename: f.name, ok: false, message: e?.message ?? "Erro desconhecido" });
        setFileStatus(f.name, "error");
      }
      setResults([...r]);
    }

    setProgressLabel("");
    setProgressPct(0);
    setCurrentFile("");
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
        <h1 className="font-display text-3xl font-bold flex items-center gap-2">
          <Upload className="size-7 text-primary shrink-0" /> Importar planilhas
        </h1>
        <p className="text-sm text-muted-foreground">
          Dados existentes na mesma data são substituídos integralmente.
        </p>
      </header>

      <label
        htmlFor="files"
        className="kpi-card flex cursor-pointer flex-col items-center justify-center border-2 border-dashed border-border bg-muted/30 py-10 text-center transition hover:border-primary/50 hover:bg-primary/5"
      >
        <Upload className="mb-3 size-8 text-muted-foreground" />
        <div className="font-medium">Arraste arquivos ou clique para selecionar</div>
        <div className="mt-1 text-xs text-muted-foreground">.xlsx, .xls (múltiplos arquivos, máx. 50 MB cada)</div>
        <input
          id="files" type="file" multiple accept=".xlsx,.xls"
          className="sr-only"
          onChange={(e) => {
            const selected = Array.from(e.target.files ?? []);
            const oversized = selected.filter((f) => f.size > MAX_FILE_SIZE);
            if (oversized.length > 0) {
              toast.error(`${oversized.length} arquivo(s) excedem o limite de 50 MB.`);
            }
            setFiles(selected.filter((f) => f.size <= MAX_FILE_SIZE));
          }}
        />
      </label>

      {files.length > 0 && (
        <div className="mt-4 kpi-card">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-medium">{files.length} arquivo(s) selecionado(s)</div>
            <Button onClick={processFiles} disabled={busy}>
              {busy ? <><Loader2 className="mr-2 size-4 animate-spin" /> Importando…</> : "Iniciar importação"}
            </Button>
          </div>

          {busy && (
            <div className="mb-3 rounded-md border bg-muted/30 p-3">
              <div className="flex items-center gap-3 text-sm">
                <FileSpreadsheet className="size-4 shrink-0 text-primary" />
                <span className="truncate font-medium">{currentFile}</span>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="tabular-nums font-medium text-foreground">{progressLabel}</span>
                <span className="flex items-center gap-1"><Gauge className="size-3" /> {fmtInt(speed)} linhas/s</span>
                <span className="flex items-center gap-1"><Clock className="size-3" /> ~{eta}s restantes</span>
              </div>
            </div>
          )}

          <ul className="space-y-2">
            {files.map((f) => {
              const st = statuses[f.name] ?? "pending";
              return (
                <li
                  key={f.name}
                  className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
                    st === "processing" ? "bg-primary/5 ring-1 ring-primary/20" :
                    st === "done" ? "bg-emerald-50" :
                    st === "error" ? "bg-destructive/5" :
                    "bg-muted/40"
                  }`}
                >
                  {st === "processing" ? (
                    <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
                  ) : st === "done" ? (
                    <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
                  ) : st === "error" ? (
                    <AlertCircle className="size-4 shrink-0 text-destructive" />
                  ) : (
                    <FileSpreadsheet className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="truncate">{f.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {st === "processing" ? `${fmtInt(processed)} linhas` : `${(f.size / 1024).toFixed(0)} KB`}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {results.length > 0 && (
        <div className="mt-6 kpi-card">
          <h2 className="font-display text-lg font-semibold">Resultado</h2>
          <ul className="mt-3 space-y-2">
            {results.map((r, i) => (
              <li key={i} className={`flex items-start gap-3 rounded-md border p-3 text-sm ${r.ok ? "border-emerald-400 bg-emerald-50" : "border-destructive/30 bg-destructive/5"}`}>
                {r.ok ? <CheckCircle2 className="mt-0.5 size-4 text-emerald-600" /> : <AlertCircle className="mt-0.5 size-4 text-destructive" />}
                <div className="flex-1">
                  <div className="font-medium">{r.filename}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.ok && r.date && <>Data {fmtBRShort(r.date)}: </>}
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
        <h2 className="font-display text-base font-semibold mb-3">Histórico de importações</h2>
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
                  <td className="py-2 font-medium">{fmtBRShort(d.sale_date)}</td>
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
