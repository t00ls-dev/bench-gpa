// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  buildAreaChartScopeKey,
  buildAreaDailySeries,
  calculateAreaWeekdayAverages,
  isAreaChartScopeUpdating,
} from "@/lib/area-chart-data";
import { AreaCharts } from "./area-charts";

vi.mock("recharts", () => {
  const Container = ({ children }: PropsWithChildren) => <div>{children}</div>;
  return {
    ResponsiveContainer: Container,
    LineChart: Container,
    Line: () => null,
    BarChart: Container,
    Bar: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
    XAxis: () => null,
    YAxis: () => null,
  };
});

const fourteenDates = Array.from({ length: 14 }, (_, index) => {
  const date = new Date(Date.UTC(2026, 7, 2 + index));
  return date.toISOString().slice(0, 10);
});

describe("area chart calculations", () => {
  it("detects stale chart data while a different filter scope is loading", () => {
    const currentScope = buildAreaChartScopeKey({
      dateFrom: "2026-08-02",
      dateTo: "2026-08-15",
      stores: ["1516"],
      deptos: [],
      secoes: [],
      grupos: [],
      subgrupos: [],
      products: ["100", "200"],
    });

    expect(isAreaChartScopeUpdating(true, "previous-scope", currentScope)).toBe(true);
    expect(isAreaChartScopeUpdating(true, currentScope, currentScope)).toBe(false);
    expect(isAreaChartScopeUpdating(false, "previous-scope", currentScope)).toBe(false);
  });

  it("fills imported dates without sales and excludes dates outside the selected period", () => {
    expect(
      buildAreaDailySeries(
        [
          { date: "2026-08-02", val: 100 },
          { date: "2026-08-04", val: 300 },
        ],
        ["2026-08-01", "2026-08-02", "2026-08-03", "2026-08-04", "2026-08-05"],
        "2026-08-02",
        "2026-08-04",
      ),
    ).toEqual([
      { date: "2026-08-02", val: 100 },
      { date: "2026-08-03", val: 0 },
      { date: "2026-08-04", val: 300 },
    ]);
  });

  it("keeps fallback sales data inside the selected period", () => {
    expect(
      buildAreaDailySeries(
        [
          { date: "2026-08-01", val: 50 },
          { date: "2026-08-02", val: 100 },
          { date: "2026-08-05", val: 500 },
        ],
        [],
        "2026-08-02",
        "2026-08-04",
      ),
    ).toEqual([{ date: "2026-08-02", val: 100 }]);
  });

  it("calculates weekday averages with their sample counts", () => {
    const series = fourteenDates.map((date, index) => ({ date, val: (index % 7) * 100 }));

    expect(calculateAreaWeekdayAverages(series)).toEqual([
      { weekday: 0, label: "Dom", average: 0, count: 2 },
      { weekday: 1, label: "Seg", average: 100, count: 2 },
      { weekday: 2, label: "Ter", average: 200, count: 2 },
      { weekday: 3, label: "Qua", average: 300, count: 2 },
      { weekday: 4, label: "Qui", average: 400, count: 2 },
      { weekday: 5, label: "Sex", average: 500, count: 2 },
      { weekday: 6, label: "Sáb", average: 600, count: 2 },
    ]);
  });
});

describe("AreaCharts", () => {
  it("shows evolution and the weekday comparison for a comparable period", () => {
    const byDate = fourteenDates.map((date, index) => ({ date, val: (index + 1) * 100 }));
    render(
      <AreaCharts
        byDate={byDate}
        availableDates={fourteenDates}
        dateFrom={fourteenDates[0]}
        dateTo={fourteenDates.at(-1) ?? ""}
      />,
    );

    expect(screen.getByRole("heading", { name: "Evolução das vendas" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Média por dia da semana" })).toBeInTheDocument();
    expect(screen.getByText(/Pico em 15\/08\/26/)).toBeInTheDocument();
  });

  it("does not show a weekday comparison based on one occurrence", () => {
    const dates = fourteenDates.slice(0, 7);
    render(
      <AreaCharts
        byDate={dates.map((date) => ({ date, val: 100 }))}
        availableDates={dates}
        dateFrom={dates[0]}
        dateTo={dates.at(-1) ?? ""}
      />,
    );

    expect(
      screen.queryByRole("heading", { name: "Média por dia da semana" }),
    ).not.toBeInTheDocument();
  });

  it("omits weekdays that do not have repeated samples", () => {
    const dates = fourteenDates.slice(0, 9);
    render(
      <AreaCharts
        byDate={dates.map((date) => ({ date, val: 100 }))}
        availableDates={dates}
        dateFrom={dates[0]}
        dateTo={dates.at(-1) ?? ""}
      />,
    );

    const table = screen.getByRole("table", {
      name: "Média de vendas da área por dia da semana",
    });
    expect(table).toHaveTextContent("Dom");
    expect(table).toHaveTextContent("Seg");
    expect(table).not.toHaveTextContent("Ter");
  });

  it("shows an explicit empty state", () => {
    render(
      <AreaCharts byDate={[]} availableDates={[]} dateFrom="2026-08-01" dateTo="2026-08-07" />,
    );

    expect(
      screen.getByText("Não há datas disponíveis para exibir a evolução."),
    ).toBeInTheDocument();
  });
});
