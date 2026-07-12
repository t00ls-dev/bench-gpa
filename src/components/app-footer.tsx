import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getLatestSaleInfo } from "@/lib/analytics.functions";

function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function timeAgo(ts: number) {
  const diff = Math.floor((Date.now() / 1000 - ts) / 86400);
  if (diff < 1) return "hoje";
  if (diff === 1) return "ontem";
  return `há ${diff} dias`;
}

export function AppFooter() {
  const fn = useServerFn(getLatestSaleInfo);
  const { data } = useQuery({
    queryKey: ["latest-sale"],
    queryFn: () => fn(),
    staleTime: 60_000,
  });

  return (
    <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-3 pb-2 text-xs text-muted-foreground">
      <span>Última venda: {data ? fmtDate(data.sale_date) : "—"}</span>
      <span className="hidden sm:inline">·</span>
      <span>
        commit <code className="text-foreground/70">{__COMMIT_HASH__}</code> ({timeAgo(Number(__COMMIT_DATE__))})
      </span>
    </footer>
  );
}
