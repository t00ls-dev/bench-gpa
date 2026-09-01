import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { listDocs, getDocContent } from "@/lib/admin-docs.functions";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, BookText, FileText } from "lucide-react";
import { fmtBRShort } from "@/lib/utils";
import { Route } from "./admin.docs";

/**
 * Absolute date, not relative. `date`, extracted from the doc's own text, is
 * preferred because it is explicitly authored. `lastModified` is the
 * fallback for docs without a date and comes from the latest commit that
 * changed the Markdown blob; mode-only changes and content-preserving renames
 * are ignored by scripts/generate-doc-meta.ts.
 *
 * fmtBRShort (not date-fns) on purpose: reuses the same fixed-timezone
 * formatting as the rest of the app, instead of another library with the
 * same local-getters-under-the-hood problem (that was the real cause of
 * Sentry BENCH-GPA-Y still firing on /admin/docs even after the fmtDT fix,
 * 08/04/2026).
 */
function lastUpdated(date: string, lastModified: number | null): string | null {
  if (date) return date;
  if (lastModified) return fmtBRShort(lastModified * 1000);
  return null;
}

export default function AdminDocsPage() {
  const { slug } = Route.useSearch();

  if (slug) {
    return <DocViewer slug={slug} />;
  }
  return <DocList />;
}

function DocList() {
  const list = useServerFn(listDocs);
  const navigate = Route.useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-docs"],
    queryFn: () => list(),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <header className="mb-6">
          <h1 className="font-display text-3xl font-bold flex items-center gap-2">
            <BookText className="size-7 text-primary shrink-0" /> Documentação
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Documentação técnica e análises do sistema.
          </p>
        </header>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <header className="mb-6">
          <h1 className="font-display text-3xl font-bold flex items-center gap-2">
            <BookText className="size-7 text-primary shrink-0" /> Documentação
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Documentação técnica e análises do sistema.
          </p>
        </header>
        <div className="kpi-card p-6 text-sm text-destructive">
          Erro ao carregar documentação: {(error as Error).message}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="mb-6">
        <h1 className="font-display text-3xl font-bold flex items-center gap-2">
          <BookText className="size-7 text-primary shrink-0" /> Documentação
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Documentação técnica e análises do sistema.
        </p>
      </header>
      {!data || data.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum documento encontrado.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {data.map((doc) => {
            const updated = lastUpdated(doc.date, doc.lastModified);
            return (
              <button
                key={doc.slug}
                onClick={() => navigate({ search: { slug: doc.slug } })}
                className="kpi-card flex items-start gap-3 text-left hover:bg-accent/50 transition-colors cursor-pointer"
              >
                <FileText className="mt-0.5 size-5 shrink-0 text-primary" />
                <div className="min-w-0">
                  <div className="font-medium">{doc.title}</div>
                  {updated && (
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      Última atualização: {updated}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DocViewer({ slug }: { slug: string }) {
  const navigate = Route.useNavigate();
  const getContent = useServerFn(getDocContent);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-doc", slug],
    queryFn: () => getContent({ data: { slug } }),
  });

  const content = data?.content ?? "";
  const updated = data ? lastUpdated(data.date, data.lastModified) : null;

  return (
    <div className="space-y-4">
      <Button variant="ghost" onClick={() => navigate({ search: {} })}>
        <ArrowLeft className="mr-2 size-4" /> Voltar
      </Button>
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
      ) : error ? (
        <div className="kpi-card p-6 text-sm text-destructive">
          Erro ao carregar documento: {(error as Error).message}
        </div>
      ) : (
        <>
          {updated && (
            <p className="text-xs text-muted-foreground">Última atualização: {updated}</p>
          )}
          <article className="markdown-content overflow-x-auto">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </article>
        </>
      )}
    </div>
  );
}
