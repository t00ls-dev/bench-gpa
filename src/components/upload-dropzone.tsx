import { toast } from "sonner";
import { Upload } from "lucide-react";
import { parseAnyWorkbook } from "@/lib/xlsx-parser";
import { fmtInt } from "@/lib/utils";

const MAX_FILE_SIZE = 50 * 1024 * 1024;

interface FileEntry {
  file: File;
  saleDate: string;
  status: "pending" | "processing" | "done" | "error";
  totalLines?: number;
  errorMsg?: string;
}

export function UploadDropzone({
  onFilesSelected,
}: {
  onFilesSelected: (entries: FileEntry[]) => void;
}) {
  return (
    <label
      htmlFor="files"
      className="kpi-card flex cursor-pointer flex-col items-center justify-center border-2 border-dashed border-border bg-muted/30 py-10 text-center transition hover:border-primary/50 hover:bg-primary/5"
    >
      <Upload className="mb-3 size-8 text-muted-foreground" />
      <div className="font-medium">Arraste arquivos ou clique para selecionar</div>
      <div className="mt-1 text-xs text-muted-foreground">
        .xlsx, .xls (múltiplos arquivos, máx. 50 MB cada)
      </div>
      <input
        id="files"
        type="file"
        multiple
        accept=".xlsx,.xls"
        className="sr-only"
        onChange={async (e) => {
          const selected = Array.from(e.target.files ?? []);
          const oversized = selected.filter((f) => f.size > MAX_FILE_SIZE);
          if (oversized.length > 0) {
            toast.error(`${oversized.length} arquivo(s) excedem o limite de 50 MB.`);
          }
          const valid = selected.filter((f) => f.size <= MAX_FILE_SIZE);
          const parsed: FileEntry[] = [];
          let parseErrors = 0;
          for (const f of valid) {
            try {
              const buf = await f.arrayBuffer();
              const p = parseAnyWorkbook(buf);
              parsed.push({ file: f, saleDate: p.sale_date, status: "pending" });
            } catch (err: any) {
              parsed.push({
                file: f,
                saleDate: "",
                status: "error",
                errorMsg: err?.message ?? "Erro ao ler arquivo",
              });
              parseErrors++;
            }
          }
          parsed.sort((a, b) => {
            if (a.status === "error" && b.status !== "error") return 1;
            if (b.status === "error" && a.status !== "error") return -1;
            return b.saleDate.localeCompare(a.saleDate);
          });
          onFilesSelected(parsed);
          if (parseErrors > 0) toast.error(`${parseErrors} arquivo(s) não puderam ser lidos.`);
        }}
      />
    </label>
  );
}
