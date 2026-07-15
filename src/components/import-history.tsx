import { fmtBRShort, fmtInt, fmtDT } from "@/lib/utils";

interface ImportRecord {
  sale_date: string;
  row_count: number;
  imported_at: string;
}

export function ImportHistory({ dates }: { dates: ImportRecord[] | undefined }) {
  return (
    <div className="mt-6 kpi-card">
      <h2 className="font-display text-base font-semibold mb-3">Histórico de importações</h2>
      <div className="max-h-96 overflow-y-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="py-2">Data</th>
              <th className="py-2 text-right">Linhas</th>
              <th className="py-2 text-right">Atualizado</th>
            </tr>
          </thead>
          <tbody>
            {(dates ?? []).map((d) => (
              <tr key={d.sale_date} className="border-b border-border/60">
                <td className="py-2 font-medium">{fmtBRShort(d.sale_date)}</td>
                <td className="num py-2 text-right">{fmtInt(d.row_count)}</td>
                <td className="py-2 text-right text-xs text-muted-foreground">
                  {fmtDT(d.imported_at)}
                </td>
              </tr>
            ))}
            {(!dates || dates.length === 0) && (
              <tr>
                <td colSpan={3} className="py-6 text-center text-xs text-muted-foreground">
                  Nenhuma data importada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
