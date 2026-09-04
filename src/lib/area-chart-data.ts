import type { DateVal } from "@/lib/api-types";

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export interface AreaWeekdayAverage {
  weekday: number;
  label: string;
  average: number;
  count: number;
}

export interface AreaChartScope {
  dateFrom: string;
  dateTo: string;
  stores: string[];
  deptos: string[];
  secoes: string[];
  grupos: string[];
  subgrupos: string[];
  products: string[];
}

export function buildAreaChartScopeKey(scope: AreaChartScope): string {
  return JSON.stringify([
    scope.dateFrom,
    scope.dateTo,
    scope.stores,
    scope.deptos,
    scope.secoes,
    scope.grupos,
    scope.subgrupos,
    scope.products,
  ]);
}

export function isAreaChartScopeUpdating(
  isFetching: boolean,
  responseScopeKey: string | undefined,
  currentScopeKey: string,
): boolean {
  return isFetching && responseScopeKey !== currentScopeKey;
}

export function buildAreaDailySeries(
  byDate: DateVal[],
  availableDates: string[],
  dateFrom: string,
  dateTo: string,
): DateVal[] {
  const periodSeries = byDate
    .filter((item) => item.date >= dateFrom && item.date <= dateTo)
    .sort((left, right) => left.date.localeCompare(right.date));
  const dates = availableDates
    .filter((date) => date >= dateFrom && date <= dateTo)
    .sort((left, right) => left.localeCompare(right));
  if (dates.length === 0) return periodSeries;

  const values = new Map(periodSeries.map((item) => [item.date, item.val]));
  return dates.map((date) => ({ date, val: values.get(date) ?? 0 }));
}

export function calculateAreaWeekdayAverages(series: DateVal[]): AreaWeekdayAverage[] {
  const totals = Array.from({ length: 7 }, () => ({ sum: 0, count: 0 }));
  for (const item of series) {
    const weekday = new Date(`${item.date}T00:00:00Z`).getUTCDay();
    totals[weekday].sum += item.val;
    totals[weekday].count += 1;
  }
  return totals.flatMap((item, weekday) =>
    item.count > 0
      ? [
          {
            weekday,
            label: WEEKDAYS[weekday],
            average: item.sum / item.count,
            count: item.count,
          },
        ]
      : [],
  );
}
