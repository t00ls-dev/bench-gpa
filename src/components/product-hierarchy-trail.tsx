export function ProductHierarchyTrail({
  product,
}: {
  product:
    | { depto: string | null; secao: string | null; grupo: string | null; subgrupo: string | null }
    | null
    | undefined;
}) {
  if (!product) return null;
  const levels = [product.depto, product.secao, product.grupo, product.subgrupo].filter(
    (v): v is string => !!v && v.trim().length > 0,
  );
  if (levels.length === 0) return null;

  const parents = levels.slice(0, -1).join(" › ");
  const last = levels[levels.length - 1];

  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
      {parents && <span className="min-w-0 truncate">{parents}</span>}
      {parents && <span className="shrink-0 text-muted-foreground/40">›</span>}
      <span className="max-w-[45vw] shrink-0 truncate font-medium text-foreground/80 sm:max-w-[200px]">
        {last}
      </span>
    </span>
  );
}
