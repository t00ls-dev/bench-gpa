import { useState, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { beginImport, insertSalesChunk, finalizeImport, getImportedDates } from "@/lib/upload.functions";
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
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Upload, CalendarCheck, AlertCircle } from "lucide-react";
import { ImportCalendar } from "@/components/import-calendar";
import { UploadDropzone } from "@/components/upload-dropzone";
import { ImportProgress } from "@/components/import-progress";
import { ImportHistory } from "@/components/import-history";
import { fmtInt } from "@/lib/utils";
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

interface ProcessingState {
  busy: boolean;
  progressPct: number;
  speed: number;
  eta: number;
  processed: number;
  currentDate: string;
}

const IDLE_STATE: ProcessingState = {
  busy: false,
  progressPct: 0,
  speed: 0,
  eta: 0,
  processed: 0,
  currentDate: "",
};

export default function UploadPage() {
  const queryClient = useQueryClient();
  const getImported = useServerFn(getImportedDates);
  const doBeginImport = useServerFn(beginImport);
  const doInsertChunk = useServerFn(insertSalesChunk);
  const doFinalizeImport = useServerFn(finalizeImport);
  const imported = useQuery({
    queryKey: ["imported-dates"],
    queryFn: () => getImported(),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });

  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [pendingQueue, setPendingQueue] = useState<Array<{
    file: File;
    date: string;
    parsed: ParsedSalesFile;
  }>>([]);
  const [processing, setProcessing] = useState<ProcessingState>(IDLE_STATE);

  const processingRef = useRef(false);
  const startTimeRef = useRef(0);
  const processedTotalRef = useRef(0);

  const handleFiles = (files: FileEntry[]) => {
    const valid: typeof pendingQueue = [];
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
      valid.push({ file: entry.file, date: entry.saleDate, parsed });
    }
    if (valid.length > 0) setPendingQueue(valid);
  };

  const processOne = async (item: typeof pendingQueue[number]): Promise<void> => {
    const { date, parsed } = item;
    const entry: FileEntry = { file: item.file, saleDate: date, status: "pending", totalLines: parsed.sales.length };
    setEntries((prev) => [entry, ...prev]);

    const update = (patch: Partial<FileEntry>) =>
      setEntries((prev) =>
        prev.map((e) => (e.saleDate === entry.saleDate && e.file.name === entry.file.name ? { ...e, ...patch } : e)),
      );

    update({ status: "processing" });
    setProcessing((p) => ({ ...p, currentDate: date }));

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
      const processed = Math.min((i + 1) * CHUNK_SIZE, parsed.sales.length);
      update({ totalLines: processed });
      processedTotalRef.current += chunk.length;
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      const speed = Math.round(processedTotalRef.current / elapsed);
      const remaining = (parsed.sales.length - processed) / speed;
      setProcessing((p) => ({
        ...p,
        progressPct: Math.round((processed / parsed.sales.length) * 100),
        speed,
        eta: Math.round(remaining),
        processed,
      }));
    }

    await doFinalizeImport({ data: { sale_date: date, batch_id: batchId, row_count: parsed.sales.length } });

    update({ status: "done", totalLines: parsed.sales.length });
  };

  const confirmImport = async () => {
    if (pendingQueue.length === 0 || processingRef.current) return;
    const queue = [...pendingQueue];
    setPendingQueue([]);
    processingRef.current = true;
    startTimeRef.current = Date.now();
    processedTotalRef.current = 0;
    setProcessing((p) => ({ ...p, busy: true, progressPct: 0, speed: 0, eta: 0, processed: 0 }));

    try {
      for (const item of queue) {
        await processOne(item);
      }
      imported.refetch();
      toast.success("Importação concluída!");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      toast.error(msg);
    } finally {
      processingRef.current = false;
      setProcessing(IDLE_STATE);
    }
  };

  const [tab, setTab] = useState<"upload" | "calendario">("upload");
  const totalPendingLines = pendingQueue.reduce((acc, p) => acc + p.parsed.sales.length, 0);

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
          <UploadDropzone onFilesSelected={handleFiles} disabled={processing.busy} />
          {entries.length > 0 && (
            <ImportProgress
              entries={entries}
              busy={processing.busy}
              progressPct={processing.progressPct}
              speed={processing.speed}
              eta={processing.eta}
              processed={processing.processed}
              currentDate={processing.currentDate}
              onProcess={confirmImport}
            />
          )}
          {imported.isPending ? (
            <div className="space-y-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : imported.isError ? (
            <div className="kpi-card flex items-center gap-3 text-sm text-destructive">
              <AlertCircle className="size-5 shrink-0" />
              <span>Erro ao carregar histórico: {imported.error.message}</span>
            </div>
          ) : (
            <ImportHistory dates={imported.data} />
          )}
        </div>
      )}

      {tab === "calendario" && (
        imported.isPending ? (
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : imported.isError ? (
          <div className="kpi-card flex items-center gap-3 text-sm text-destructive">
            <AlertCircle className="size-5 shrink-0" />
            <span>Erro ao carregar dados: {imported.error.message}</span>
          </div>
        ) : (
          <ImportCalendar records={imported.data ?? []} />
        )
      )}

      <AlertDialog open={pendingQueue.length > 0} onOpenChange={(o) => { if (!o) setPendingQueue([]); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar importação</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingQueue.length === 1 ? (
                <>Deseja importar <strong>{pendingQueue[0].date}</strong> com {fmtInt(pendingQueue[0].parsed.sales.length)} linhas?</>
              ) : (
                <>Deseja importar <strong>{pendingQueue.length} arquivos</strong> totalizando {fmtInt(totalPendingLines)} linhas?</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pendingQueue.length > 1 && (
            <ul className="px-6 text-sm space-y-1 max-h-40 overflow-y-auto">
              {pendingQueue.map((p, i) => (
                <li key={i} className="flex justify-between text-muted-foreground">
                  <span>{p.date}</span>
                  <span>{fmtInt(p.parsed.sales.length)} linhas</span>
                </li>
              ))}
            </ul>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmImport}>Substituir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
