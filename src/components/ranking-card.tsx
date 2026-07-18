import { fmtBRL } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface Item {
  name?: string;
  code?: string;
  val: number;
}

export function RankingCard({
  title,
  items,
  isLoading,
}: {
  title: string;
  items: Item[];
  isLoading?: boolean;
}) {
  return (
    <div className="kpi-card min-w-0">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm table-fixed">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="py-2 pr-3">Item</th>
              <th className="py-2 pl-2 text-right whitespace-nowrap w-[90px]">Venda</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => {
              const label = it.code ? `${it.code} - ${it.name ?? ""}` : (it.name ?? "");
              return (
                <tr key={`${label}-${i}`} className="border-b border-border/60">
                  <td className="py-2 pr-3 truncate" title={label} aria-label={label}>
                    {label}
                  </td>
                  <td className="num py-2 pl-2 text-right font-medium whitespace-nowrap">
                    {fmtBRL(it.val)}
                  </td>
                </tr>
              );
            })}
            {isLoading && (
              <tr>
                <td colSpan={2}>
                  <div className="space-y-2 py-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-5 w-full" />
                    ))}
                  </div>
                </td>
              </tr>
            )}
            {items.length === 0 && !isLoading && (
              <tr>
                <td colSpan={2} className="py-6 text-center text-xs text-muted-foreground">
                  Sem dados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
