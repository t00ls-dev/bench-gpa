# Hibernação do projeto

O Bench GPA foi descontinuado em 05/10/2026. O repositório permanece privado
somente para preservar o código-fonte e o histórico Git. Não existe intenção de
manter a aplicação disponível, atualizar dependências, executar CI ou publicar
novas versões.

## Estado concluído

- O processo `bench-gpa` foi removido do PM2 e está fora de execução.
- As crons Hestia de purga e atualização da hierarquia foram excluídas.
- O banco MariaDB `admin_gpa`, com seus usuários e dados de vendas, foi excluído
  sem criação de dump ou outro backup.
- O domínio `gpa.t00ls.dev` foi removido do Hestia. O diretório da aplicação,
  incluindo releases, `.env` e logs, foi excluído junto com o domínio.
- O registro DNS de `gpa.t00ls.dev` deixou de existir. Resolvedores públicos
  respondem `NXDOMAIN`, portanto o site não possui endereço acessível.
- A chave SSH usada pelo GitHub Actions foi removida do `authorized_keys` da
  conta de deploy na VPS.
- Dependabot, GitHub Actions e o workflow de deploy foram desabilitados. Suas
  configurações também foram removidas da versão corrente do repositório.
- A integração MCP do Sentry foi removida da configuração do OpenCode.
- Nenhuma branch, tag, release ou parte do histórico Git foi excluída.
- A VPS, o Hestia, o nginx, o MariaDB e o Backblaze foram preservados porque
  também atendem `t00ls.dev` e `cepeg.t00ls.dev`.

## Backup compartilhado

O único backup existente no Hestia é um arquivo compartilhado do usuário
`admin`. Ele contém `t00ls.dev`, `cepeg.t00ls.dev`, `admin_cepeg` e, até a
rotação seguinte, uma cópia do antigo Bench GPA. Excluir esse arquivo destruiria
o backup dos outros projetos. Nenhum backup adicional do GPA foi criado. Como a
retenção do Hestia é de uma cópia, a próxima rotação substitui esse arquivo por
outro que já não inclui o domínio nem o banco removidos.

## Ações administrativas pendentes

Estas ações não puderam ser concluídas com as credenciais disponíveis no
repositório:

- No PM2 da conta `admin`, executar `pm2 save --force`. O processo está parado e
  os arquivos da aplicação não existem mais, mas o dump de startup anterior não
  foi substituído porque `pm2 save` recusa uma lista vazia sem `--force`. Antes
  disso, um reboot pode causar tentativas falhas de iniciar o caminho removido.
- No Cloudflare, excluir o widget Turnstile dedicado ao projeto. O registro DNS
  de `gpa.t00ls.dev` já não existe.
- No Sentry, excluir o projeto do Bench GPA e revogar o token de autenticação
  usado pelo build. A API recusou a exclusão porque o token disponível não tem
  permissão administrativa. A aplicação fora do ar não envia novos eventos.
- Depois que esta documentação estiver integrada na `main`, arquivar o
  repositório no GitHub para torná-lo somente leitura.

## Credenciais sem finalidade

Os secrets do GitHub relacionados a deploy, Sentry e chaves públicas de build
foram removidos. As credenciais que existiam apenas no `.env` de produção foram
eliminadas com o diretório do domínio. A chave SSH de deploy foi revogada na
VPS. O token Sentry deve ser revogado também no próprio Sentry, pois apagar sua
cópia do GitHub não invalida o token no provedor.
