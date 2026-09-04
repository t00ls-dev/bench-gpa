import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DateVal } from "@/lib/api-types";
import {
  buildAreaDailySeries,
  calculateAreaWeekdayAverages,
  type AreaWeekdayAverage,
} from "@/lib/area-chart-data";
import { cn, fmtBRL, fmtBRShort } from "@/lib/utils";

function yAxisValue(value: number): string {
  if (Math.abs(value) < 1_000) return String(Math.round(value));
  return `${Math.round(value / 1_000)}k`;
}

export interface AreaChartsProps {
  byDate: DateVal[];
  availableDates: string[];
  dateFrom: string;
  dateTo: string;
}

export function AreaCharts({ byDate, availableDates, dateFrom, dateTo }: AreaChartsProps) {
  const dailySeries = buildAreaDailySeries(byDate, availableDates, dateFrom, dateTo);
  const weekdayAverages = calculateAreaWeekdayAverages(dailySeries);
  const comparableWeekdays = weekdayAverages.filter((item) => item.count >= 2);
  const hasWeekdayComparison = comparableWeekdays.length >= 2;
  const peak = dailySeries.reduce<DateVal | null>(
    (highest, item) => (!highest || item.val > highest.val ? item : highest),
    null,
  );
  const lowest = dailySeries.reduce<DateVal | null>(
    (smallest, item) => (!smallest || item.val < smallest.val ? item : smallest),
    null,
  );

  return (
    <section className={cn("mb-4 grid gap-4", hasWeekdayComparison && "lg:grid-cols-2")}>
      <div className="kpi-card min-w-0" aria-labelledby="area-daily-sales-title">
        <h2 id="area-daily-sales-title" className="font-display text-lg font-semibold">
          Evolução das vendas
        </h2>
        <p className="text-xs text-muted-foreground">
          Venda diária da área no período selecionado.
        </p>
        <div className="mt-4 h-64">
          {dailySeries.length === 0 ? (
            <div className="flex h-full items-center justify-center rounded-lg border border-dashed px-4 text-center text-sm text-muted-foreground">
              Não há datas disponíveis para exibir a evolução.
            </div>
          ) : (
            <div className="h-full" aria-hidden="true">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dailySeries} margin={{ left: 4, right: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(value) => fmtBRShort(String(value))}
                    minTickGap={20}
                  />
                  <YAxis
                    width={44}
                    tick={{ fontSize: 10 }}
                    tickFormatter={(value) => yAxisValue(Number(value))}
                  />
                  <Tooltip
                    formatter={(value) => [fmtBRL(Number(value)), "Venda"]}
                    labelFormatter={(value) => fmtBRShort(String(value))}
                  />
                  <Line
                    type="monotone"
                    dataKey="val"
                    name="Venda"
                    stroke="var(--chart-1)"
                    strokeWidth={2.5}
                    dot={dailySeries.length <= 14}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
        {peak && lowest ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Pico em {fmtBRShort(peak.date)}: {fmtBRL(peak.val)}. Menor venda em{" "}
            {fmtBRShort(lowest.date)}: {fmtBRL(lowest.val)}.
          </p>
        ) : null}
        {dailySeries.length > 0 ? (
          <table className="sr-only">
            <caption>Vendas diárias da área</caption>
            <thead>
              <tr>
                <th>Data</th>
                <th>Venda</th>
              </tr>
            </thead>
            <tbody>
              {dailySeries.map((item) => (
                <tr key={item.date}>
                  <td>{fmtBRShort(item.date)}</td>
                  <td>{fmtBRL(item.val)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>

      {hasWeekdayComparison ? (
        <div className="kpi-card min-w-0" aria-labelledby="area-weekday-sales-title">
          <h2 id="area-weekday-sales-title" className="font-display text-lg font-semibold">
            Média por dia da semana
          </h2>
          <p className="text-xs text-muted-foreground">
            Compara a venda média da área em dias equivalentes do período.
          </p>
          <div className="mt-4 h-64" aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={comparableWeekdays} margin={{ left: 4, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis
                  width={44}
                  tick={{ fontSize: 10 }}
                  tickFormatter={(value) => yAxisValue(Number(value))}
                />
                <Tooltip
                  formatter={(value) => [fmtBRL(Number(value)), "Média"]}
                  labelFormatter={(label, payload) => {
                    const item = payload?.[0]?.payload as AreaWeekdayAverage | undefined;
                    return item ? `${String(label)} · ${item.count} dia(s)` : String(label);
                  }}
                />
                <Bar dataKey="average" name="Média" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <table className="sr-only">
            <caption>Média de vendas da área por dia da semana</caption>
            <thead>
              <tr>
                <th>Dia da semana</th>
                <th>Média</th>
                <th>Dias considerados</th>
              </tr>
            </thead>
            <tbody>
              {comparableWeekdays.map((item) => (
                <tr key={item.weekday}>
                  <td>{item.label}</td>
                  <td>{fmtBRL(item.average)}</td>
                  <td>{item.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
