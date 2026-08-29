// @vitest-environment jsdom
import type { ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ImportHistory } from "./import-history";
import type { ImportHistoryRow } from "@/lib/upload.functions";

const RECORD: ImportHistoryRow = {
  sale_date: "2026-07-20",
  row_count: 1234,
  imported_at: "2026-07-20 10:00:00",
};

function renderWithClient(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("ImportHistory", () => {
  it("requests 25 records by default and renders the table", async () => {
    const historyFn = vi.fn().mockResolvedValue({
      records: [RECORD],
      total: 1,
      limit: 25,
      offset: 0,
    });
    renderWithClient(<ImportHistory historyFn={historyFn} />);

    expect(await screen.findByText("1.234")).toBeInTheDocument();
    expect(historyFn).toHaveBeenCalledWith({
      search: "",
      sortBy: "sale_date",
      sortDir: "desc",
      limit: 25,
      offset: 0,
    });
    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "Data",
      "Linhas",
      "Atualizado",
    ]);
  });

  it("paginates and sorts on the server", async () => {
    const historyFn = vi.fn().mockResolvedValue({
      records: [RECORD],
      total: 60,
      limit: 25,
      offset: 0,
    });
    renderWithClient(<ImportHistory historyFn={historyFn} />);
    await screen.findByRole("table");

    fireEvent.click(screen.getByRole("button", { name: "Próxima página" }));
    await waitFor(() =>
      expect(historyFn).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 25 })),
    );
    expect(screen.getByText("Página 2 de 3")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Linhas" }));
    await waitFor(() =>
      expect(historyFn).toHaveBeenLastCalledWith(
        expect.objectContaining({ sortBy: "row_count", sortDir: "desc", offset: 0 }),
      ),
    );
    expect(screen.getByRole("columnheader", { name: "Linhas" })).toHaveAttribute(
      "aria-sort",
      "descending",
    );
  });

  it("debounces search and keeps controls in the empty state", async () => {
    const historyFn = vi.fn().mockImplementation((query: { search: string }) =>
      Promise.resolve({
        records: query.search ? [] : [RECORD],
        total: query.search ? 0 : 1,
        limit: 25,
        offset: 0,
      }),
    );
    renderWithClient(<ImportHistory historyFn={historyFn} />);
    await screen.findByRole("table");

    fireEvent.change(screen.getByRole("textbox", { name: "Buscar no histórico de importações" }), {
      target: { value: "20/07" },
    });

    expect(historyFn).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Nenhuma importação encontrada.")).toBeInTheDocument();
    expect(historyFn).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: "20/07", offset: 0 }),
    );
    expect(screen.getByRole("button", { name: "Limpar busca" })).toBeInTheDocument();
  });

  it("uses the shared page-size selector", async () => {
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    const historyFn = vi.fn().mockResolvedValue({
      records: [RECORD],
      total: 300,
      limit: 25,
      offset: 0,
    });
    renderWithClient(<ImportHistory historyFn={historyFn} />);
    await screen.findByRole("table");

    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });
    fireEvent.click(await screen.findByRole("option", { name: "100 / página" }));

    await waitFor(() =>
      expect(historyFn).toHaveBeenLastCalledWith(
        expect.objectContaining({ limit: 100, offset: 0 }),
      ),
    );
  });
});
