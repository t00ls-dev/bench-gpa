import { useEffect, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import type { AuditRow, HeartbeatRow } from "@/lib/admin-system.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Activity,
  Loader2,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Search,
  X,
} from "lucide-react";
import { cn, fmtDT } from "@/lib/utils";
import { QUERY_STALE_ADMIN, QUERY_STALE_LIVE } from "@/lib/query-config";
import { buildAuditTooltip } from "@/lib/audit-tooltip";
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS, type AuditLogQuery } from "@/lib/schemas";

const SEARCH_DEBOUNCE_MS = 250;

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
    staleTime: QUERY_STALE_ADMIN,
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
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium text-sm flex items-center gap-1.5 min-w-0">
          <Clock className="size-4 text-muted-foreground shrink-0" />
          {hb.hint ? (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="cursor-pointer border-0 bg-transparent p-0 text-left font-medium text-sm underline decoration-dotted underline-offset-2"
                >
                  {hb.label}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-64 text-xs" side="top" align="start">
                {hb.hint}
              </PopoverContent>
            </Popover>
          ) : (
            hb.label
          )}
        </span>
        {hb.overdue ? (
          <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-medium text-destructive">
            <AlertTriangle className="size-3" /> {never ? "Nunca executou" : "Atrasado"}
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-medium text-success">
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
  "auth.first_access_failed": {
    label: "Primeiro acesso falhou",
    className: "bg-destructive/15 text-destructive",
  },
  "auth.first_access_completed": {
    label: "Primeiro acesso concluído",
    className: "bg-success/15 text-success",
  },
  "auth.password_change": {
    label: "Trocou a própria senha",
    className: "bg-primary/15 text-primary",
  },
  "user.create": { label: "Criou usuário", className: "bg-primary/15 text-primary" },
  "user.role_change": { label: "Alterou papel", className: "bg-primary/15 text-primary" },
  "user.activate": { label: "Reativou usuário", className: "bg-success/15 text-success" },
  "user.deactivate": { label: "Inativou usuário", className: "bg-destructive/15 text-destructive" },
  "user.password_reset": { label: "Redefiniu senha", className: "bg-warning/15 text-warning" },
  "user.identifiers_update": {
    label: "Atualizou identificadores",
    className: "bg-primary/15 text-primary",
  },
  "user.update": { label: "Atualizou usuário", className: "bg-primary/15 text-primary" },
  "saved_area.transfer": {
    label: "Transferiu área",
    className: "bg-primary/15 text-primary",
  },
  "data.purge": { label: "Purga de dados", className: "bg-warning/15 text-warning" },
};

function ActionBadge({
  action,
  targetUsername,
  detail,
}: {
  action: string;
  targetUsername: string | null;
  detail: string | null;
}) {
  const meta = ACTION_META[action] ?? {
    label: action,
    className: "bg-muted text-muted-foreground",
  };
  const badge = (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${meta.className}`}
    >
      {meta.label}
    </span>
  );
  const tooltip = buildAuditTooltip(action, targetUsername, detail);
  if (!tooltip) return badge;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="cursor-pointer border-0 bg-transparent p-0 underline decoration-dotted underline-offset-4"
        >
          {badge}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 text-xs" side="top" align="start">
        {tooltip}
      </PopoverContent>
    </Popover>
  );
}

type AuditSortKey = AuditLogQuery["sortBy"];

function SortHeader({
  label,
  sortKey,
  activeKey,
  sortDir,
  align = "left",
  onToggle,
}: {
  label: string;
  sortKey: AuditSortKey;
  activeKey: AuditSortKey;
  sortDir: AuditLogQuery["sortDir"];
  align?: "left" | "right";
  onToggle: (key: AuditSortKey) => void;
}) {
  const active = sortKey === activeKey;
  const directionLabel = sortDir === "asc" ? "crescente" : "decrescente";
  return (
    <th
      className={cn("py-2", align === "right" ? "pl-3 text-right" : "pr-3")}
      aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onToggle(sortKey)}
        aria-label={`${label}${active ? ` (ordenado ${directionLabel})` : ""}`}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground",
          align === "right" && "flex-row-reverse",
          active && "text-foreground",
        )}
      >
        {label}
        {active &&
          (sortDir === "asc" ? (
            <ChevronUp className="size-3" />
          ) : (
            <ChevronDown className="size-3" />
          ))}
      </button>
    </th>
  );
}

export function AuditLogSection({
  auditFn,
}: {
  auditFn: (p: AuditLogQuery) => Promise<{
    events: AuditRow[];
    total: number;
    limit: number;
    offset: number;
  }>;
}) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortBy, setSortBy] = useState<AuditSortKey>("created_at");
  const [sortDir, setSortDir] = useState<AuditLogQuery["sortDir"]>("desc");
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(DEFAULT_PAGE_SIZE);
  const [page, setPage] = useState(1);
  const offset = (page - 1) * pageSize;

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timeout);
  }, [search]);

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ["admin-audit", debouncedSearch, sortBy, sortDir, pageSize, offset],
    queryFn: () => auditFn({ search: debouncedSearch, sortBy, sortDir, limit: pageSize, offset }),
    staleTime: QUERY_STALE_LIVE,
    placeholderData: keepPreviousData,
    retry: false,
  });

  const total = data?.total ?? 0;
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + pageSize, total);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  const changeSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const changePageSize = (value: string) => {
    setPageSize(Number(value) as (typeof PAGE_SIZE_OPTIONS)[number]);
    setPage(1);
  };

  const toggleSort = (key: AuditSortKey) => {
    setPage(1);
    if (sortBy === key) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortBy(key);
    setSortDir(key === "created_at" ? "desc" : "asc");
  };

  return (
    <div className="kpi-card space-y-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Ações sensíveis de autenticação e administração.
        </p>
        <RefreshButton fetching={isFetching} onClick={() => refetch()} />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex h-9 min-w-0 flex-1 items-center gap-1 rounded-md border bg-background px-2 sm:max-w-sm">
          <Search className="size-3.5 shrink-0 text-muted-foreground" />
          <Input
            placeholder="Buscar usuário, ação, alvo, detalhe ou IP…"
            aria-label="Buscar na trilha de auditoria"
            value={search}
            onChange={(event) => changeSearch(event.target.value)}
            className="h-7 min-w-0 border-0 px-1 text-sm shadow-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          {search && (
            <button
              type="button"
              aria-label="Limpar busca"
              onClick={() => changeSearch("")}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isFetching && !isLoading && (
            <span role="status">
              <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />
              <span className="sr-only">Atualizando auditoria</span>
            </span>
          )}
          <Select value={String(pageSize)} onValueChange={changePageSize}>
            <SelectTrigger className="h-9 flex-1 sm:w-[110px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size} / página
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
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
        <p className="py-4 text-center text-sm text-muted-foreground">
          {debouncedSearch ? "Nenhum evento encontrado." : "Nenhum evento registrado."}
        </p>
      ) : (
        <div className="overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
          <table className="min-w-[620px] w-full text-xs">
            <thead>
              <tr className="border-b text-left uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                <SortHeader
                  label="Data"
                  sortKey="created_at"
                  activeKey={sortBy}
                  sortDir={sortDir}
                  onToggle={toggleSort}
                />
                <SortHeader
                  label="Ação"
                  sortKey="action"
                  activeKey={sortBy}
                  sortDir={sortDir}
                  onToggle={toggleSort}
                />
                <SortHeader
                  label="Usuário"
                  sortKey="actor_username"
                  activeKey={sortBy}
                  sortDir={sortDir}
                  onToggle={toggleSort}
                />
                <SortHeader
                  label="IP"
                  sortKey="ip"
                  activeKey={sortBy}
                  sortDir={sortDir}
                  align="right"
                  onToggle={toggleSort}
                />
              </tr>
            </thead>
            <tbody>
              {data.events.map((ev) => (
                <tr key={ev.id} className="border-b border-border/40 whitespace-nowrap">
                  <td className="py-1.5 pr-3 font-mono">{fmtDT(ev.created_at)}</td>
                  <td className="py-1.5 pr-3">
                    <ActionBadge
                      action={ev.action}
                      targetUsername={ev.target_username}
                      detail={ev.detail}
                    />
                  </td>
                  <td className="py-1.5 pr-3">{ev.actor_username ?? "-"}</td>
                  <td className="py-1.5 pl-3 text-right font-mono text-muted-foreground">
                    {ev.ip ?? "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && !isError && data && (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <span className="text-xs text-muted-foreground">
            Exibindo {from}–{to} de {total.toLocaleString("pt-BR")} eventos
          </span>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Button
              variant="outline"
              size="sm"
              disabled={!hasPrev}
              aria-label="Página anterior"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span>
              Página {page} de {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={!hasNext}
              aria-label="Próxima página"
              onClick={() => setPage((current) => current + 1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
