import { useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import type { AuditRow, HeartbeatRow } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Activity,
  Loader2,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { fmtDT } from "@/lib/utils";

const PAGE_SIZE = 50;

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

// ---- Heartbeat ----

export function HeartbeatSection({
  heartbeatsFn,
}: {
  heartbeatsFn: () => Promise<HeartbeatRow[]>;
}) {
  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ["admin-heartbeats"],
    queryFn: () => heartbeatsFn(),
    staleTime: 30_000,
    retry: false,
  });

  return (
    <div className="kpi-card space-y-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Última execução de cada cron e se está rodando no prazo.
        </p>
        <RefreshButton fetching={isFetching} onClick={() => refetch()} />
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : isError ? (
        <ErrorRow msg={error instanceof Error ? error.message : "Erro ao carregar heartbeat"} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {data?.map((hb) => (
            <HeartbeatCard key={hb.job} hb={hb} />
          ))}
        </div>
      )}
    </div>
  );
}

function HeartbeatCard({ hb }: { hb: HeartbeatRow }) {
  const never = hb.last_run_at == null;
  const tone = hb.overdue
    ? "border-destructive/40 bg-destructive/5"
    : "border-success/40 bg-success/5";

  return (
    <div className={`rounded-lg border p-3 space-y-2 ${tone}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-sm flex items-center gap-1.5">
          <Clock className="size-4 text-muted-foreground" /> {hb.label}
        </span>
        {hb.overdue ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-medium text-destructive">
            <AlertTriangle className="size-3" /> {never ? "Nunca executou" : "Atrasado"}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-medium text-success">
            <CheckCircle2 className="size-3" /> Em dia
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">Esperado: {hb.schedule}</p>
      {!never && (
        <>
          <p className="text-xs">
            <span className="text-muted-foreground">Último run: </span>
            <span className="font-mono">{fmtDT(hb.last_run_at)}</span>
            {hb.last_status === "fail" && (
              <span className="ml-1.5 font-medium text-destructive">(falhou)</span>
            )}
          </p>
          {hb.last_detail && <p className="text-xs text-muted-foreground">{hb.last_detail}</p>}
          {hb.last_duration_ms != null && (
            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Activity className="size-3" /> {(hb.last_duration_ms / 1000).toFixed(1)}s
            </p>
          )}
        </>
      )}
    </div>
  );
}

// ---- Audit log ----

const ACTION_META: Record<string, { label: string; className: string }> = {
  "auth.login": { label: "Login", className: "bg-success/15 text-success" },
  "auth.login_failed": { label: "Login falhou", className: "bg-destructive/15 text-destructive" },
  "auth.logout": { label: "Logout", className: "bg-muted text-muted-foreground" },
  "user.create": { label: "Criou usuário", className: "bg-primary/15 text-primary" },
  "user.role_change": { label: "Alterou papel", className: "bg-primary/15 text-primary" },
  "user.activate": { label: "Reativou usuário", className: "bg-success/15 text-success" },
  "user.deactivate": { label: "Inativou usuário", className: "bg-destructive/15 text-destructive" },
  "user.password_reset": { label: "Redefiniu senha", className: "bg-warning/15 text-warning" },
  "data.purge": { label: "Purga de dados", className: "bg-warning/15 text-warning" },
};

function ActionBadge({ action }: { action: string }) {
  const meta = ACTION_META[action] ?? {
    label: action,
    className: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${meta.className}`}
    >
      {meta.label}
    </span>
  );
}

export function AuditLogSection({
  auditFn,
}: {
  auditFn: (p: { limit: number; offset: number }) => Promise<{
    events: AuditRow[];
    total: number;
    limit: number;
    offset: number;
  }>;
}) {
  const [page, setPage] = useState(0);
  const offset = page * PAGE_SIZE;

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ["admin-audit", offset],
    queryFn: () => auditFn({ limit: PAGE_SIZE, offset }),
    staleTime: 15_000,
    placeholderData: keepPreviousData,
    retry: false,
  });

  const total = data?.total ?? 0;
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + PAGE_SIZE, total);
  const hasPrev = page > 0;
  const hasNext = offset + PAGE_SIZE < total;

  return (
    <div className="kpi-card space-y-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Ações sensíveis de autenticação e administração, mais recentes primeiro.
        </p>
        <RefreshButton fetching={isFetching} onClick={() => refetch()} />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-full" />
          ))}
        </div>
      ) : isError ? (
        <ErrorRow msg={error instanceof Error ? error.message : "Erro ao carregar auditoria"} />
      ) : !data || data.events.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">Nenhum evento registrado.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                  <th className="py-2 pr-3">Quando</th>
                  <th className="py-2 pr-3">Ação</th>
                  <th className="py-2 pr-3">Ator</th>
                  <th className="py-2 pr-3">Detalhe</th>
                  <th className="py-2 pl-3 text-right">IP</th>
                </tr>
              </thead>
              <tbody>
                {data.events.map((ev) => (
                  <tr key={ev.id} className="border-b border-border/40 whitespace-nowrap">
                    <td className="py-1.5 pr-3 font-mono">{fmtDT(ev.created_at)}</td>
                    <td className="py-1.5 pr-3">
                      <ActionBadge action={ev.action} />
                    </td>
                    <td className="py-1.5 pr-3">{ev.actor_email ?? "—"}</td>
                    <td className="py-1.5 pr-3 text-muted-foreground">{ev.detail ?? "—"}</td>
                    <td className="py-1.5 pl-3 text-right font-mono text-muted-foreground">
                      {ev.ip ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            <span className="text-xs text-muted-foreground">
              {from}–{to} de {total.toLocaleString("pt-BR")}
            </span>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={!hasPrev}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!hasNext}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
