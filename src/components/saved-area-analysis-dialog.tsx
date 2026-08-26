import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { SavedAreaProductPicker } from "@/components/saved-area-product-picker";
import { getAreaProductFilterOptions } from "@/lib/area.functions";
import {
  createSavedAreaAnalysis,
  updateSavedAreaAnalysis,
  type SavedAreaAnalysis,
} from "@/lib/saved-area-analyses.functions";
import { CreateSavedAreaAnalysisSchema, UpdateSavedAreaAnalysisSchema } from "@/lib/schemas";
import { QUERY_GC_REFERENCE, QUERY_STALE_REFERENCE } from "@/lib/query-config";

export interface SavedAreaStoreOption {
  code: string;
  name: string;
}

interface SavedAreaAnalysisDialogProps {
  open: boolean;
  analysis?: SavedAreaAnalysis;
  stores: SavedAreaStoreOption[];
  initialStoreCode?: string;
  initialProductCodes?: string[];
  onOpenChange: (open: boolean) => void;
  onSaved: (id: string) => void | Promise<void>;
}

function sameProducts(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((code) => rightSet.has(code));
}

export function SavedAreaAnalysisDialog({
  open,
  analysis,
  stores,
  initialStoreCode,
  initialProductCodes,
  onOpenChange,
  onSaved,
}: SavedAreaAnalysisDialogProps) {
  const createAnalysis = useServerFn(createSavedAreaAnalysis);
  const updateAnalysis = useServerFn(updateSavedAreaAnalysis);
  const getProductOptions = useServerFn(getAreaProductFilterOptions);
  const [name, setName] = useState(analysis?.name ?? "");
  const [storeCode, setStoreCode] = useState(analysis?.storeCode ?? initialStoreCode ?? "");
  const [productCodes, setProductCodes] = useState(
    analysis?.productCodes ?? initialProductCodes ?? [],
  );
  const [saving, setSaving] = useState(false);
  const productOptionsQuery = useQuery({
    queryKey: ["area-product-options", [storeCode], [], [], [], []],
    queryFn: () =>
      getProductOptions({
        data: { stores: [storeCode], deptos: [], secoes: [], grupos: [], subgrupos: [] },
      }),
    enabled: open && storeCode.length > 0,
    staleTime: QUERY_STALE_REFERENCE,
    gcTime: QUERY_GC_REFERENCE,
  });
  const productOptions = (productOptionsQuery.data ?? []).map((product) => ({
    value: product.prodCode,
    label: `PLU ${product.prodCode} · ${product.prodName}`,
  }));
  const changed = analysis
    ? name.trim() !== analysis.name || !sameProducts(productCodes, analysis.productCodes)
    : true;

  const submit = async () => {
    if (saving) return;
    if (analysis) {
      const data = {
        id: analysis.id,
        ...(name.trim() !== analysis.name ? { name: name.trim() } : {}),
        ...(!sameProducts(productCodes, analysis.productCodes) ? { productCodes } : {}),
      };
      const parsed = UpdateSavedAreaAnalysisSchema.safeParse(data);
      if (!parsed.success) {
        toast.error(parsed.error.issues[0]?.message ?? "Revise os dados da análise.");
        return;
      }
      setSaving(true);
      try {
        await updateAnalysis({ data: parsed.data });
        toast.success("Análise atualizada.");
        await onSaved(analysis.id);
        onOpenChange(false);
      } catch (error: unknown) {
        toast.error(error instanceof Error ? error.message : "Erro ao atualizar a análise.");
      } finally {
        setSaving(false);
      }
      return;
    }

    const parsed = CreateSavedAreaAnalysisSchema.safeParse({
      name,
      storeCode,
      productCodes,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Revise os dados da análise.");
      return;
    }
    setSaving(true);
    try {
      const result = await createAnalysis({ data: parsed.data });
      toast.success("Análise salva.");
      await onSaved(result.id);
      onOpenChange(false);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Erro ao salvar a análise.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !saving && onOpenChange(nextOpen)}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{analysis ? "Editar análise salva" : "Salvar análise de área"}</DialogTitle>
          <DialogDescription>
            A análise mantém uma composição de produtos para uma única loja.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="saved-area-name">Nome</Label>
            <Input
              id="saved-area-name"
              className="mt-1.5"
              value={name}
              maxLength={255}
              onChange={(event) => setName(event.target.value)}
              disabled={saving}
              placeholder="Ex.: Ponta de gôndola"
            />
          </div>
          <div>
            <Label htmlFor="saved-area-store">Loja</Label>
            <Select
              value={storeCode || undefined}
              onValueChange={(code) => {
                setStoreCode(code);
                setProductCodes([]);
              }}
              disabled={saving || analysis !== undefined}
            >
              <SelectTrigger id="saved-area-store" className="mt-1.5">
                <SelectValue placeholder="Selecione uma loja" />
              </SelectTrigger>
              <SelectContent>
                {stores.map((store) => (
                  <SelectItem key={store.code} value={store.code}>
                    {store.code} - {store.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {analysis ? (
              <p className="mt-1 text-xs text-muted-foreground">
                A loja não pode ser alterada depois que a análise é criada.
              </p>
            ) : null}
          </div>
          <div>
            <Label>Produtos</Label>
            <div className="mt-1.5">
              <SavedAreaProductPicker
                options={productOptions}
                value={productCodes}
                onChange={setProductCodes}
                loading={productOptionsQuery.isLoading}
                disabled={saving || !storeCode}
              />
            </div>
            {productOptionsQuery.isError ? (
              <div className="mt-2 flex items-center justify-between gap-2 text-sm text-destructive">
                <span>Não foi possível carregar os produtos da loja.</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => productOptionsQuery.refetch()}
                >
                  Tentar novamente
                </Button>
              </div>
            ) : null}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button
            onClick={submit}
            disabled={saving || !changed || !name.trim() || !storeCode || productCodes.length === 0}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : analysis ? "Salvar" : "Criar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
