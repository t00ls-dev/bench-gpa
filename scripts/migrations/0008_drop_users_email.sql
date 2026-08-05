-- Remove users.email: último passo da migração para username/matrícula
-- (PR 1 adicionou as colunas novas e migrou os dados reais em produção via
-- scripts/migrate-users-to-username.ts; PR 2 trocou todo o código de auth
-- para não depender mais de e-mail). Rodada só depois de confirmar
-- estabilidade em produção com o modelo novo.
--
-- DROP COLUMN IF EXISTS: no-op em instalação nova, já que o baseline
-- (migrate-schema.sql) não cria mais essa coluna desde o PR 1.
ALTER TABLE users
  DROP COLUMN IF EXISTS email;
