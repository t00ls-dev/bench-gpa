import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listUsers,
  createUser,
  setUserRole,
  setUserActive,
  resetPassword,
  diagnoseData,
  dbHealthCheck,
} from "@/lib/admin.functions";
import type { DbHealthData } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  ShieldCheck, ShieldOff, KeyRound, Loader2, Users, UserPlus, Database, CheckCircle2,
  HardDrive, Activity, Server,
} from "lucide-react";
import { fmtBRShort } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { AdminGate } from "@/components/admin-gate";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw redirect({ to: "/auth" });
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: u.user.id,
      _role: "admin",
    });
    if (isAdmin !== true) throw redirect({ to: "/" });
  },
  component: () => <AdminGate><AdminPage /></AdminGate>,
});

function AdminPage() {
  const list = useServerFn(listUsers);
  const create = useServerFn(createUser);
  const setRole = useServerFn(setUserRole);
  const setActive = useServerFn(setUserActive);
  const resetPw = useServerFn(resetPassword);
  const diag = useServerFn(diagnoseData);
  const health = useServerFn(dbHealthCheck);
  const qc = useQueryClient();
  const [err, setErr] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => list(),
    retry: false,
  });

  useEffect(() => {
    if (error) setErr((error as Error).message);
  }, [error]);

  const action = async (fn: Promise<any>, msg: string) => {
    try {
      await fn;
      toast.success(msg);
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    }
  };

  // Create user dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [nEmailLocal, setNEmailLocal] = useState("");
  const [nName, setNName] = useState("");
  const [nPassword, setNPassword] = useState("");
  const [nRole, setNRole] = useState<"admin" | "user">("user");
  const [creating, setCreating] = useState(false);

  const submitCreate = async () => {
    if (creating) return;
    setCreating(true);
    try {
      await create({
        data: {
          email: `${nEmailLocal.trim()}@gpabr.com`,
          name: nName.trim(),
          password: nPassword,
          role: nRole,
        },
      });
      toast.success("Usuário criado.");
      setCreateOpen(false);
      setNEmailLocal(""); setNName(""); setNPassword(""); setNRole("user");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao criar");
    } finally {
      setCreating(false);
    }
  };

  // Reset password dialog state
  const [resetTarget, setResetTarget] = useState<{ id: string; email: string } | null>(null);
  const [newPw, setNewPw] = useState("");
  const [resetting, setResetting] = useState(false);

  const submitReset = async () => {
    if (!resetTarget || resetting) return;
    setResetting(true);
    try {
      await resetPw({ data: { userId: resetTarget.id, password: newPw } });
      toast.success("Senha redefinida.");
      setResetTarget(null);
      setNewPw("");
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao redefinir");
    } finally {
      setResetting(false);
    }
  };

  if (err) {
    return (
      <div className="kpi-card text-center">
        <p className="text-sm text-destructive">{err}</p>
    </div>
  );
}

function DbHealthSection({ healthFn }: { healthFn: () => Promise<DbHealthData> }) {
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
    ? data.pct_used >= 85 ? 'bg-destructive'
      : data.pct_used >= 60 ? 'bg-warning'
      : 'bg-success'
    : 'bg-muted';

  return (
    <div className="kpi-card space-y-3">
      <p className="text-sm text-muted-foreground">
        Armazenamento total do banco versus o limite de 500 MB do plano free.
      </p>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={runCheck} disabled={loading}>
          {loading ? <Loader2 className="size-4 animate-spin mr-1" /> : <Server className="size-4 mr-1" />}
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

          <div className="flex gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Activity className="size-3.5" /> {data.active_connections} conexões ativas
            </span>
            <span>PG {data.version}</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-4">Tabela</th>
                  <th className="py-2 pr-4 text-right">Tamanho</th>
                  <th className="py-2 text-right">Linhas (aprox.)</th>
                </tr>
              </thead>
              <tbody>
                {data.tables.map((t) => {
                  const barW = data.db_size > 0
                    ? (t.total_size / data.db_size) * 100
                    : 0;
                  return (
                    <tr key={`${t.schema}.${t.table}`} className="border-b border-border/40">
                      <td className="py-1.5 pr-4 font-mono text-foreground">
                        <span className="text-muted-foreground">{t.schema}.</span>{t.table}
                      </td>
                      <td className="py-1.5 pr-4 text-right font-mono">
                        <div className="flex items-center justify-end gap-2">
                          <span>{t.total_size_pretty}</span>
                          <div className="h-2 w-16 overflow-hidden rounded-full bg-muted shrink-0">
                            <div
                              className="h-full rounded-full bg-primary/60"
                              style={{ width: `${Math.min(barW, 100)}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="py-1.5 text-right font-mono">
                        {t.row_estimate.toLocaleString('pt-BR')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold flex items-center gap-2">
            <Users className="size-7 text-primary shrink-0" /> Usuários
          </h1>
          <p className="text-sm text-muted-foreground">Cadastre novos usuários, ative/inative, redefina senhas e alterne o papel.</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button><UserPlus className="mr-2 size-4" /> Novo usuário</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo usuário</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>E-mail</Label>
                <div className="mt-1.5 flex">
                  <Input
                    value={nEmailLocal}
                    onChange={(e) => setNEmailLocal(e.target.value)}
                    placeholder="ex.: uilton.leite"
                    className="rounded-r-none"
                    autoComplete="off"
                  />
                  <span className="inline-flex items-center rounded-r-md border border-l-0 bg-muted px-3 text-sm text-muted-foreground">
                    @gpabr.com
                  </span>
                </div>
              </div>
              <div>
                <Label>Nome</Label>
                <Input className="mt-1.5" value={nName} onChange={(e) => setNName(e.target.value)} />
              </div>
              <div>
                <Label>Senha inicial</Label>
                <Input
                  className="mt-1.5"
                  type="password"
                  value={nPassword}
                  onChange={(e) => setNPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  autoComplete="new-password"
                />
              </div>
              <div>
                <Label>Papel</Label>
                <Select value={nRole} onValueChange={(v) => setNRole(v as "admin" | "user")}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">Usuário</SelectItem>
                    <SelectItem value="admin">Administrador</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>Cancelar</Button>
              <Button onClick={submitCreate} disabled={creating || !nEmailLocal || !nName || nPassword.length < 8}>
                {creating ? <Loader2 className="size-4 animate-spin" /> : "Criar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      <div className="kpi-card overflow-x-auto p-0">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3">E-mail</th>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">Papel</th>
                <th className="px-4 py-3">Ativo</th>
                <th className="px-4 py-3">Cadastro</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((u) => {
                const isAdmin = u.role === "admin";
                return (
                  <tr key={u.id} className="border-b border-border/60">
                    <td className="px-4 py-3 font-medium">{u.email}</td>
                    <td className="px-4 py-3">{u.name}</td>
                    <td className="px-4 py-3 text-xs">{isAdmin ? "Administrador" : "Usuário"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={u.is_active}
                          onCheckedChange={(v) =>
                            action(setActive({ data: { userId: u.id, isActive: v } }),
                              v ? "Usuário ativado" : "Usuário inativado")
                          }
                        />
                        <span className="text-xs text-muted-foreground">
                          {u.is_active ? "Ativo" : "Inativo"}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {fmtBRShort(new Date(u.created_at))}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          title={isAdmin ? "Remover administrador" : "Tornar administrador"}
                          aria-label={isAdmin ? "Remover administrador" : "Tornar administrador"}
                          onClick={() =>
                            action(
                              setRole({ data: { userId: u.id, role: isAdmin ? "user" : "admin" } }),
                              isAdmin ? "Admin removido" : "Promovido a admin"
                            )
                          }
                        >
                          {isAdmin ? <ShieldOff className="size-3.5" /> : <ShieldCheck className="size-3.5" />}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          title="Redefinir senha"
                          aria-label="Redefinir senha"
                          onClick={() => { setResetTarget({ id: u.id, email: u.email }); setNewPw(""); }}
                        >
                          <KeyRound className="size-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Diagnóstico e Reparo */}
      <section className="mt-10">
        <h2 className="font-display text-xl font-bold flex items-center gap-2 mb-4">
          <Database className="size-5 text-primary" /> Dados e Agregações
        </h2>
        <DiagnoseRepairSection
          diagnoseFn={diag}
        />
      </section>

      {/* Saúde do Banco */}
      <section className="mt-10">
        <h2 className="font-display text-xl font-bold flex items-center gap-2 mb-4">
          <HardDrive className="size-5 text-primary" /> Saúde do Banco
        </h2>
        <DbHealthSection healthFn={health} />
      </section>

      <Dialog open={!!resetTarget} onOpenChange={(o) => !o && setResetTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Redefinir senha</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{resetTarget?.email}</p>
          <div>
            <Label>Nova senha</Label>
            <Input
              className="mt-1.5"
              type="password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              autoComplete="new-password"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetTarget(null)} disabled={resetting}>Cancelar</Button>
            <Button onClick={submitReset} disabled={resetting || newPw.length < 8}>
              {resetting ? <Loader2 className="size-4 animate-spin" /> : "Redefinir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DiagnoseRepairSection({
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
      <p className="text-sm text-muted-foreground">
        Contagem de registros nas tabelas do sistema.
      </p>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={runDiagnose} disabled={loading}>
          {loading ? <Loader2 className="size-4 animate-spin mr-1" /> : <Database className="size-4 mr-1" />}
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
                ['staging_sales', 'Staging (vendas brutas)'],
                ['sales_daily_agg', 'Vendas (agregadas)'],
                ['filter_hierarchy', 'Hierarquia de filtros'],
                ['products', 'Produtos'],
                ['stores', 'Lojas'],
                ['import_log', 'Log de importações'],
              ].map(([key, label]) => (
                <tr key={key} className="border-b border-border/40">
                  <td className="py-1.5 pr-4">{label}</td>
                  <td className="py-1.5 text-right font-mono">
                    {Number(diag[key] ?? 0).toLocaleString('pt-BR')}
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
