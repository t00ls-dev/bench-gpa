import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { resetPassword } from "@/lib/admin.functions";
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

export function ResetPasswordDialog({
  target,
  onClose,
  onReset,
}: {
  target: { id: string; email: string } | null;
  onClose: () => void;
  onReset: () => void;
}) {
  const resetPw = useServerFn(resetPassword);
  const [newPw, setNewPw] = useState("");
  const [resetting, setResetting] = useState(false);

  const submit = async () => {
    if (!target || resetting) return;
    setResetting(true);
    try {
      await resetPw({ data: { userId: target.id, password: newPw } });
      toast.success("Senha redefinida.");
      onClose();
      setNewPw("");
      onReset();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao redefinir");
    } finally {
      setResetting(false);
    }
  };

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Redefinir senha</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">{target?.email}</p>
        <div>
          <Label htmlFor="reset-password">Nova senha</Label>
          <Input id="reset-password" className="mt-1.5" type="password" value={newPw}
            onChange={(e) => setNewPw(e.target.value)} placeholder="Mínimo 8 caracteres"
            autoComplete="new-password" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={resetting}>Cancelar</Button>
          <Button onClick={submit} disabled={resetting || newPw.length < 8}>
            {resetting ? <Loader2 className="size-4 animate-spin" /> : "Redefinir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
