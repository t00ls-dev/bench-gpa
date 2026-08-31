import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { resetPassword, updateAdminUser } from "@/lib/admin-users.functions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

interface Target {
  id: string;
  username: string | null;
  employeeId: string | null;
  name: string;
  role: string;
  is_active: boolean;
}

function EditUserForm({
  target,
  onClose,
  onSaved,
}: {
  target: Target;
  onClose: () => void;
  onSaved: () => void;
}) {
  const update = useServerFn(updateAdminUser);
  const reset = useServerFn(resetPassword);
  const [username, setUsername] = useState(target.username ?? "");
  const [employeeId, setEmployeeId] = useState(target.employeeId ?? "");
  const [name, setName] = useState(target.name);
  const [role, setRole] = useState<"admin" | "user">(target.role === "admin" ? "admin" : "user");
  const [isActive, setIsActive] = useState(target.is_active);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await update({
        data: {
          userId: target.id,
          username: username.trim(),
          employeeId: employeeId.trim(),
          name: name.trim(),
          role,
          isActive,
        },
      });
      toast.success("Usuário atualizado.");
      onSaved();
      onClose();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Erro ao atualizar");
    } finally {
      setSaving(false);
    }
  };

  const confirmPasswordReset = async () => {
    if (resetting) return;
    setResetting(true);
    try {
      await reset({ data: { userId: target.id } });
      toast.success("Senha zerada. Primeiro acesso obrigatório no próximo login.");
      onSaved();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Erro ao redefinir senha");
    } finally {
      setResetting(false);
    }
  };

  return (
    <>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-xl"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Editar usuário</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="edit-name">Nome</Label>
            <Input
              id="edit-name"
              className="mt-1.5"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="edit-employee-id">Matrícula</Label>
            <Input
              id="edit-employee-id"
              className="mt-1.5"
              inputMode="numeric"
              value={employeeId}
              onChange={(event) => setEmployeeId(event.target.value)}
              autoComplete="off"
            />
          </div>
          <div>
            <Label htmlFor="edit-username">Usuário</Label>
            <Input
              id="edit-username"
              className="mt-1.5"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="off"
            />
          </div>
          <div>
            <Label htmlFor="edit-role">Papel</Label>
            <Select value={role} onValueChange={(value) => setRole(value as "admin" | "user")}>
              <SelectTrigger id="edit-role" className="mt-1.5 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">Usuário</SelectItem>
                <SelectItem value="admin">Administrador</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="edit-active">Status</Label>
            <div className="mt-1.5 flex h-9 items-center gap-2">
              <Switch id="edit-active" checked={isActive} onCheckedChange={setIsActive} />
              <span className="text-sm text-muted-foreground">
                {isActive ? "Ativo" : "Inativo"}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <p className="text-sm font-medium">Redefinir senha</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Encerra as sessões abertas e exige novamente o primeiro acesso.
              </p>
            </div>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={resetting || saving}
              onClick={() => setConfirmReset(true)}
            >
              {resetting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <KeyRound className="size-4" />
              )}
              Redefinir senha
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving || resetting}>
            Cancelar
          </Button>
          <Button
            onClick={submit}
            disabled={
              saving || resetting || !name.trim() || (!username.trim() && !employeeId.trim())
            }
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Redefinir senha?</AlertDialogTitle>
            <AlertDialogDescription>
              A senha de "{target.name}" será zerada, as sessões abertas serão encerradas e a conta
              ficará com primeiro acesso pendente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmPasswordReset}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function EditUserDialog({
  target,
  onClose,
  onSaved,
}: {
  target: Target | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      {target && (
        <EditUserForm key={target.id} target={target} onClose={onClose} onSaved={onSaved} />
      )}
    </Dialog>
  );
}
