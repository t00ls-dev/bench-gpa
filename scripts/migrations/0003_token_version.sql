-- Adiciona users.token_version: o contador que permite invalidar sessões já
-- emitidas.
--
-- O JWT é stateless e vale 7 dias (JWT_EXPIRY). Até aqui, redefinir a senha de
-- uma conta comprometida NÃO derrubava quem já estava logado com ela — o token
-- antigo continuava sendo aceito por até uma semana. Inativar a conta
-- funcionava, porque o requireAuth relê `is_active` do banco a cada request; a
-- senha era o único vetor sem essa rede.
--
-- Com a coluna, o token carrega a versão vigente no momento da emissão e o
-- requireAuth/getMe comparam com a do banco. resetPassword incrementa, e todo
-- token emitido antes deixa de valer no request seguinte.
--
-- DEFAULT 0 é o que torna a transição indolor: os tokens já em circulação não
-- têm o campo no payload, e o código lê `payload.tokenVersion ?? 0` — logo
-- continuam válidos até expirar naturalmente, sem deslogar ninguém no deploy.
-- O primeiro resetPassword de cada usuário leva a coluna para 1 e aí sim
-- invalida tudo que é anterior.
--
-- Não é idempotente (MariaDB não tem ADD COLUMN IF NOT EXISTS); o runner
-- garante execução única via schema_migrations. A tabela users tem poucas
-- linhas, então o custo do ALTER é irrelevante.

ALTER TABLE users
  ADD COLUMN token_version INT NOT NULL DEFAULT 0 AFTER is_active;
