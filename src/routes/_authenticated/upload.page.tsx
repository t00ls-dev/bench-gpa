import { useState, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { beginImport, insertSalesChunk, finalizeImport } from "@/lib/upload.functions";
import { purgeOldAggs } from "@/lib/admin.functions";
import { getImportedDates } from "@/lib/upload.functions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Upload, CalendarCheck } from "lucide-react";
import { ImportCalendar } from "@/components/import-calendar";
import { UploadDropzone } from "@/components/upload-dropzone";
import { ImportProgress } from "@/components/import-progress";
import { ImportHistory } from "@/components/import-history";
import { fmtInt } from "@/components/kpi-card";
import type { ParsedData } from "@/lib/xlsx-parser";

const CHUNK_SIZE = 1000;
const MAX_TOTAL_ROWS = 200_000;

type ImportEntry = {
  file: string;
  date: string;
  status: "pending" | "processing" | "done" | "error";
  progress: number;
  total: number;
  errorMsg?: string;
};

export default function UploadPage() {
  const imported = useQuery({
    queryKey: ["imported-dates"],
    queryFn: () => getImported(),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });
  const importedDatesSet = new Set(
    (imported.data ?? []).map((d) => d.sale_date),
  );

  const queryClient = useQueryClient();
  const getImported = useServerFn(getImportedDates);
  const doBeginImport = useServerFn(beginImport);
  const doInsertChunk = useServerFn(insertSalesChunk);
  const doFinalizeImport = useServerFn(finalizeImport);
  const doPurge = useServerFn(purgeOldAggs);

  const [entries, setEntries] = useState<ImportEntry[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<{
    file: string;
    date: string;
    parsed: ParsedData;
  } | null>(null);

  const processingRef = useRef(false);

  const handleFiles = async (files: { name: string; parsed: ParsedData }[]) => {
    for (const entry of files) {
      const totalLines = entry.parsed.rows.length;
      if (totalLines > MAX_TOTAL_ROWS) {
        toast.error(`Arquivo excede o limite de ${fmtInt(MAX_TOTAL_ROWS)} linhas (${fmtInt(totalLines)}).`);
        continue;
      }
      setConfirmDialog({ file: entry.name, date: entry.parsed.sale_date, parsed: entry.parsed });
    }
  };

  const confirmImport = async () => {
    if (!confirmDialog || processingRef.current) return;
    const { file, date, parsed } = confirmDialog;
    setConfirmDialog(null);

    const entry: ImportEntry = { file, date, status: "pending", progress: 0, total: parsed.rows.length };
    setEntries((prev) => [entry, ...prev]);

    processingRef.current = true;

    const update = (patch: Partial<ImportEntry>) =>
      setEntries((prev) =>
        prev.map((e) => (e.file === entry.file ? { ...e, ...patch } : e)),
      );

    try {
      update({ status: "processing" });

      const batchId = crypto.randomUUID();
      const stores = [...new Map(parsed.rows.map((r) => [r.store_code, { store_code: r.store_code, store_name: r.store_name }])).values()];
      const seen = new Set<string>();
      const products = parsed.rows.filter((r) => {
        const k = r.prod_code;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      }).map((r) => ({ prod_code: r.prod_code, prod_name: r.prod_name }));

      await doBeginImport({
        data: {
          sale_date: date,
          batch_id: batchId,
          total_rows: parsed.rows.length,
          stores,
          products,
        },
      });

      const totalChunks = Math.ceil(parsed.rows.length / CHUNK_SIZE);
      for (let i = 0; i < totalChunks; i++) {
        const chunk = parsed.rows.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        await doInsertChunk({ data: { sale_date: date, batch_id: batchId, rows: chunk } });
        update({ progress: Math.min((i + 1) * CHUNK_SIZE, parsed.rows.length) });
      }

      await doFinalizeImport({ data: { sale_date: date, batch_id: batchId, row_count: parsed.rows.length } });
      doPurge({}).catch(() => {});

      update({ status: "done", progress: parsed.rows.length });
      imported.refetch();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      update({ status: "error", errorMsg: msg });
      toast.error(msg);
    } finally {
      processingRef.current = false;
    }
  };

  const [tab, setTab] = useState<"upload" | "calendario">("upload");

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-display text-2xl sm:text-3xl font-bold flex items-center gap-2">
          <Upload className="size-7 text-primary shrink-0" /> Importar Vendas
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Faça upload de planilhas XLSX no formato GPA.
        </p>
      </header>

      <div className="mb-6 flex gap-1 rounded-lg bg-muted p-1 w-fit">
        <button
          onClick={() => setTab("upload")}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            tab === "upload"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Upload className="size-4" /> Upload
        </button>
        <button
          onClick={() => setTab("calendario")}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            tab === "calendario"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <CalendarCheck className="size-4" /> Calendário
        </button>
      </div>

      {tab === "upload" && (
        <div className="space-y-4">
          <UploadDropzone onFilesReady={handleFiles} disabled={processingRef.current} />
          {entries.length > 0 && <ImportProgress entries={entries} />}
          <ImportHistory dates={imported.data} />
        </div>
      )}

      {tab === "calendario" && <ImportCalendar records={imported.data ?? []} />}

      <AlertDialog open={!!confirmDialog} onOpenChange={(o) => { if (!o) setConfirmDialog(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar importação</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja importar <strong>{confirmDialog?.file}</strong>{" "}
              com {fmtInt(confirmDialog?.parsed.rows.length ?? 0)} linhas em{" "}
              <strong>{confirmDialog?.date}</strong>?
              {confirmDialog?.parsed.warnings?.map((w, i) => (
                <span key={i} className="block mt-2 text-xs text-warning">{w}</span>
              ))}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmImport}>Substituir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
