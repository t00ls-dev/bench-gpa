import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { supabase } from "@/integrations/supabase/client";
import { AdminGate } from "@/components/admin-gate";
import { listDocs, getDocContent } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, FileText } from "lucide-react";

const docsSearchSchema = z.object({
  slug: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/admin/docs")({
  validateSearch: docsSearchSchema,
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw redirect({ to: "/auth" });
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: u.user.id,
      _role: "admin",
    });
    if (isAdmin !== true) throw redirect({ to: "/" });
  },
  component: () => <AdminGate><AdminDocsPage /></AdminGate>,
});

function AdminDocsPage() {
  const { slug } = Route.useSearch();

  if (slug) {
    return <DocViewer slug={slug} />;
  }
  return <DocList />;
}

function DocList() {
  const list = useServerFn(listDocs);
  const navigate = Route.useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-docs"],
    queryFn: () => list(),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-display font-bold">Documentação</h1>
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
      </div>
    );
  }

  const grouped: Record<string, typeof data> = {};
  for (const doc of data ?? []) {
    (grouped[doc.category] ??= []).push(doc);
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-display font-bold">Documentação</h1>
      {Object.entries(grouped).map(([category, docs]) => (
        <section key={category}>
          <h2 className="mb-3 text-lg font-semibold text-muted-foreground">{category}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {docs.map((doc) => (
              <button
                key={doc.slug}
                onClick={() => navigate({ search: { slug: doc.slug } })}
                className="kpi-card flex items-start gap-3 text-left hover:bg-accent/50 transition-colors cursor-pointer"
              >
                <FileText className="mt-0.5 size-5 shrink-0 text-primary" />
                <span className="font-medium">{doc.title}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function DocViewer({ slug }: { slug: string }) {
  const navigate = Route.useNavigate();
  const getContent = useServerFn(getDocContent);

  const { data: content, isLoading } = useQuery({
    queryKey: ["admin-doc", slug],
    queryFn: () => getContent({ data: { slug } }),
  });

  return (
    <div className="space-y-4">
      <Button variant="ghost" onClick={() => navigate({ search: {} })}>
        <ArrowLeft className="mr-2 size-4" /> Voltar
      </Button>
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-4 w-full" />)}
        </div>
      ) : (
        <article className="markdown-content">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content ?? ""}</ReactMarkdown>
        </article>
      )}
    </div>
  );
}
