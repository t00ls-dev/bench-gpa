import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarCheck, GitCommitHorizontal } from "lucide-react";
import { getLatestSaleInfo } from "@/lib/dashboard.functions";
import { QUERY_STALE_IDENTITY } from "@/lib/query-config";

function fmtDate(iso: string) {
  if (typeof iso !== "string") return "-";
  const parts = iso.split("-");
  if (parts.length < 3) return iso;
  const [y, m, d] = parts;
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
    staleTime: QUERY_STALE_IDENTITY,
  });

  return (
    <div className="kpi-card mt-8 flex items-center gap-x-3 overflow-x-auto whitespace-nowrap text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <CalendarCheck className="size-3.5" />
        Última venda: {data ? fmtDate(data.sale_date) : "-"}
      </span>
      <span className="hidden sm:inline">·</span>
      <span className="flex items-center gap-1.5">
        <GitCommitHorizontal className="size-3.5" />
        commit <code className="text-foreground/70">{__COMMIT_HASH__}</code> (
        {/* timeAgo() chama Date.now(): servidor e cliente calculam em
        instantes diferentes, então o texto pode divergir por 1 unidade
        (ex: "há 13 minutos" no SSR vs "há 14 minutos" na hidratação) se a
        virada acontecer entre os dois. Mismatch esperado e inofensivo
        (mesma categoria que relógio ao vivo, caso canônico do React pra
        suppressHydrationWarning): não vale forçar remontagem da árvore por
        isso. */}
        <span suppressHydrationWarning>{timeAgo(Number(__COMMIT_DATE__))}</span>)
      </span>
    </div>
  );
}
