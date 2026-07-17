import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { beginImport, insertSalesChunk, finalizeImport, getImportedDates } from "@/lib/upload.functions";
import { purgeOldAggs } from "@/lib/admin.functions";
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
import type { ParsedSalesFile } from "@/lib/xlsx-parser";

const CHUNK_SIZE = 1000;
const MAX_TOTAL_ROWS = 200_000;

interface FileEntry {
  file: File;
  saleDate: string;
  status: "pending" | "processing" | "done" | "error";
  totalLines?: number;
  errorMsg?: string;
  parsed?: ParsedSalesFile;
}

export default function UploadPage() {
  const queryClient = useQueryClient();
  const getImported = useServerFn(getImportedDates);
  const doBeginImport = useServerFn(beginImport);
  const doInsertChunk = useServerFn(insertSalesChunk);
  const doFinalizeImport = useServerFn(finalizeImport);
  const doPurge = useServerFn(purgeOldAggs);

  const imported = useQuery({
    queryKey: ["imported-dates"],
    queryFn: () => getImported(),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });

  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [pendingData, setPendingData] = useState<{
    file: string;
    date: string;
    parsed: ParsedSalesFile;
  } | null>(null);

  const processingRef = useRef(false);

  const handleFiles = (files: FileEntry[]) => {
    for (const entry of files) {
      if (entry.status === "error") {
        toast.error(`Erro ao ler ${entry.file.name}: ${entry.errorMsg ?? "erro desconhecido"}`);
        continue;
      }
      const parsed = entry.parsed;
      if (!parsed) continue;
      const totalLines = parsed.sales.length;
      if (totalLines > MAX_TOTAL_ROWS) {
        toast.error(`Arquivo excede o limite de ${fmtInt(MAX_TOTAL_ROWS)} linhas (${fmtInt(totalLines)}).`);
        continue;
      }
      setPendingData({ file: entry.saleDate, date: entry.saleDate, parsed });
    }
  };

  const confirmImport = async () => {
    if (!pendingData || processingRef.current) return;
    const { file, date, parsed } = pendingData;
    setPendingData(null);

    const entry: FileEntry = { file: new File([], file), saleDate: date, status: "pending", totalLines: parsed.sales.length };
    setEntries((prev) => [entry, ...prev]);

    processingRef.current = true;

    const update = (patch: Partial<FileEntry>) =>
      setEntries((prev) =>
        prev.map((e) => (e.saleDate === entry.saleDate && e.file.name === entry.file.name ? { ...e, ...patch } : e)),
      );

    try {
      update({ status: "processing" });

      const batchId = crypto.randomUUID();
      const stores = [...new Map(parsed.sales.map((r) => [r.store_code, { store_code: r.store_code, store_name: r.store_name }])).values()];
      const seen = new Set<string>();
      const products = parsed.sales.filter((r) => {
        const k = r.prod_code;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      }).map((r) => ({ prod_code: r.prod_code, prod_name: r.prod_name }));

      await doBeginImport({
        data: {
          sale_date: date,
          batch_id: batchId,
          total_rows: parsed.sales.length,
          stores,
          products,
        },
      });

      const totalChunks = Math.ceil(parsed.sales.length / CHUNK_SIZE);
      for (let i = 0; i < totalChunks; i++) {
        const chunk = parsed.sales.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        await doInsertChunk({ data: { sale_date: date, batch_id: batchId, rows: chunk } });
        update({ totalLines: Math.min((i + 1) * CHUNK_SIZE, parsed.sales.length) });
      }

      await doFinalizeImport({ data: { sale_date: date, batch_id: batchId, row_count: parsed.sales.length } });
      doPurge({}).catch(() => {});

      update({ status: "done", totalLines: parsed.sales.length });
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
          <UploadDropzone onFilesSelected={handleFiles} disabled={processingRef.current} />
          {entries.length > 0 && <ImportProgress entries={entries} busy={false} progressPct={0} speed={0} eta={0} processed={0} currentDate="" onProcess={confirmImport} />}
          <ImportHistory dates={imported.data} />
        </div>
      )}

      {tab === "calendario" && <ImportCalendar records={imported.data ?? []} />}

      <AlertDialog open={!!pendingData} onOpenChange={(o) => { if (!o) setPendingData(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar importação</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja importar <strong>{pendingData?.file}</strong>{" "}
              com {fmtInt(pendingData?.parsed.sales.length ?? 0)} linhas em{" "}
              <strong>{pendingData?.date}</strong>?
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
