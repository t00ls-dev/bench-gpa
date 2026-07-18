import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { listDocs, getDocContent } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, BookText, FileText } from "lucide-react";
import { Route } from "./admin.docs";

function timeago(ts: number): string {
  return formatDistanceToNow(ts * 1000, { addSuffix: true, locale: ptBR });
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

  const grouped: Record<string, typeof data> = {};
  for (const doc of data ?? []) {
    (grouped[doc.category] ??= []).push(doc);
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
      {Object.keys(grouped).length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum documento encontrado.</p>
      ) : (
        Object.entries(grouped).map(([category, docs]) => (
          <section key={category}>
            <h2 className="mb-3 text-lg font-semibold text-muted-foreground">{category}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {docs?.map((doc) => (
                <button
                  key={doc.slug}
                  onClick={() => navigate({ search: { slug: doc.slug } })}
                  className="kpi-card flex items-start gap-3 text-left hover:bg-accent/50 transition-colors cursor-pointer"
                >
                  <FileText className="mt-0.5 size-5 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <div className="font-medium">{doc.title}</div>
                    {(doc.lastModified || doc.date) && (
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {doc.lastModified && timeago(doc.lastModified)}
                        {doc.lastModified && doc.date && " · "}
                        {doc.date}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function DocViewer({ slug }: { slug: string }) {
  const navigate = Route.useNavigate();
  const getContent = useServerFn(getDocContent);

  const {
    data,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["admin-doc", slug],
    queryFn: () => getContent({ data: { slug } }),
  });

  const content = data?.content ?? "";
  const lastModified = data?.lastModified ?? null;

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
          {lastModified && (
            <p className="text-xs text-muted-foreground">
              Atualizado {timeago(lastModified)}
            </p>
          )}
          <article className="markdown-content overflow-x-auto">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </article>
        </>
      )}
    </div>
  );
}
