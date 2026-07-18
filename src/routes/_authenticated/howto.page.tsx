"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Route } from "./howto";
import { BookText, Sun, Moon, Keyboard, Search, Package, Layers, Upload, Gauge, HelpCircle } from "lucide-react";

const shortcutRows = [
  { keys: "Cmd / Ctrl + K", desc: "Abrir paleta de comandos" },
  { keys: "g + d", desc: "Ir para Dashboard" },
  { keys: "g + p", desc: "Ir para Produto" },
  { keys: "g + a", desc: "Ir para Área" },
  { keys: "g + u", desc: "Ir para Importar" },
  { keys: "g + o", desc: "Ir para Documentação" },
  { keys: "g + n", desc: "Ir para Administração" },
  { keys: "Shift + ?", desc: "Abrir esta ajuda" },
];

function Kbd({ children }: { children: string }) {
  return <kbd className="rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">{children}</kbd>;
}

function Section({ title, icon: Icon, children }: { title: string; icon: typeof BookText; children: React.ReactNode }) {
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
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
            <th className="pb-2 pr-4 font-medium">Atalho</th>
            <th className="pb-2 font-medium">Ação</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.keys} className="border-b border-border/50 last:border-0">
              <td className="py-2 pr-4"><Kbd>{r.keys}</Kbd></td>
              <td className="py-2 text-muted-foreground">{r.desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const cacheRows = [
  { key: "dashboard_metrics", ttl: "30s" },
  { key: "area_filter_hierarchy", ttl: "5min" },
  { key: "imported_dates", ttl: "1min" },
  { key: "has_role", ttl: "5min / usuário" },
];

export default function HowToPage() {
  const { user } = Route.useRouteContext();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("users")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      setIsAdmin(data?.role === "admin");
      setLoading(false);
    })();
  }, [user.id]);

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
          A sidebar à esquerda dá acesso a todas as páginas. Em mobile, abre como gaveta.
          Use os atalhos de teclado para navegar sem clicar:
        </p>
        <ShortcutTable rows={shortcutRows} />
        <p className="mt-3 text-sm text-muted-foreground">
          A <strong>paleta de comandos</strong> (<Kbd>Cmd+K</Kbd>) permite buscar páginas e
          produtos rapidamente. Digite o nome do produto para ir direto à análise.
        </p>
      </Section>

      <Section title="Aparência" icon={Sun}>
        <p className="text-sm text-muted-foreground">
          Alterne entre os temas <strong>Claro</strong>, <strong>Escuro</strong> e{' '}
          <strong>Sistema</strong> pelo botão de sol/lua no rodapé da sidebar (ao lado do email).
          A escolha é salva no navegador.
        </p>
      </Section>

      <Section title="Dashboard" icon={Gauge}>
        <p className="text-sm text-muted-foreground">
          A página inicial exibe KPIs e gráficos do período selecionado.
        </p>
        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
          <li className="flex gap-2"><span className="text-primary font-bold">•</span> Use o <strong>filtro de datas</strong> no topo para ajustar o período.</li>
          <li className="flex gap-2"><span className="text-primary font-bold">•</span> Os <strong>cards</strong> mostram receita, margem, volume e tickets.</li>
          <li className="flex gap-2"><span className="text-primary font-bold">•</span> Gráficos de <strong>evolução diária</strong> e <strong>comparação</strong> entre períodos.</li>
          <li className="flex gap-2"><span className="text-primary font-bold">•</span> Dados têm <strong>cache de 30s</strong> — alterações recentes podem levar até 30s para refletir.</li>
        </ul>
      </Section>

      <Section title="Produto" icon={Package}>
        <p className="text-sm text-muted-foreground">
          Busque produtos por nome ou código (mínimo 3 caracteres).
        </p>
        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
          <li className="flex gap-2"><span className="text-primary font-bold">•</span> Selecione um produto para ver <strong>análise completa</strong>: receita, margem, evolução.</li>
          <li className="flex gap-2"><span className="text-primary font-bold">•</span> Escolha uma <strong>loja específica</strong> ou veja todas.</li>
          <li className="flex gap-2"><span className="text-primary font-bold">•</span> A <strong>hierarquia</strong> (departamento → seção → grupo) é exibida automaticamente.</li>
          <li className="flex gap-2"><span className="text-primary font-bold">•</span> Compare com <strong>semanas anteriores</strong> (mesmo dia da semana).</li>
        </ul>
      </Section>

      <Section title="Área" icon={Layers}>
        <p className="text-sm text-muted-foreground">
          Explore dados agrupados por departamento, seção, grupo ou subgrupo.
        </p>
        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
          <li className="flex gap-2"><span className="text-primary font-bold">•</span> Use os <strong>filtros hierárquicos</strong> para navegar entre níveis.</li>
          <li className="flex gap-2"><span className="text-primary font-bold">•</span> <strong>Ranking</strong> de performance por área.</li>
          <li className="flex gap-2"><span className="text-primary font-bold">•</span> <strong>Exportação</strong> dos dados em PNG ou PDF.</li>
        </ul>
      </Section>

      {!loading && isAdmin && (
        <Section title="Importar Vendas" icon={Upload}>
          <p className="text-sm text-muted-foreground">
            Faça upload de planilhas XLSX no formato GPA para importar dados de vendas.
          </p>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            <li className="flex gap-2"><span className="text-primary font-bold">•</span> Formatos aceitos: <strong>.xlsx</strong> (exportação GPA).</li>
            <li className="flex gap-2"><span className="text-primary font-bold">•</span> Limite: <strong>200.000 linhas</strong> por arquivo.</li>
            <li className="flex gap-2"><span className="text-primary font-bold">•</span> A importação é feita em <strong>lotes de 1.000 linhas</strong> com barra de progresso.</li>
            <li className="flex gap-2"><span className="text-primary font-bold">•</span> Use o <strong>calendário</strong> para visualizar datas já importadas.</li>
            <li className="flex gap-2"><span className="text-primary font-bold">•</span> Ao confirmar, os dados do período são <strong>substituídos</strong> (não acumulados).</li>
          </ul>
        </Section>
      )}

      {!loading && isAdmin && (
        <Section title="Cache de Dados" icon={Gauge}>
          <p className="mb-3 text-sm text-muted-foreground">
            Para performance, algumas consultas usam cache com TTL (time-to-live):
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Consulta</th>
                  <th className="pb-2 font-medium">Cache</th>
                </tr>
              </thead>
              <tbody>
                {cacheRows.map((r) => (
                  <tr key={r.key} className="border-b border-border/50 last:border-0">
                    <td className="py-2 pr-4 font-mono text-xs">{r.key}</td>
                    <td className="py-2 text-muted-foreground">{r.ttl}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            O cache é invalidado automaticamente após o TTL. Dados recentemente importados
            podem levar até 30s para aparecer no dashboard.
          </p>
        </Section>
      )}

      <Section title="Conta" icon={HelpCircle}>
        <p className="text-sm text-muted-foreground">
          Seu email aparece no rodapé da sidebar e no topo da página.
          Para sair, clique no ícone de saída (<Kbd>LogOut</Kbd>) ao lado do email.
        </p>
      </Section>

      <p className="text-center text-xs text-muted-foreground mt-8">
        Bench GPA · Pressione <Kbd>Shift+?</Kbd> para abrir este guia a qualquer momento.
      </p>
    </div>
  );
}
