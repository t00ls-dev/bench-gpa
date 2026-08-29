import { useMemo, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SavedAreaProductPicker } from "@/components/saved-area-product-picker";
import { MultiSelect } from "@/components/multi-select";
import { getAreaProductFilterOptions } from "@/lib/area.functions";
import { cascadePatch, computeAreaCascadeOptions, type HierarchyItem } from "@/lib/filter-cascade";
import {
  createSavedAreaAnalysis,
  updateSavedAreaAnalysis,
  type SavedAreaAnalysis,
} from "@/lib/saved-area-analyses.functions";
import { CreateSavedAreaAnalysisSchema, UpdateSavedAreaAnalysisSchema } from "@/lib/schemas";
import { QUERY_GC_REFERENCE, QUERY_STALE_REFERENCE } from "@/lib/query-config";
import {
  restoreSavedAreaHierarchyFilters,
  type SavedAreaHierarchyFilters,
} from "@/lib/saved-area-filter-restoration";

export interface SavedAreaStoreOption {
  code: string;
  name: string;
}

interface SavedAreaAnalysisDialogProps {
  open: boolean;
  analysis?: SavedAreaAnalysis;
  stores: SavedAreaStoreOption[];
  hierarchy: HierarchyItem[];
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
  hierarchy,
  initialStoreCode,
  initialProductCodes,
  onOpenChange,
  onSaved,
}: SavedAreaAnalysisDialogProps) {
  const createAnalysis = useServerFn(createSavedAreaAnalysis);
  const updateAnalysis = useServerFn(updateSavedAreaAnalysis);
  const getProductOptions = useServerFn(getAreaProductFilterOptions);
  const [name, setName] = useState(analysis?.name ?? "");
  const [description, setDescription] = useState(analysis?.description ?? "");
  const [storeCode, setStoreCode] = useState(analysis?.storeCode ?? initialStoreCode ?? "");
  const [productCodes, setProductCodes] = useState(
    analysis?.productCodes ?? initialProductCodes ?? [],
  );
  const [hierarchyFilters, setHierarchyFilters] = useState<SavedAreaHierarchyFilters>(() =>
    restoreSavedAreaHierarchyFilters(analysis?.productHierarchy ?? []),
  );
  const { deptos, secoes, grupos, subgrupos } = hierarchyFilters;
  const [saving, setSaving] = useState(false);
  const { deptosOpts, secoesOpts, gruposOpts, subgruposOpts } = useMemo(
    () =>
      computeAreaCascadeOptions(hierarchy, {
        fStores: storeCode ? [storeCode] : [],
        fDeptos: deptos,
        fSecoes: secoes,
        fGrupos: grupos,
      }),
    [hierarchy, storeCode, deptos, secoes, grupos],
  );
  const productOptionsQuery = useQuery({
    queryKey: ["area-product-options", [storeCode], deptos, secoes, grupos, subgrupos],
    queryFn: () =>
      getProductOptions({
        data: { stores: [storeCode], deptos, secoes, grupos, subgrupos },
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
    ? name.trim() !== analysis.name ||
      description.trim() !== (analysis.description ?? "") ||
      !sameProducts(productCodes, analysis.productCodes)
    : true;

  const updateHierarchy = (
    level: "deptos" | "secoes" | "grupos" | "subgrupos",
    value: string[],
  ) => {
    const next = cascadePatch(level, value);
    setHierarchyFilters((current) => ({
      deptos: next.deptos ?? current.deptos,
      secoes: next.secoes ?? current.secoes,
      grupos: next.grupos ?? current.grupos,
      subgrupos: next.subgrupos ?? current.subgrupos,
    }));
  };

  const submit = async () => {
    if (saving) return;
    if (analysis) {
      const data = {
        id: analysis.id,
        ...(name.trim() !== analysis.name ? { name: name.trim() } : {}),
        ...(description.trim() !== (analysis.description ?? "")
          ? { description: description.trim() || null }
          : {}),
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
      description: description.trim() || null,
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
        className="max-h-[90vh] w-[calc(100vw-2rem)] min-w-0 overflow-x-hidden overflow-y-auto sm:max-w-2xl"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <DialogHeader className="min-w-0">
          <DialogTitle>{analysis ? "Editar análise salva" : "Salvar análise de área"}</DialogTitle>
          <DialogDescription>
            A análise mantém uma composição de produtos para uma única loja.
          </DialogDescription>
        </DialogHeader>
        <div className="min-w-0 space-y-4">
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
            <Label htmlFor="saved-area-description">Descrição (opcional)</Label>
            <Textarea
              id="saved-area-description"
              className="mt-1.5 resize-y"
              value={description}
              maxLength={1000}
              rows={3}
              onChange={(event) => setDescription(event.target.value)}
              disabled={saving}
              placeholder="Contexto ou observações sobre esta composição"
            />
          </div>
          <div>
            <Label htmlFor="saved-area-store">Loja</Label>
            <Select
              value={storeCode || undefined}
              onValueChange={(code) => {
                setStoreCode(code);
                setHierarchyFilters({ deptos: [], secoes: [], grupos: [], subgrupos: [] });
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
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 [&>*]:min-w-0">
            <div>
              <Label>Departamento</Label>
              <div className="mt-1.5">
                <MultiSelect
                  label="Todos"
                  ariaLabel="Departamento"
                  options={deptosOpts.map((value) => ({ value, label: value }))}
                  value={deptos}
                  onChange={(value) => updateHierarchy("deptos", value)}
                  disabled={saving || !storeCode}
                  modal
                />
              </div>
            </div>
            <div>
              <Label>Seção</Label>
              <div className="mt-1.5">
                <MultiSelect
                  label="Todas"
                  ariaLabel="Seção"
                  options={secoesOpts.map((value) => ({ value, label: value }))}
                  value={secoes}
                  onChange={(value) => updateHierarchy("secoes", value)}
                  disabled={saving || !storeCode}
                  modal
                />
              </div>
            </div>
            <div>
              <Label>Grupo</Label>
              <div className="mt-1.5">
                <MultiSelect
                  label="Todos"
                  ariaLabel="Grupo"
                  options={gruposOpts.map((value) => ({ value, label: value }))}
                  value={grupos}
                  onChange={(value) => updateHierarchy("grupos", value)}
                  disabled={saving || !storeCode}
                  modal
                />
              </div>
            </div>
            <div>
              <Label>Subgrupo</Label>
              <div className="mt-1.5">
                <MultiSelect
                  label="Todos"
                  ariaLabel="Subgrupo"
                  options={subgruposOpts.map((value) => ({ value, label: value }))}
                  value={subgrupos}
                  onChange={(value) => updateHierarchy("subgrupos", value)}
                  disabled={saving || !storeCode}
                  modal
                />
              </div>
            </div>
          </div>
          <div className="min-w-0">
            <Label>Produtos</Label>
            <p className="mt-1 text-xs text-muted-foreground">
              Os filtros acima apenas refinam a lista. Somente os produtos marcados fazem parte da
              análise.
            </p>
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
                <span>Não foi possível carregar os produtos dos filtros atuais.</span>
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
