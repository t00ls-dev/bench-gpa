import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getSavedAreaAnalysis } from "@/lib/saved-area-analyses.functions";
import { AreaPageContent } from "./area.page";
import { Route } from "./area_.$analysisId";
import { Route as AuthenticatedRoute } from "./route";

export default function SavedAreaAnalysisPage() {
  const { analysisId } = Route.useParams();
  const { user } = AuthenticatedRoute.useRouteContext();
  const getSavedAnalysis = useServerFn(getSavedAreaAnalysis);
  const analysisQuery = useQuery({
    queryKey: ["saved-area-analysis", user.id, analysisId],
    queryFn: () => getSavedAnalysis({ data: { id: analysisId } }),
    retry: false,
  });

  if (analysisQuery.isPending) {
    return (
      <div className="space-y-4" aria-label="Carregando análise salva">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (analysisQuery.isError) {
    return (
      <div className="kpi-card text-center">
        <p className="mb-1 font-medium">Não foi possível abrir esta análise salva.</p>
        <p className="mb-4 text-sm text-muted-foreground">
          Ela pode ter sido excluída ou o endereço pode estar incorreto.
        </p>
        <div className="flex justify-center gap-2">
          <Button variant="outline" onClick={() => analysisQuery.refetch()}>
            Tentar novamente
          </Button>
          <Button asChild>
            <Link
              to="/area"
              search={{
                store: undefined,
                depto: undefined,
                secao: undefined,
                grupo: undefined,
                subgrupo: undefined,
              }}
            >
              Voltar para Análise de Área
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <AreaPageContent
      key={analysisQuery.data.id}
      searchParams={{}}
      savedAnalysis={analysisQuery.data}
    />
  );
}
