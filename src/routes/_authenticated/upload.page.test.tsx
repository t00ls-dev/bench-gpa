// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IMPORT_BUSY_MESSAGE, IMPORT_CANCEL_FAILED_MESSAGE } from "@/lib/import-config";
import UploadPage from "./upload.page";

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
}));

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: unknown) => fn,
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
  useQuery: () => ({
    data: [],
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
    <button
      disabled={disabled}
      onClick={() =>
        onFilesSelected([
          {
            file: new File(["fixture"], "vendas.xlsx"),
            saleDate: "2026-08-19",
            status: "pending",
            parsed: {
              kind: "sales",
              sale_date: "2026-08-19",
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
          },
        ])
      }
    >
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

async function startImport() {
  fireEvent.click(screen.getByRole("button", { name: "Selecionar arquivo" }));
  fireEvent.click(await screen.findByRole("button", { name: "Importar" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.beginImport.mockResolvedValue({ ok: true });
  mocks.cancelImport.mockResolvedValue({ ok: true });
  mocks.insertSalesChunk.mockResolvedValue({ inserted: 1 });
  mocks.finalizeImport.mockResolvedValue({ ok: true });
  mocks.getImportedDates.mockResolvedValue([]);
  mocks.getImportHistory.mockResolvedValue({ records: [], total: 0, limit: 25, offset: 0 });
  mocks.invalidateQueries.mockResolvedValue(undefined);
  mocks.refetch.mockResolvedValue(undefined);
});

describe("UploadPage import cancellation", () => {
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
