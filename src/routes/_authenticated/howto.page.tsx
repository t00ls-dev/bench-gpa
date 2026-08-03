"use client";

import { Route } from "./howto";
import { Keyboard, Package, Layers, Upload, Gauge, HelpCircle } from "lucide-react";

const shortcutRows = [
  { keys: "Cmd / Ctrl + K", desc: "Abrir paleta de comandos" },
  { keys: "g + d", desc: "Ir para Dashboard" },
  { keys: "g + p", desc: "Ir para Produto" },
  { keys: "g + a", desc: "Ir para Área" },
  { keys: "g + u", desc: "Ir para Importar" },
  { keys: "g + o", desc: "Ir para Documentação" },
  { keys: "g + n", desc: "Ir para Administração" },
  { keys: "g + h", desc: "Ir para Como usar" },
  { keys: "Shift + ?", desc: "Abrir esta ajuda" },
];

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">
      {children}
    </kbd>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof HelpCircle;
  children: React.ReactNode;
}) {
  return (
    <section className="kpi-card mb-6">
      <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-semibold">
        <Icon className="size-5 text-primary" />
        {title}
      </h2>
      {children}
    </section>
  );
}

function ShortcutTable({ rows }: { rows: { keys: string; desc: string }[] }) {
  return (
    <div className="divide-y divide-border/50">
      {rows.map((r) => (
        <div
          key={r.keys}
          className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-center sm:gap-3 first:pt-0 last:pb-0"
        >
          <Kbd>{r.keys}</Kbd>
          <span className="text-sm text-muted-foreground">{r.desc}</span>
        </div>
      ))}
    </div>
  );
}

const cacheRows = [
  { key: "dashboard_metrics", ttl: "1min" },
  { key: "area_filter_hierarchy", ttl: "5min" },
  { key: "imported_dates", ttl: "1min" },
  { key: "has_role", ttl: "5min / usuário" },
];

export default function HowToPage() {
  const { user } = Route.useRouteContext();
  const isAdmin = user.role === "admin";

  return (
    <div>
      <header className="mb-8">
        <h1 className="font-display text-2xl sm:text-3xl font-bold flex items-center gap-2">
          <HelpCircle className="size-7 text-primary shrink-0" /> Como usar o Bench GPA
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Guia rápido de navegação, funcionalidades e atalhos.
        </p>
      </header>

      <Section title="Navegação" icon={Keyboard}>
        <p className="mb-3 text-sm text-muted-foreground">
          No desktop, use a <strong>sidebar à esquerda</strong> para navegar entre as páginas. Em
          mobile, use a <strong>barra inferior</strong> para acesso rápido (Dashboard, Produto,
          Área, Como usar) e o botão <strong>"Mais"</strong> para funções administrativas. Use
          também os atalhos de teclado:
        </p>
        <ShortcutTable rows={shortcutRows} />
      </Section>

      <Section title="Dashboard" icon={Gauge}>
        <p className="mb-3 text-sm text-muted-foreground">
          O Dashboard exibe KPIs consolidados do período selecionado: faturamento total, produtos
          com e sem venda, evolução diária, vendas por loja/departamento e rankings dos itens de
          maior faturamento.
        </p>
        <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
          <li>
            Use o <strong>seletor de datas</strong> no topo para escolher o período.
          </li>
          <li>
            Use os <strong>filtros</strong> para selecionar lojas, departamentos, seções, grupos e
            subgrupos.
          </li>
        </ul>
      </Section>

      <Section title="Produto" icon={Package}>
        <p className="mb-3 text-sm text-muted-foreground">
          Busque um produto por código ou nome e veja a análise detalhada: evolução de vendas,
          distribuição por loja, performance em dias anteriores e comparação com mesmo dia da
          semana.
        </p>
        <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
          <li>Digite pelo menos 3 caracteres para buscar.</li>
          <li>Clique em um resultado para ver a análise completa.</li>
          <li>Exporte o relatório em PDF.</li>
        </ul>
      </Section>

      <Section title="Área" icon={Layers}>
        <p className="mb-3 text-sm text-muted-foreground">
          A página Área exibe a análise de todos os produtos no período selecionado, com tabela
          paginada e filtros hierárquicos (loja → departamento → seção → grupo → subgrupo).
        </p>
        <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
          <li>Filtre por qualquer nível da hierarquia.</li>
          <li>Use a busca textual para localizar produtos específicos.</li>
          <li>Ordene por qualquer coluna clicando no cabeçalho.</li>
          <li>Exporte a tabela em PDF.</li>
        </ul>
      </Section>

      {isAdmin && (
        <Section title="Importar Dados" icon={Upload}>
          <p className="mb-3 text-sm text-muted-foreground">
            Faça upload de arquivos .xlsx para importar dados de vendas. O sistema processa o
            arquivo e popula as tabelas de análise automaticamente.
          </p>
          <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
            <li>Apenas administradores podem importar dados.</li>
            <li>O progresso da importação é exibido em tempo real.</li>
            <li>
              Vendas de produtos já cadastrados aparecem nos relatórios assim que a importação
              termina. Produtos ou categorias genuinamente novos só aparecem na Área e nos filtros
              no dia seguinte, depois do refresh diário às 03h30.
            </li>
          </ul>
        </Section>
      )}

      <Section title="Cache" icon={HelpCircle}>
        <p className="mb-3 text-sm text-muted-foreground">
          O sistema usa cache temporário para evitar consultas repetidas ao banco de dados:
        </p>
        <div className="divide-y divide-border/50">
          {cacheRows.map((c) => (
            <div
              key={c.key}
              className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-center sm:gap-3 first:pt-0 last:pb-0"
            >
              <Kbd>{c.key}</Kbd>
              <span className="text-sm text-muted-foreground">TTL: {c.ttl}</span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
