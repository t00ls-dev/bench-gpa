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
  matricula: string | null;
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
  const [matricula, setMatricula] = useState(target.matricula ?? "");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await update({
        data: { userId: target.id, username: username.trim(), matricula: matricula.trim() },
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
    <DialogContent>
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
          <Label htmlFor="edit-matricula">Matrícula</Label>
          <Input
            id="edit-matricula"
            className="mt-1.5"
            inputMode="numeric"
            value={matricula}
            onChange={(e) => setMatricula(e.target.value)}
            autoComplete="off"
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={saving}>
          Cancelar
        </Button>
        <Button onClick={submit} disabled={saving || !username || !matricula}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : "Salvar"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

/**
 * Fecha o ciclo da migração de e-mail para username/matrícula: usuários
 * legados podem ter chegado com só um dos dois campos preenchido (a parte
 * local do e-mail antigo já era um ou outro, nunca os dois -- ver
 * scripts/migrate-users-to-username.ts). Sem esta tela o admin não teria
 * como completar o campo faltante pela interface.
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
