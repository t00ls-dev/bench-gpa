import { useState } from "react";
import type { DbHealthData } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Database, HardDrive, Server, Activity, Loader2 } from "lucide-react";

function fmtSize(bytes: number): string {
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} kB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export function DataCountSection({
  diagnoseFn,
}: {
  diagnoseFn: () => Promise<Record<string, unknown>>;
}) {
  const [diag, setDiag] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);

  const runDiagnose = async () => {
    setLoading(true);
    try {
      const r = await diagnoseFn();
      setDiag(r as Record<string, unknown>);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao diagnosticar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="kpi-card space-y-3">
      <p className="text-sm text-muted-foreground">Contagem de registros nas tabelas do sistema.</p>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={runDiagnose} disabled={loading}>
          {loading ? (
            <Loader2 className="size-4 animate-spin mr-1" />
          ) : (
            <Database className="size-4 mr-1" />
          )}
          Contar registros
        </Button>
      </div>

      {diag && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-left uppercase tracking-wider text-muted-foreground">
                <th className="py-2 pr-4">Tabela</th>
                <th className="py-2 text-right">Registros</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["staging_sales", "Staging (vendas brutas)"],
                ["sales_daily_agg", "Vendas (agregadas)"],
                ["filter_hierarchy", "Hierarquia de filtros"],
                ["products", "Produtos"],
                ["stores", "Lojas"],
                ["import_log", "Log de importações"],
              ].map(([key, label]) => (
                <tr key={key} className="border-b border-border/40">
                  <td className="py-1.5 pr-4">{label}</td>
                  <td className="py-1.5 text-right font-mono">
                    {Number(diag[key] ?? 0).toLocaleString("pt-BR")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function DbHealthSection({ healthFn }: { healthFn: () => Promise<DbHealthData> }) {
  const [data, setData] = useState<DbHealthData | null>(null);
  const [loading, setLoading] = useState(false);

  const runCheck = async () => {
    setLoading(true);
    try {
      const r = await healthFn();
      setData(r);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao verificar saúde do banco");
    } finally {
      setLoading(false);
    }
  };

  const pctColor = data
    ? data.pct_used >= 85
      ? "bg-destructive"
      : data.pct_used >= 60
        ? "bg-warning"
        : "bg-success"
    : "bg-muted";

  return (
    <div className="kpi-card space-y-3">
      <p className="text-sm text-muted-foreground">
        Armazenamento total do banco versus o limite de 500 MB do plano free.
      </p>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={runCheck} disabled={loading}>
          {loading ? (
            <Loader2 className="size-4 animate-spin mr-1" />
          ) : (
            <Server className="size-4 mr-1" />
          )}
          Verificar
        </Button>
      </div>

      {data && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium flex items-center gap-1.5">
                <HardDrive className="size-4 text-muted-foreground" />
                Uso do banco
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                {data.db_size_pretty} / {data.free_limit_pretty}
              </span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full transition-all ${pctColor}`}
                style={{ width: `${Math.min(data.pct_used, 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{data.pct_used}% utilizado</span>
              <span>{Math.max(0, 100 - data.pct_used).toFixed(1)}% livre</span>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Activity className="size-3.5" /> {data.active_connections} conexões ativas
            </span>
            <span>PG {data.version}</span>
          </div>

          <div className="max-h-64 overflow-x-auto overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b text-left uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-4">Tabela</th>
                  <th className="py-2 pr-4 text-right">Tamanho</th>
                  <th className="py-2 text-right">Linhas (aprox.)</th>
                </tr>
              </thead>
              <tbody>
                {data.tables
                  .filter((t) => t.schema === "public")
                  .map((t) => (
                    <tr key={t.table} className="border-b border-border/40">
                      <td className="py-1.5 pr-4 font-mono text-foreground">{t.table}</td>
                      <td className="py-1.5 pr-4 text-right font-mono">{fmtSize(t.total_size)}</td>
                      <td className="py-1.5 text-right font-mono">
                        {t.row_estimate.toLocaleString("pt-BR")}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
