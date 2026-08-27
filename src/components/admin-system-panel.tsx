import { useQuery } from "@tanstack/react-query";
import type { DbHealthData } from "@/lib/admin-system.functions";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { HardDrive, Activity, Loader2, RefreshCw, AlertTriangle } from "lucide-react";
import { fmtBytes } from "@/lib/utils";
import { QUERY_STALE_ADMIN } from "@/lib/query-config";

function RefreshButton({ fetching, onClick }: { fetching: boolean; onClick: () => void }) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={fetching}
      aria-label="Atualizar"
    >
      {fetching ? (
        <Loader2 className="size-4 animate-spin sm:mr-1" />
      ) : (
        <RefreshCw className="size-4 sm:mr-1" />
      )}
      <span className="hidden sm:inline">Atualizar</span>
    </Button>
  );
}

function ErrorRow({ msg }: { msg: string }) {
  return (
    <p className="flex items-center gap-1.5 text-sm text-destructive">
      <AlertTriangle className="size-4 shrink-0" /> {msg}
    </p>
  );
}

export function DataCountSection({
  diagnoseFn,
}: {
  diagnoseFn: () => Promise<Record<string, unknown>>;
}) {
  const {
    data: diag,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["admin-diagnose"],
    queryFn: () => diagnoseFn(),
    staleTime: QUERY_STALE_ADMIN,
    retry: false,
  });

  return (
    <div className="kpi-card min-w-0 space-y-3 overflow-hidden">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Contagem de registros nas tabelas do sistema.
        </p>
        <RefreshButton fetching={isFetching} onClick={() => refetch()} />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-full" />
          ))}
        </div>
      ) : isError ? (
        <ErrorRow msg={error instanceof Error ? error.message : "Erro ao diagnosticar"} />
      ) : (
        diag && (
          <div className="max-w-full overflow-x-auto">
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
        )
      )}
    </div>
  );
}

export function DbHealthSection({ healthFn }: { healthFn: () => Promise<DbHealthData> }) {
  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ["admin-db-health"],
    queryFn: () => healthFn(),
    staleTime: QUERY_STALE_ADMIN,
    retry: false,
  });

  return (
    <div className="kpi-card min-w-0 space-y-3 overflow-hidden">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-muted-foreground">Tamanho total do banco, versão e tabelas.</p>
        <RefreshButton fetching={isFetching} onClick={() => refetch()} />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : isError ? (
        <ErrorRow
          msg={error instanceof Error ? error.message : "Erro ao verificar saúde do banco"}
        />
      ) : (
        data && (
          <div className="min-w-0 space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium flex items-center gap-1.5">
                <HardDrive className="size-4 text-muted-foreground" />
                Tamanho do banco
              </span>
              <span className="font-mono text-xs text-muted-foreground">{data.db_size_pretty}</span>
            </div>

            <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Activity className="size-3.5" /> {data.active_connections} conexões ativas
              </span>
              <span>MariaDB {data.version}</span>
            </div>

            <div className="max-h-64 max-w-full overflow-x-auto overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-background">
                  <tr className="border-b text-left uppercase tracking-wider text-muted-foreground">
                    <th className="py-2 pr-4">Tabela</th>
                    <th className="py-2 pr-4 text-right">Tamanho</th>
                    <th className="py-2 text-right">Linhas (aprox.)</th>
                  </tr>
                </thead>
                <tbody>
                  {data.tables.map((t) => (
                    <tr key={t.table} className="border-b border-border/40">
                      <td className="py-1.5 pr-4 font-mono text-foreground">{t.table}</td>
                      <td className="py-1.5 pr-4 text-right font-mono">{fmtBytes(t.total_size)}</td>
                      <td className="py-1.5 text-right font-mono">
                        {t.row_estimate.toLocaleString("pt-BR")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}
    </div>
  );
}
