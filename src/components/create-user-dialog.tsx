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
  const [username, setUsername] = useState("");
  const [matricula, setMatricula] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"admin" | "user">("user");
  const [creating, setCreating] = useState(false);

  const submit = async () => {
    if (creating) return;
    setCreating(true);
    try {
      // Sem senha: a conta nasce sem senha definida, o próprio usuário
      // define no primeiro acesso (ver /first-access).
      await create({
        data: { username: username.trim(), matricula: matricula.trim(), name: name.trim(), role },
      });
      toast.success("Usuário criado. Aguardando primeiro acesso.");
      setOpen(false);
      setUsername("");
      setMatricula("");
      setName("");
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
      <DialogContent onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Novo usuário</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Informe usuário ou matrícula (basta um dos dois).
          </p>
          <div>
            <Label htmlFor="create-username">Usuário</Label>
            <Input
              id="create-username"
              className="mt-1.5"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div>
            <Label htmlFor="create-matricula">Matrícula</Label>
            <Input
              id="create-matricula"
              className="mt-1.5"
              inputMode="numeric"
              value={matricula}
              onChange={(e) => setMatricula(e.target.value)}
              autoComplete="off"
            />
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
          <Button onClick={submit} disabled={creating || (!username && !matricula) || !name}>
            {creating ? <Loader2 className="size-4 animate-spin" /> : "Criar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
