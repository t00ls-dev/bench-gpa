# Admin (Usuários) — Possíveis melhorias

## Gestão de Usuários

- **Editar nome do usuário**: hoje não é possível alterar o nome após a criação
- **Trocar email**: permitir alterar o email do usuário (ex: mudança de e-mail corporativo)
- **Filtros na lista**: buscar por nome ou email, filtrar por papel (admin/user) ou status (ativo/inativo)
- **Ordenação na tabela**: clicar nos cabeçalhos para ordenar por coluna
- **Paginação**: quando houver muitos usuários, paginar a lista
- **Exportar lista**: CSV com todos os usuários e seus dados

## Criação de Usuário

- **Sufixo de email fixo**: já existe o `@gpabr.com` no input, mas o placeholder poderia incluir exemplos reais
- **Validação mais robusta**: força mínima de senha, confirmar senha, validação de email format
- **Prefill de papel**: manter o último papel selecionado ao abrir o diálogo novamente
- **Bulk create**: criar múltiplos usuários de uma vez (CSV import)

## Segurança

- **Audit log**: registrar quem criou/alterou/desativou cada usuário
- **Confirmação em ações destrutivas**: `AlertDialog` para desativar usuário, mudar papel, resetar senha (já existe para create dialog mas não para as ações inline)
- **Autenticação**: a role check é feita no `beforeLoad` e no `AdminGate` (dupla verificação — bom). Mas o servidor também valida via `assertAdmin` nas server functions
- **Sessão do admin**: alertar se o admin estiver prestes a se desativar ou remover próprio role (já tem proteção)
- **Rate limit de criação**: evitar criação massiva de usuários automatizada

## Experiência

- **Toast de confirmação**: toast.success já existe, mas poderia ter undo para ações como desativar
- **Loading inline**: o switch de ativo não mostra feedback de loading enquanto a requisição não completa
- **Estado vazio**: se não houver usuários além do admin atual, mostrar mensagem informativa
- **Feedback de erro mais claro**: erros de servidor podem ser genéricos, melhorar mensagens

## Funcionalidades Adicionais

- **Grupos de usuários**: criar grupos com permissões customizadas
- **Histórico de acesso**: ver último login de cada usuário
- **Relatório de uso**: quais usuários mais acessaram, quais páginas
- **Notificações**: enviar email ao criar usuário com instruções de primeiro acesso
