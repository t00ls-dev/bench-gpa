// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  IMPORT_BUSY_MESSAGE,
  IMPORT_CANCEL_FAILED_MESSAGE,
  IMPORT_DATE_EXISTS_MESSAGE,
} from "@/lib/import-config";
import UploadPage from "./upload.page";
import { isImportActive } from "@/lib/chunk-reload";

const mocks = vi.hoisted(() => ({
  beginImport: vi.fn(),
  cancelImport: vi.fn(),
  insertSalesChunk: vi.fn(),
  finalizeImport: vi.fn(),
  getImportedDates: vi.fn(),
  getImportHistory: vi.fn(),
  invalidateQueries: vi.fn(),
  refetch: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
  toastSuccess: vi.fn(),
  importedData: [] as Array<{ sale_date: string; row_count: number; imported_at: string }>,
  selectedEntries: [] as Array<Record<string, unknown>>,
  blockerStatus: "idle" as "idle" | "blocked",
  blockerProceed: vi.fn(),
  blockerReset: vi.fn(),
  blockerOptions: null as null | {
    enableBeforeUnload: () => boolean;
    shouldBlockFn: () => boolean;
  },
}));

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: unknown) => fn,
}));

vi.mock("@tanstack/react-router", () => ({
  useBlocker: (options: { enableBeforeUnload: () => boolean; shouldBlockFn: () => boolean }) => {
    mocks.blockerOptions = options;
    return mocks.blockerStatus === "blocked"
      ? {
          status: "blocked",
          proceed: mocks.blockerProceed,
          reset: mocks.blockerReset,
        }
      : { status: "idle" };
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
  useQuery: () => ({
    data: mocks.importedData,
    error: null,
    isError: false,
    isPending: false,
    refetch: mocks.refetch,
  }),
}));

vi.mock("@/lib/upload.functions", () => ({
  beginImport: (...args: unknown[]) => mocks.beginImport(...args),
  cancelImport: (...args: unknown[]) => mocks.cancelImport(...args),
  insertSalesChunk: (...args: unknown[]) => mocks.insertSalesChunk(...args),
  finalizeImport: (...args: unknown[]) => mocks.finalizeImport(...args),
  getImportedDates: (...args: unknown[]) => mocks.getImportedDates(...args),
  getImportHistory: (...args: unknown[]) => mocks.getImportHistory(...args),
}));

vi.mock("@/components/upload-dropzone", () => ({
  UploadDropzone: ({
    onFilesSelected,
    disabled,
  }: {
    onFilesSelected: (entries: Array<Record<string, unknown>>) => void;
    disabled?: boolean;
  }) => (
    <button disabled={disabled} onClick={() => onFilesSelected(mocks.selectedEntries)}>
      Selecionar arquivo
    </button>
  ),
}));

vi.mock("@/components/import-progress", () => ({
  ImportProgress: ({
    entries,
    busy,
    onCancel,
  }: {
    entries: Array<{ file: File; status: string; errorMsg?: string }>;
    busy: boolean;
    onCancel?: () => void;
  }) => (
    <div>
      {busy && onCancel && <button onClick={onCancel}>Cancelar importação</button>}
      {entries.map((entry) => (
        <span key={entry.file.name}>{entry.errorMsg ?? entry.status}</span>
      ))}
    </div>
  ),
}));

vi.mock("@/components/import-history", () => ({ ImportHistory: () => null }));
vi.mock("@/components/import-calendar", () => ({ ImportCalendar: () => null }));
vi.mock("@/components/admin-data-coverage", () => ({ DataCoverage: () => null }));
vi.mock("@/hooks/use-wake-lock", () => ({ useWakeLock: () => undefined }));
vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => mocks.toastError(...args),
    info: (...args: unknown[]) => mocks.toastInfo(...args),
    success: (...args: unknown[]) => mocks.toastSuccess(...args),
  },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function uploadEntry(fileName: string, saleDate: string) {
  return {
    file: new File(["fixture"], fileName),
    saleDate,
    status: "pending",
    parsed: {
      kind: "sales",
      sale_date: saleDate,
      sales: [
        {
          store_code: "1516",
          store_name: "Loja Centro",
          depto: "PERECIVEIS",
          secao: "ACOUGUE",
          grupo: "BOVINOS",
          subgrupo: "CORTES",
          prod_code: "1",
          prod_name: "Produto 1",
          val_vda: 10,
        },
      ],
      stores: [{ store_code: "1516", store_name: "Loja Centro" }],
      products: [{ prod_code: "1", prod_name: "Produto 1" }],
    },
  };
}

async function startImport() {
  fireEvent.click(screen.getByRole("button", { name: "Selecionar arquivo" }));
  fireEvent.click(await screen.findByRole("button", { name: "Importar" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  mocks.beginImport.mockResolvedValue({ ok: true });
  mocks.cancelImport.mockResolvedValue({ ok: true });
  mocks.insertSalesChunk.mockResolvedValue({ inserted: 1 });
  mocks.finalizeImport.mockResolvedValue({ ok: true });
  mocks.getImportedDates.mockResolvedValue([]);
  mocks.getImportHistory.mockResolvedValue({ records: [], total: 0, limit: 25, offset: 0 });
  mocks.invalidateQueries.mockResolvedValue(undefined);
  mocks.refetch.mockResolvedValue(undefined);
  mocks.importedData = [];
  mocks.selectedEntries = [uploadEntry("vendas.xlsx", "2026-08-19")];
  mocks.blockerStatus = "idle";
  mocks.blockerOptions = null;
});

describe("UploadPage import confirmation", () => {
  it("blocks files with the same date instead of choosing one implicitly", async () => {
    mocks.selectedEntries = [
      uploadEntry("vendas-original.xlsx", "2026-08-19"),
      uploadEntry("vendas-corrigida.xlsx", "2026-08-19"),
    ];
    render(<UploadPage />);

    fireEvent.click(screen.getByRole("button", { name: "Selecionar arquivo" }));

    expect(await screen.findByRole("heading", { name: "Datas duplicadas no lote" })).toBeVisible();
    expect(screen.getAllByText("Data duplicada")).toHaveLength(2);
    expect(screen.getByText("vendas-original.xlsx")).toBeVisible();
    expect(screen.getByText("vendas-corrigida.xlsx")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Importar" })).not.toBeInTheDocument();
    expect(mocks.beginImport).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    await waitFor(() => expect(screen.queryByText("pending")).not.toBeInTheDocument());
  });

  it("identifies new files and replacements and sends consent per date", async () => {
    mocks.importedData = [
      { sale_date: "2026-08-18", row_count: 100, imported_at: "2026-08-18 10:00:00" },
    ];
    mocks.selectedEntries = [
      uploadEntry("existente.xlsx", "2026-08-18"),
      uploadEntry("nova.xlsx", "2026-08-19"),
    ];
    render(<UploadPage />);

    fireEvent.click(screen.getByRole("button", { name: "Selecionar arquivo" }));

    expect(await screen.findByText("Substituição")).toBeVisible();
    expect(screen.getByText("Nova importação")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Substituir dados" }));

    await waitFor(() => expect(mocks.beginImport).toHaveBeenCalledTimes(2));
    expect(mocks.beginImport).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ data: expect.objectContaining({ replace_existing: true }) }),
    );
    expect(mocks.beginImport).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ data: expect.objectContaining({ replace_existing: false }) }),
    );
  });

  it("stops without uploading when a date became existing after confirmation loaded", async () => {
    mocks.beginImport.mockRejectedValue(new Error(IMPORT_DATE_EXISTS_MESSAGE));
    render(<UploadPage />);

    await startImport();

    expect(await screen.findByText(IMPORT_DATE_EXISTS_MESSAGE)).toBeVisible();
    expect(mocks.beginImport).toHaveBeenCalledOnce();
    expect(mocks.insertSalesChunk).not.toHaveBeenCalled();
    expect(mocks.finalizeImport).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith(IMPORT_DATE_EXISTS_MESSAGE);
  });
});

describe("UploadPage import cancellation", () => {
  it("enables unload protection only while an import is active", async () => {
    const chunk = deferred<{ inserted: number }>();
    mocks.insertSalesChunk.mockReturnValueOnce(chunk.promise);
    render(<UploadPage />);

    expect(mocks.blockerOptions?.enableBeforeUnload()).toBe(false);
    await startImport();
    await waitFor(() => expect(mocks.insertSalesChunk).toHaveBeenCalledOnce());
    expect(mocks.blockerOptions?.shouldBlockFn()).toBe(true);
    expect(mocks.blockerOptions?.enableBeforeUnload()).toBe(true);

    await act(async () => {
      chunk.resolve({ inserted: 1 });
      await chunk.promise;
    });
    await waitFor(() => expect(mocks.finalizeImport).toHaveBeenCalledOnce());
    expect(mocks.blockerOptions?.shouldBlockFn()).toBe(false);
    expect(mocks.blockerOptions?.enableBeforeUnload()).toBe(false);
  });

  it("lets the operator remain on the page without cancelling", async () => {
    const chunk = deferred<{ inserted: number }>();
    mocks.insertSalesChunk.mockReturnValueOnce(chunk.promise);
    const { rerender } = render(<UploadPage />);

    await startImport();
    await waitFor(() => expect(mocks.insertSalesChunk).toHaveBeenCalledOnce());
    mocks.blockerStatus = "blocked";
    rerender(<UploadPage />);

    expect(
      await screen.findByRole("heading", { name: "Cancelar importação e sair?" }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Permanecer" }));
    expect(mocks.blockerReset).toHaveBeenCalledOnce();
    expect(mocks.cancelImport).not.toHaveBeenCalled();
    expect(mocks.blockerProceed).not.toHaveBeenCalled();

    mocks.blockerStatus = "idle";
    rerender(<UploadPage />);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar importação" }));
    await act(async () => {
      chunk.resolve({ inserted: 1 });
      await chunk.promise;
    });
  });

  it("releases the lease before proceeding with blocked navigation", async () => {
    const chunk = deferred<{ inserted: number }>();
    mocks.insertSalesChunk.mockReturnValueOnce(chunk.promise);
    const { rerender } = render(<UploadPage />);

    await startImport();
    await waitFor(() => expect(mocks.insertSalesChunk).toHaveBeenCalledOnce());
    mocks.blockerStatus = "blocked";
    rerender(<UploadPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar importação e sair" }));

    expect(mocks.blockerProceed).not.toHaveBeenCalled();
    await act(async () => {
      chunk.resolve({ inserted: 1 });
      await chunk.promise;
    });

    await waitFor(() => expect(mocks.blockerProceed).toHaveBeenCalledOnce());
    expect(mocks.cancelImport).toHaveBeenCalledOnce();
    expect(mocks.cancelImport.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.blockerProceed.mock.invocationCallOrder[0],
    );
  });

  it("stays on the upload page when lease release cannot be confirmed", async () => {
    const chunk = deferred<{ inserted: number }>();
    mocks.insertSalesChunk.mockReturnValueOnce(chunk.promise);
    mocks.cancelImport.mockRejectedValue(new Error("database unavailable"));
    const { rerender } = render(<UploadPage />);

    await startImport();
    await waitFor(() => expect(mocks.insertSalesChunk).toHaveBeenCalledOnce());
    mocks.blockerStatus = "blocked";
    rerender(<UploadPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar importação e sair" }));

    await act(async () => {
      chunk.resolve({ inserted: 1 });
      await chunk.promise;
    });

    await waitFor(() => expect(mocks.blockerReset).toHaveBeenCalledOnce());
    expect(mocks.blockerProceed).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith(IMPORT_CANCEL_FAILED_MESSAGE);
    expect(isImportActive(sessionStorage)).toBe(true);
    expect(mocks.blockerOptions?.shouldBlockFn()).toBe(true);

    mocks.cancelImport.mockResolvedValue({ ok: true });
    mocks.blockerStatus = "idle";
    rerender(<UploadPage />);
    mocks.blockerStatus = "blocked";
    rerender(<UploadPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar importação e sair" }));

    await waitFor(() => expect(mocks.blockerProceed).toHaveBeenCalledOnce());
    expect(isImportActive(sessionStorage)).toBe(false);
    expect(mocks.blockerOptions?.shouldBlockFn()).toBe(false);
  });

  it("refreshes complete dates and paginated history after an import", async () => {
    render(<UploadPage />);

    await startImport();

    await waitFor(() => expect(mocks.finalizeImport).toHaveBeenCalledOnce());
    expect(mocks.refetch).toHaveBeenCalledOnce();
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["import-history"] });
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Importação concluída!");
  });

  it("releases the lease after an in-flight final chunk and does not finalize or retry", async () => {
    const chunk = deferred<{ inserted: number }>();
    mocks.insertSalesChunk.mockReturnValueOnce(chunk.promise);
    render(<UploadPage />);

    await startImport();
    await waitFor(() => expect(mocks.insertSalesChunk).toHaveBeenCalledOnce());
    expect(isImportActive(sessionStorage)).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar importação" }));

    await act(async () => {
      chunk.resolve({ inserted: 1 });
      await chunk.promise;
    });

    const batchId = mocks.beginImport.mock.calls[0][0].data.batch_id;
    await waitFor(() =>
      expect(mocks.cancelImport).toHaveBeenCalledWith({ data: { batch_id: batchId } }),
    );
    expect(await screen.findByText("Cancelado")).toBeInTheDocument();
    expect(mocks.beginImport).toHaveBeenCalledOnce();
    expect(mocks.insertSalesChunk).toHaveBeenCalledOnce();
    expect(mocks.finalizeImport).not.toHaveBeenCalled();
    expect(mocks.toastInfo).toHaveBeenCalledWith("Importação cancelada.");
    expect(isImportActive(sessionStorage)).toBe(false);
  });

  it("reports a persistent cancellation failure without finalizing or retrying", async () => {
    const chunk = deferred<{ inserted: number }>();
    mocks.insertSalesChunk.mockReturnValueOnce(chunk.promise);
    mocks.cancelImport.mockRejectedValue(new Error("database unavailable"));
    render(<UploadPage />);

    await startImport();
    await waitFor(() => expect(mocks.insertSalesChunk).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "Cancelar importação" }));

    await act(async () => {
      chunk.resolve({ inserted: 1 });
      await chunk.promise;
    });

    expect(await screen.findByText(IMPORT_CANCEL_FAILED_MESSAGE)).toBeInTheDocument();
    expect(mocks.cancelImport).toHaveBeenCalledTimes(2);
    expect(mocks.beginImport).toHaveBeenCalledOnce();
    expect(mocks.insertSalesChunk).toHaveBeenCalledOnce();
    expect(mocks.finalizeImport).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith(IMPORT_CANCEL_FAILED_MESSAGE);
    expect(isImportActive(sessionStorage)).toBe(true);
  });

  it("shows an occupied lease immediately without sending chunks or retrying", async () => {
    mocks.beginImport.mockRejectedValue(new Error(IMPORT_BUSY_MESSAGE));
    render(<UploadPage />);

    await startImport();

    expect(await screen.findByText(IMPORT_BUSY_MESSAGE)).toBeInTheDocument();
    expect(mocks.beginImport).toHaveBeenCalledOnce();
    expect(mocks.insertSalesChunk).not.toHaveBeenCalled();
    expect(mocks.finalizeImport).not.toHaveBeenCalled();
    expect(mocks.toastInfo).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith(IMPORT_BUSY_MESSAGE);
  });
});
