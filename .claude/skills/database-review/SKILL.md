---
name: database-review
description: Checklist de banco de dados do Bench GPA (MariaDB, migrações, transações, retenção). Use ao alterar schema, escrever uma migração nova, ou revisar uma stored procedure/trigger.
---

# Revisão de banco de dados

## Objetivo

Toda alteração de schema em produção precisa ser segura de reaplicar e
reversível de investigar — este projeto não tem um ORM com migração
automática, então a disciplina manual é o que evita corromper dados reais.

## Quando usar

- Alterar uma tabela, índice, view, stored procedure ou trigger existente
- Escrever uma migração nova
- Revisar uma query que roda como job/cron

## O que checar

### Fonte da verdade

- `scripts/migrate-schema.sql` é o schema completo, aplicado do zero em
  ambiente de teste/CI. Migrações incrementais reais vivem em
  `scripts/migrations/NNNN_descricao.sql`, numeradas e aplicadas por
  `scripts/run-migrations.sh`.
- CI (`schema-check` em `.github/workflows/ci.yml`) sobe um MariaDB 11.4
  real, roda `run-migrations.sh` duas vezes seguidas e confere
  idempotência via grep — uma migração que quebra ao rodar de novo
  (`CREATE TABLE` sem `IF NOT EXISTS`, `ALTER TABLE ADD COLUMN` sem
  checagem) falha esse job. Toda migração nova precisa ser escrita para
  rodar duas vezes sem erro.

### Transações e stored procedures

- Procedures que fazem múltiplas escritas (`refresh_product_universe`,
  `purge_old_aggs`) usam `START TRANSACTION`/`COMMIT` com
  `EXIT HANDLER FOR SQLEXCEPTION` fazendo `ROLLBACK` — uma procedure nova
  que escreve em mais de uma tabela deveria seguir o mesmo padrão, para
  não deixar dado parcial se falhar no meio.

### Retenção

- Agregados são purgados após `RETENTION_DAYS` (`src/lib/retention.ts`,
  hoje 180 dias) via cron diário (`purge_old_aggs`, 03h). O import
  automático usa o **mesmo** horizonte — mudar um sem o outro reabre o
  loop importar→purgar→reimportar que a constante única foi feita para
  evitar.

### Índices

- Remover um índice não usado é uma otimização legítima (já aconteceu:
  `0004_drop_indices_categoria_sales_prod_daily_agg.sql`) — não assuma
  que mais índice é sempre melhor; cada um custa em toda escrita.
- Antes de propor um índice novo, confirme com `EXPLAIN` que a query
  realmente faz table scan — não adicione especulativamente.

### Portabilidade

- O projeto roda em MariaDB especificamente (não SQL genérico) — sintaxe
  já usada (ex.: `ON DUPLICATE KEY UPDATE`) não é portável para Postgres
  sem reescrita. Se portabilidade para Postgres virar requisito real, é
  decisão de arquitetura (ver skill `architecture-review`), não algo para
  assumir silenciosamente numa migração pontual.

## Checklist

- [ ] Migração nova é idempotente (roda duas vezes sem erro)
- [ ] Escrita múltipla em procedure está dentro de transação com rollback
- [ ] Índice novo tem `EXPLAIN` comprovando necessidade
- [ ] Mudança de retenção/horizonte atualiza import e purge junto
- [ ] `bash scripts/run-migrations.sh` testado localmente antes do commit
