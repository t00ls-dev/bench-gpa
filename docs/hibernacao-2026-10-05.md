# Hibernação do projeto

O Bench GPA foi descontinuado em 05/10/2026. O repositório permanece privado
somente para preservar o código-fonte e o histórico Git. Não existe intenção de
manter a aplicação disponível, atualizar dependências, executar CI ou publicar
novas versões.

## Estado concluído

- O processo `bench-gpa`, o serviço `pm2-admin`, o módulo `pm2-logrotate`, os
  dumps de startup e o pacote global do PM2 foram removidos.
- As crons Hestia de purga e atualização da hierarquia foram excluídas.
- O banco MariaDB `admin_gpa`, com seus usuários e dados de vendas, foi excluído
  sem criação de dump ou outro backup.
- O domínio `gpa.t00ls.dev` foi removido do Hestia. O diretório da aplicação,
  incluindo releases, `.env` e logs, foi excluído junto com o domínio.
- O registro DNS de `gpa.t00ls.dev` deixou de existir. Resolvedores públicos
  respondem `NXDOMAIN`, portanto o site não possui endereço acessível.
- A chave dedicada `github-actions@bench-gpa`, seu par privado armazenado na
  VPS e o alias SSH correspondente foram removidos. A chave administrativa
  pessoal foi preservada no `authorized_keys` da conta `debian`.
- Dependabot, GitHub Actions e o workflow de deploy foram desabilitados. Suas
  configurações também foram removidas da versão corrente do repositório.
- A integração MCP do Sentry foi removida da configuração do OpenCode.
- O widget Turnstile e o projeto Sentry foram excluídos nos respectivos
  provedores. O token Sentry dedicado também foi revogado.
- Configurações e logs residuais do nginx, Apache, logrotate, Hestia e MariaDB
  foram removidos. O buffer pool do MariaDB voltou de 512 MB para o padrão de
  128 MB; `t00ls.dev` e `cepeg.t00ls.dev` permaneceram acessíveis após o
  reinício.
- Nenhuma branch, tag, release ou parte do histórico Git foi excluída.
- A VPS, o Hestia, o nginx, o MariaDB e o Backblaze foram preservados porque
  também atendem `t00ls.dev` e `cepeg.t00ls.dev`.

## Backup compartilhado

Um novo backup compartilhado do usuário `admin` foi gerado depois da remoção do
GPA. Ele contém somente `sv1.t00ls.dev`, `t00ls.dev`, `cepeg.t00ls.dev`, o
domínio de e-mail `t00ls.dev` e o banco `admin_cepeg`. A inspeção do arquivo
confirmou que não há caminho do domínio, banco ou projeto GPA.

A rotação automática do Hestia havia falhado silenciosamente no B2 por
incompatibilidade com a sintaxe atual do CLI `b2`. Existiam 22 backups remotos
antigos, de 14/09 a 05/10/2026, além da cópia nova. Todas as versões antigas
foram excluídas permanentemente. O armazenamento local e o B2 agora possuem
somente `admin.2026-10-05_15-11-45.tar`, sem os dados operacionais do GPA.

## Ações administrativas pendentes

- Depois que esta documentação estiver integrada na `main`, arquivar o
  repositório no GitHub para torná-lo somente leitura.
- A integração de backup do Hestia com o CLI `b2` precisa ser corrigida para os
  projetos compartilhados. A falha não mantém nenhum dado do GPA, mas pode
  voltar a acumular backups futuros de `t00ls.dev` e `cepeg.t00ls.dev`.

## Credenciais sem finalidade

Os secrets do GitHub relacionados a deploy, Sentry e chaves públicas de build
foram removidos. As credenciais que existiam apenas no `.env` de produção foram
eliminadas com o diretório do domínio. A chave SSH dedicada ao deploy foi
revogada e removida da VPS. O token Sentry foi revogado no próprio provedor.
