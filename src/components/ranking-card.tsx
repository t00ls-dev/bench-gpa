import { fmtBRL } from "@/components/kpi-card";

interface Item { name?: string; code?: string; val: number }

export function RankingCard({ title, items, isLoading }: { title: string; items: Item[]; isLoading?: boolean }) {
  const total = items.reduce((s, i) => s + (i.val || 0), 0);
  return (
    <div className="kpi-card min-w-0">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm table-fixed">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="py-2 pr-3">Item</th>
              <th className="py-2 px-2 text-right whitespace-nowrap w-[90px]">Venda</th>
              <th className="py-2 pl-2 text-right whitespace-nowrap w-[64px]">%</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => {
              const pct = total > 0 ? (it.val / total) * 100 : 0;
              const label = it.code ? `${it.code} - ${it.name ?? ""}` : (it.name ?? "");
              return (
                <tr key={`${label}-${i}`} className="border-b border-border/60">
                  <td className="py-2 pr-3 truncate" title={label}>{label}</td>
                  <td className="num py-2 px-2 text-right font-medium whitespace-nowrap">{fmtBRL(it.val)}</td>
                  <td className="num py-2 pl-2 text-right text-muted-foreground whitespace-nowrap">{pct.toFixed(1)}%</td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr><td colSpan={3} className="py-6 text-center text-xs text-muted-foreground">
                {isLoading ? "Carregando…" : "Sem dados."}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
