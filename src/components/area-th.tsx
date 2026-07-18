import { ChevronUp, ChevronDown } from "lucide-react";

type SortKey = "prod_code" | "prod_name" | "val" | "daysSince";

export function AreaTh({
  label,
  k,
  sortKey,
  sortAsc,
  toggle,
  align = "left",
  className = "",
  hint,
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  sortAsc: boolean;
  toggle: (k: SortKey) => void;
  align?: "left" | "right";
  className?: string;
  hint?: string;
}) {
  const active = sortKey === k;
  return (
    <th className={`py-2 ${align === "right" ? "text-right" : ""} ${className}`}>
      <button
        onClick={() => toggle(k)}
        title={hint}
        aria-pressed={active}
        aria-label={`${label}${active ? ` (ordenado ${sortAsc ? "crescente" : "decrescente"})` : ""}`}
        className={`inline-flex items-center gap-1 hover:text-foreground ${align === "right" ? "flex-row-reverse" : ""} ${active ? "text-foreground" : ""}`}
      >
        {label}
        {active &&
          (sortAsc ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />)}
      </button>
    </th>
  );
}
