import { BookText, Shield, Upload } from "lucide-react";
import { HowToSection } from "@/components/howto-section";

export function AdminHowToContent() {
  return (
    <>
      <HowToSection title="Importar Dados" icon={Upload}>
        <p className="mb-3 text-sm text-muted-foreground">
          Em Importar, envie uma ou mais planilhas XLSX no formato GPA. A data da venda é lida do
          conteúdo do arquivo, e uma confirmação é exibida antes do processamento.
        </p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Uma data já importada pode ser substituída após confirmação.</li>
          <li>Acompanhe o progresso e, se necessário, cancele a importação em andamento.</li>
          <li>Consulte o histórico de importações ou o calendário de cobertura dos dados.</li>
          <li>
            Vendas de produtos já cadastrados aparecem nos relatórios assim que a importação
            termina. Produtos ou categorias novos aparecem na Área e nos filtros depois da
            atualização diária das 03h30.
          </li>
        </ul>
      </HowToSection>

      <HowToSection title="Administração" icon={Shield}>
        <p className="mb-3 text-sm text-muted-foreground">
          Em Administração, use as abas disponíveis para gerenciar contas e acompanhar o sistema.
        </p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>
            Em Usuários, crie contas e edite nome, usuário, matrícula, papel, status ou senha.
          </li>
          <li>Em Sistema, consulte contagens, tamanho, versão e saúde do banco de dados.</li>
          <li>
            Em Auditoria, acompanhe a execução das rotinas agendadas e as ações sensíveis
            registradas pelo sistema.
          </li>
        </ul>
      </HowToSection>

      <HowToSection title="Documentação" icon={BookText}>
        <p className="text-sm text-muted-foreground">
          A página Documentação reúne documentos técnicos e análises internas do sistema. Selecione
          um documento na lista para consultar seu conteúdo e a data de atualização.
        </p>
      </HowToSection>
    </>
  );
}
