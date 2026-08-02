import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listUsers } from "@/lib/admin-users.functions";
import {
  diagnoseData,
  dbHealthCheck,
  getHeartbeats,
  getAuditLog,
} from "@/lib/admin-system.functions";
import { AdminUserManagement } from "@/components/admin-user-management";
import { DataCountSection, DbHealthSection } from "@/components/admin-system-panel";
import { HeartbeatSection, AuditLogSection } from "@/components/admin-audit-panel";
import { Users, Server, Shield, Database, HardDrive, ScrollText, HeartPulse } from "lucide-react";
import { sentryDebugThrow } from "@/lib/sentry-debug.functions";

export default function AdminPage() {
  const list = useServerFn(listUsers);
  const diag = useServerFn(diagnoseData);
  const health = useServerFn(dbHealthCheck);
  const heartbeats = useServerFn(getHeartbeats);
  const audit = useServerFn(getAuditLog);
  const sentryDebug = useServerFn(sentryDebugThrow);
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => list(),
    retry: false,
  });
  const err = error ? (error as Error).message : null;

  const [tab, setTab] = useState<"usuarios" | "sistema" | "auditoria">("usuarios");

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-display text-3xl font-bold flex items-center gap-2">
          <Shield className="size-7 text-primary shrink-0" /> Administração
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gerencie usuários e monitore o banco de dados.
        </p>
        {err && <p className="mt-2 text-sm text-destructive">{err}</p>}
        {/* TEMPORÁRIO: remover junto com src/lib/sentry-debug.functions.ts */}
        <button
          id="sentry-debug-btn"
          onClick={() => sentryDebug().catch(() => {})}
          className="mt-2 text-xs text-muted-foreground underline"
        >
          [debug] testar captura Sentry
        </button>
      </header>

      <div className="mb-6 flex gap-1 rounded-lg bg-muted p-1 w-fit">
        <button
          onClick={() => setTab("usuarios")}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            tab === "usuarios"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Users className="size-4" /> Usuários
        </button>
        <button
          onClick={() => setTab("sistema")}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            tab === "sistema"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Server className="size-4" /> Sistema
        </button>
        <button
          onClick={() => setTab("auditoria")}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            tab === "auditoria"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <ScrollText className="size-4" /> Auditoria
        </button>
      </div>

      {tab === "usuarios" && <AdminUserManagement data={data} isLoading={isLoading} />}

      {tab === "sistema" && (
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h2 className="font-display text-lg font-bold flex items-center gap-2 mb-3">
              <Database className="size-5 text-primary" /> Dados e Agregações
            </h2>
            <DataCountSection
              diagnoseFn={() => diag() as unknown as Promise<Record<string, unknown>>}
            />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold flex items-center gap-2 mb-3">
              <HardDrive className="size-5 text-primary" /> Saúde do Banco
            </h2>
            <DbHealthSection healthFn={health} />
          </div>
        </div>
      )}

      {tab === "auditoria" && (
        <div className="space-y-6">
          <div>
            <h2 className="font-display text-lg font-bold flex items-center gap-2 mb-3">
              <HeartPulse className="size-5 text-primary" /> Heartbeat das crons
            </h2>
            <HeartbeatSection heartbeatsFn={() => heartbeats()} />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold flex items-center gap-2 mb-3">
              <ScrollText className="size-5 text-primary" /> Trilha de auditoria
            </h2>
            <AuditLogSection auditFn={(p) => audit({ data: p })} />
          </div>
        </div>
      )}
    </div>
  );
}
