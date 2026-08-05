import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { updateUserIdentifiers } from "@/lib/admin-users.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface Target {
  id: string;
  username: string | null;
  employeeId: string | null;
}

function EditUserIdentifiersForm({
  target,
  onClose,
  onSaved,
}: {
  target: Target;
  onClose: () => void;
  onSaved: () => void;
}) {
  const update = useServerFn(updateUserIdentifiers);
  // Inicializado a partir de `target`: o componente é remontado (key={target.id}
  // no chamador) sempre que o alvo muda, então isto nunca fica desatualizado
  // sem precisar de useEffect pra sincronizar estado derivado de prop.
  const [username, setUsername] = useState(target.username ?? "");
  const [employeeId, setEmployeeId] = useState(target.employeeId ?? "");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await update({
        data: { userId: target.id, username: username.trim(), employeeId: employeeId.trim() },
      });
      toast.success("Usuário atualizado.");
      onSaved();
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao atualizar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogContent onOpenAutoFocus={(e) => e.preventDefault()}>
      <DialogHeader>
        <DialogTitle>Editar usuário e matrícula</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <Label htmlFor="edit-username">Usuário</Label>
          <Input
            id="edit-username"
            className="mt-1.5"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div>
          <Label htmlFor="edit-employee-id">Matrícula</Label>
          <Input
            id="edit-employee-id"
            className="mt-1.5"
            inputMode="numeric"
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            autoComplete="off"
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={saving}>
          Cancelar
        </Button>
        <Button onClick={submit} disabled={saving || !username || !employeeId}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : "Salvar"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

/**
 * Closes the loop of the email -> username/employee_id migration: legacy
 * users may have arrived with only one of the two fields filled in (the
 * local part of the old email was already one or the other, never both --
 * see scripts/migrate-users-to-username.ts). Without this screen the admin
 * would have no way to complete the missing field through the UI.
 */
export function EditUserIdentifiersDialog({
  target,
  onClose,
  onSaved,
}: {
  target: Target | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      {target && (
        <EditUserIdentifiersForm
          key={target.id}
          target={target}
          onClose={onClose}
          onSaved={onSaved}
        />
      )}
    </Dialog>
  );
}
