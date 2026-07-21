import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listUsers, diagnoseData, dbHealthCheck } from "@/lib/admin.functions";
import { AdminUserManagement } from "@/components/admin-user-management";
import { DataCountSection, DbHealthSection } from "@/components/admin-system-panel";
import { Users, Server, Shield, Database, HardDrive } from "lucide-react";
import { Route } from "./admin.index";

export default function AdminPage() {
  const list = useServerFn(listUsers);
  const diag = useServerFn(diagnoseData);
  const health = useServerFn(dbHealthCheck);
  const [err, setErr] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => list(),
    retry: false,
  });

  useEffect(() => {
    if (error) setErr((error as Error).message);
  }, [error]);

  const [tab, setTab] = useState<"usuarios" | "sistema">("usuarios");

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
      </div>

      {tab === "usuarios" && <AdminUserManagement data={data} isLoading={isLoading} />}

      {tab === "sistema" && (
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h2 className="font-display text-lg font-bold flex items-center gap-2 mb-3">
              <Database className="size-5 text-primary" /> Dados e Agregações
            </h2>
            <DataCountSection diagnoseFn={() => diag() as unknown as Promise<Record<string, unknown>>} />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold flex items-center gap-2 mb-3">
              <HardDrive className="size-5 text-primary" /> Saúde do Banco
            </h2>
            <DbHealthSection healthFn={health} />
          </div>
        </div>
      )}
    </div>
  );
}
