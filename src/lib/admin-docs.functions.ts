import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "./auth-middleware";
import { requireRateLimit } from "./rate-limit.middleware";
import { assertAdmin } from "./admin-utils";
import { SingleSlugSchema } from "./schemas";
import docMeta from "@/generated/doc-meta.json";

interface DocEntry {
  slug: string;
  title: string;
  category: string;
  date: string;
  lastModified: number | null;
}

const docModules = import.meta.glob("/docs/**/*.md", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

export const listDocs = createServerFn({ method: "GET" })
  .middleware([requireAuth, requireRateLimit()])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const entries: DocEntry[] = [];
    for (const [filePath, content] of Object.entries(docModules)) {
      const slug = filePath.replace(/^\/docs\//, "").replace(/\.md$/, "");
      if (slug === "improvements/README") continue;
      const title =
        extractDocTitle(content) ??
        slug.replace(/[/_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      const date = extractDocDate(content) ?? "";
      const category = slug.startsWith("improvements/")
        ? "Análise do Código"
        : "Documentação Técnica";
      const lastModified = (docMeta as Record<string, number | null>)[filePath] ?? null;
      entries.push({ slug, title, category, date, lastModified });
    }
    entries.sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
    return entries;
  });

export const getDocContent = createServerFn({ method: "POST" })
  .middleware([requireAuth, requireRateLimit()])
  .inputValidator((data: unknown) => SingleSlugSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const filePath = `/docs/${data.slug}.md`;
    const content = docModules[filePath];
    if (!content) throw new Error("Documento não encontrado.");
    const lastModified = (docMeta as Record<string, number | null>)[filePath] ?? null;
    return { content, lastModified };
  });

function extractDocTitle(content: string): string | null {
  const m = content.match(/^#\s+(.+)/m);
  return m ? m[1].trim() : null;
}

function extractDocDate(content: string): string | null {
  const dm = content.match(/(\d{2}\/\d{2}\/\d{4})/);
  if (dm) return dm[1];
  const mm = content.match(/(\w{3,4}o?\/\d{4})/i);
  if (mm) return mm[1].replace(/^(\w)/, (c) => c.toUpperCase());
  return null;
}
