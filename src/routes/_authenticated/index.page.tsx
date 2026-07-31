import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { getDashboard, getDashboardRankings } from "@/lib/dashboard.functions";
import { getAreaFilterHierarchy } from "@/lib/area.functions";
import { QUERY_STALE_CORE, QUERY_STALE_REFERENCE, QUERY_GC_REFERENCE } from "@/lib/query-config";
import { FilterBar, type Filters } from "@/components/filter-bar";
import { KpiCard } from "@/components/kpi-card";
import { fmtBRL } from "@/lib/utils";
import { RankingCard } from "@/components/ranking-card";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { lazy, Suspense } from "react";
import { ErrorBoundary } from "@/components/error-boundary";
import { Skeleton } from "@/components/ui/skeleton";
import { LayoutDashboard } from "lucide-react";
import { Route } from "./index";

const DashboardCharts = lazy(() =>
  import("@/components/dashboard-charts").then((m) => ({ default: m.DashboardCharts })),
);

const initial: Filters = {
  dateFrom: "",
  dateTo: "",
  stores: [],
  deptos: [],
  secoes: [],
  grupos: [],
  subgrupos: [],
};

const isoDate = /^\d{4}-\d{2}-\d{2}$/;
function sanitizeFilters(f: Filters): Filters {
  let dateFrom = isoDate.test(f.dateFrom) ? f.dateFrom : "";
  let dateTo = isoDate.test(f.dateTo) ? f.dateTo : "";
  // Guard against a reversed range (e.g. persisted from an old session) —
  // it makes queries return no data and crashes the calendar picker.
  if (dateFrom && dateTo && dateFrom > dateTo) [dateFrom, dateTo] = [dateTo, dateFrom];
  return { ...f, dateFrom, dateTo };
}

function Dashboard() {
  const [filters, setFilters] = usePersistentState<Filters>(
    "bench-gpa:filters:dashboard:v2",
    initial,
    sanitizeFilters,
  );
  const fn = useServerFn(getDashboard);
  const fnRank = useServerFn(getDashboardRankings);
  const enabled = !!filters.dateFrom && !!filters.dateTo;

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const getHierarchy = useServerFn(getAreaFilterHierarchy);
  // Só carrega a loja no click-through se o Dashboard já estava filtrado
  // numa única loja — com múltiplas/nenhuma loja, o destino decide sozinho.
  const clickThroughStore = filters.stores.length === 1 ? filters.stores[0] : undefined;
  const goToArea = async (dim: "depto" | "secao" | "grupo" | "subgrupo", name?: string) => {
    if (!name) return;
    // A Área exige Departamento pra mostrar qualquer coisa (`ready` em
    // area.page.tsx) — clicar em Seção/Grupo/Subgrupo sem resolver o
    // Departamento-pai levava a uma tela vazia pedindo pra selecionar Loja e
    // Departamento, com a Seção/Grupo/Subgrupo já aplicada por baixo dos
    // panos mas sem nenhum dado visível. Busca a hierarquia (mesma query e
    // mesmo cache — client e servidor — que a própria Área já usa; se a Área
    // já foi visitada nesta sessão, isso não gera nenhum request novo) só
    // quando precisa, pra achar o depto dono do nível clicado.
    let depto: string | undefined;
    if (dim === "depto") {
      depto = name;
    } else {
      const hierData = await queryClient.fetchQuery({
        queryKey: ["area-filter-hierarchy"],
        queryFn: () => getHierarchy({}),
        staleTime: QUERY_STALE_REFERENCE,
        gcTime: QUERY_GC_REFERENCE,
      });
      depto = hierData.hierarchy.find((h) => h[dim] === name)?.depto ?? undefined;
    }
    const search = {
      store: clickThroughStore,
      depto,
      secao: undefined as string | undefined,
      grupo: undefined as string | undefined,
      subgrupo: undefined as string | undefined,
    };
    search[dim] = name;
    navigate({ to: "/area", search });
  };
  const goToProduto = (code?: string) => {
    if (!code) return;
    navigate({ to: "/produto", search: { plu: code, store: clickThroughStore } });
  };

  const { data, isFetching, isLoading } = useQuery({
    queryKey: ["dashboard", filters],
    queryFn: () => fn({ data: filters }),
    enabled,
    staleTime: QUERY_STALE_CORE,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  });

  const { data: rankings, isFetching: rankingLoading } = useQuery({
    queryKey: ["dashboard-rankings", filters],
    queryFn: () => fnRank({ data: { ...filters, limit: 10 } }),
    enabled,
    staleTime: QUERY_STALE_CORE,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  });

  const hideStores = filters.stores.length === 1;
  const hideDepto = filters.deptos.length === 1;
  const hideSecao = filters.secoes.length === 1;
  const hideGrupo = filters.grupos.length === 1;
  const hideSubgrupo = filters.subgrupos.length === 1;

  return (
    <div>
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold flex items-center gap-2">
            <LayoutDashboard className="size-7 text-primary shrink-0" /> Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            Visão geral de vendas por loja, departamento e período.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isFetching && <span className="text-xs text-muted-foreground">Atualizando…</span>}
        </div>
      </header>

      <FilterBar value={filters} onChange={setFilters} />

      <section className="grid gap-4 sm:grid-cols-1">
        {isLoading ? (
          <div className="kpi-card">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-2 h-8 w-40" />
            <Skeleton className="mt-2 h-3 w-32" />
          </div>
        ) : data && data.total === 0 ? (
          <div className="kpi-card text-center py-10">
            <p className="text-sm text-muted-foreground">
              Nenhuma venda encontrada para o período e filtros selecionados.
            </p>
          </div>
        ) : (
          <KpiCard label="Venda total" value={fmtBRL(data?.total ?? 0)} />
        )}
      </section>

      <Suspense
        fallback={
          <section className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="kpi-card">
              <Skeleton className="h-64 w-full rounded-lg" />
            </div>
            <div className="kpi-card">
              <Skeleton className="h-64 w-full rounded-lg" />
            </div>
          </section>
        }
      >
        <ErrorBoundary>
          <DashboardCharts data={data} isLoading={isLoading} hideStores={hideStores} />
        </ErrorBoundary>
      </Suspense>

      {hideDepto && hideSecao && hideGrupo && hideSubgrupo ? null : (
        <section className="mt-6 grid gap-4 lg:grid-cols-2">
          <ErrorBoundary>
            {hideDepto ? null : (
              <RankingCard
                title="Top Departamentos"
                items={rankings?.byDepto ?? []}
                isLoading={rankingLoading}
                onItemClick={(it) => goToArea("depto", it.name)}
              />
            )}
          </ErrorBoundary>
          <ErrorBoundary>
            {hideSecao ? null : (
              <RankingCard
                title="Top Seções"
                items={rankings?.bySecao ?? []}
                isLoading={rankingLoading}
                onItemClick={(it) => goToArea("secao", it.name)}
              />
            )}
          </ErrorBoundary>
          <ErrorBoundary>
            {hideGrupo ? null : (
              <RankingCard
                title="Top Grupos"
                items={rankings?.byGrupo ?? []}
                isLoading={rankingLoading}
                onItemClick={(it) => goToArea("grupo", it.name)}
              />
            )}
          </ErrorBoundary>
          <ErrorBoundary>
            {hideSubgrupo ? null : (
              <RankingCard
                title="Top Subgrupos"
                items={rankings?.bySubgrupo ?? []}
                isLoading={rankingLoading}
                onItemClick={(it) => goToArea("subgrupo", it.name)}
              />
            )}
          </ErrorBoundary>
        </section>
      )}

      <ErrorBoundary>
        <section className="mt-6">
          <RankingCard
            title="Top Produtos"
            items={rankings?.byProduto ?? []}
            isLoading={rankingLoading}
            onItemClick={(it) => goToProduto(it.code)}
          />
        </section>
      </ErrorBoundary>
    </div>
  );
}

export default Dashboard;
