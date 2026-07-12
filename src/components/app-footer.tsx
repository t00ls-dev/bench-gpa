import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getLatestSaleInfo } from "@/lib/analytics.functions";

function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function timeAgo(ts: number) {
  const seconds = Math.floor(Date.now() / 1000 - ts);
  if (seconds < 60) return "há menos de 1 minuto";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `há ${minutes} ${minutes === 1 ? "minuto" : "minutos"}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} ${hours === 1 ? "hora" : "horas"}`;
  const days = Math.floor(hours / 24);
  return `há ${days} ${days === 1 ? "dia" : "dias"}`;
}

export function AppFooter() {
  const fn = useServerFn(getLatestSaleInfo);
  const { data } = useQuery({
    queryKey: ["latest-sale"],
    queryFn: () => fn(),
    staleTime: 60_000,
  });

  return (
    <div className="kpi-card mt-8 flex items-center gap-x-3 text-xs text-muted-foreground">
      <span>Última venda: {data ? fmtDate(data.sale_date) : "—"}</span>
      <span className="hidden sm:inline">·</span>
      <span>
        commit <code className="text-foreground/70">{__COMMIT_HASH__}</code> ({timeAgo(Number(__COMMIT_DATE__))})
      </span>
    </div>
  );
}
