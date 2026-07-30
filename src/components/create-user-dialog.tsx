import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { createUser } from "@/lib/admin-users.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, UserPlus } from "lucide-react";

export function CreateUserDialog({ onCreated }: { onCreated: () => void }) {
  const create = useServerFn(createUser);
  const [open, setOpen] = useState(false);
  const [emailLocal, setEmailLocal] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "user">("user");
  const [creating, setCreating] = useState(false);

  const submit = async () => {
    if (creating) return;
    setCreating(true);
    try {
      await create({
        data: { email: `${emailLocal.trim()}@gpabr.com`, name: name.trim(), password, role },
      });
      toast.success("Usuário criado.");
      setOpen(false);
      setEmailLocal("");
      setName("");
      setPassword("");
      setRole("user");
      onCreated();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="mr-2 size-4" /> Novo usuário
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo usuário</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="create-email">E-mail</Label>
            <div className="mt-1.5 flex">
              <Input
                id="create-email"
                value={emailLocal}
                onChange={(e) => setEmailLocal(e.target.value)}
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
            <Label htmlFor="create-name">Nome</Label>
            <Input
              id="create-name"
              className="mt-1.5"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="create-password">Senha</Label>
            <Input
              id="create-password"
              className="mt-1.5"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              autoComplete="new-password"
            />
          </div>
          <div>
            <Label htmlFor="create-role">Papel</Label>
            <Select value={role} onValueChange={(v) => setRole(v as "admin" | "user")}>
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">Usuário</SelectItem>
                <SelectItem value="admin">Administrador</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={creating}>
            Cancelar
          </Button>
          <Button
            onClick={submit}
            disabled={creating || !emailLocal || !name || password.length < 8}
          >
            {creating ? <Loader2 className="size-4 animate-spin" /> : "Criar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
