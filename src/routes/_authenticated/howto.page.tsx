"use client";

import { lazy, Suspense } from "react";
import { Route } from "./howto";
import { Menu, Package, Layers, Gauge, HelpCircle, ClipboardList } from "lucide-react";
import { HowToSection } from "@/components/howto-section";
import { hasAdminRole } from "@/lib/roles";

const AdminHowToContent = lazy(() =>
  import("@/components/admin-howto-content").then((module) => ({
    default: module.AdminHowToContent,
  })),
);

export default function HowToPage() {
  const { user } = Route.useRouteContext();
  const isAdmin = hasAdminRole(user.role);

  return (
    <div>
      <header className="mb-8">
        <h1 className="font-display text-2xl sm:text-3xl font-bold flex items-center gap-2">
          <HelpCircle className="size-7 text-primary shrink-0" /> Como usar o Bench GPA
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Guia rápido de navegação e funcionalidades.
        </p>
      </header>

      <HowToSection title="Navegação" icon={Menu}>
        <p className="mb-3 text-sm text-muted-foreground">
          No desktop, use a <strong>sidebar à esquerda</strong> para navegar entre as páginas. Em
          mobile, use a <strong>barra inferior</strong> para acesso rápido (Dashboard, Produto, Área
          e Previsão) e o botão <strong>"Mais"</strong> para abrir Como usar e sair.
        </p>
        {isAdmin && (
          <p className="text-sm text-muted-foreground">
            As páginas administrativas ficam na sidebar do desktop e no menu Mais do mobile.
          </p>
        )}
      </HowToSection>

      <HowToSection title="Dashboard" icon={Gauge}>
        <p className="mb-3 text-sm text-muted-foreground">
          O Dashboard exibe a venda total do período, a evolução diária, as lojas com maior venda e
          rankings de departamentos, seções, grupos, subgrupos e produtos.
        </p>
        <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
          <li>
            Use o <strong>seletor de datas</strong> no topo para escolher o período.
          </li>
          <li>
            Use os <strong>filtros</strong> para selecionar lojas, departamentos, seções, grupos e
            subgrupos.
          </li>
          <li>
            Clique em um item dos rankings para abrir a análise correspondente em Área ou Produto.
          </li>
        </ul>
      </HowToSection>

      <HowToSection title="Produto" icon={Package}>
        <p className="mb-3 text-sm text-muted-foreground">
          Busque um produto por código ou nome e veja a análise detalhada: evolução de vendas,
          distribuição por loja, performance em dias anteriores e comparação com mesmo dia da
          semana.
        </p>
        <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
          <li>Digite pelo menos 3 caracteres para buscar.</li>
          <li>Clique em um resultado para ver a análise completa.</li>
          <li>Selecione uma ou mais lojas. A seleção permanece salva para o próximo acesso.</li>
          <li>Os cinco produtos abertos mais recentemente ficam disponíveis abaixo da busca.</li>
        </ul>
      </HowToSection>

      <HowToSection title="Área" icon={Layers}>
        <p className="mb-3 text-sm text-muted-foreground">
          A página Área exibe a análise de todos os produtos no período selecionado, com tabela
          paginada e filtros hierárquicos (loja → departamento → seção → grupo → subgrupo →
          produto).
        </p>
        <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
          <li>Selecione ao menos uma loja, um departamento e um período para iniciar.</li>
          <li>Use o filtro Produto ou a busca textual para localizar produtos específicos.</li>
          <li>Ordene por qualquer coluna clicando no cabeçalho.</li>
          <li>Clique em um produto para abrir sua análise detalhada.</li>
          <li>Exporte a tabela em PDF.</li>
          <li>Salve uma composição de produtos para uma loja e volte a ela por Análises salvas.</li>
          <li>
            Em Criadas por mim, você gerencia suas análises. Qualquer usuário autenticado que receba
            o link ou QR Code pode visualizá-las, mas somente o proprietário pode editar ou excluir.
          </li>
          <li>
            Áreas abertas neste dispositivo aparecem em Recentemente visitadas por até 30 dias, com
            limite de 10 itens. O histórico fica separado por usuário e pode ser limpo.
          </li>
        </ul>
      </HowToSection>

      <HowToSection title="Previsão de Venda" icon={ClipboardList}>
        <p className="mb-3 text-sm text-muted-foreground">
          A Previsão estima a venda de produtos de Perecíveis para uma loja e uma data com base nas
          últimas ocorrências do mesmo dia da semana.
        </p>
        <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
          <li>Selecione Loja, Data da previsão e Seção para carregar os resultados.</li>
          <li>Refine por Grupo, Subgrupo e Produto.</li>
          <li>Alterar a data mantém os filtros selecionados.</li>
          <li>Alterar um nível da hierarquia limpa somente os níveis dependentes.</li>
          <li>Exporte a previsão em PDF.</li>
        </ul>
      </HowToSection>

      {isAdmin ? (
        <Suspense fallback={null}>
          <AdminHowToContent />
        </Suspense>
      ) : null}
    </div>
  );
}
