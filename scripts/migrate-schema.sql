-- =============================================
-- Bench GPA: Schema + Stored Procedures (MariaDB 11.4)
-- =============================================

DROP PROCEDURE IF EXISTS dashboard_metrics;
DROP PROCEDURE IF EXISTS dashboard_rankings;
DROP PROCEDURE IF EXISTS filter_options;
DROP PROCEDURE IF EXISTS area_analysis;
DROP PROCEDURE IF EXISTS area_filter_hierarchy;
DROP PROCEDURE IF EXISTS product_search;
DROP PROCEDURE IF EXISTS get_product_by_code;
DROP PROCEDURE IF EXISTS product_analysis;
DROP PROCEDURE IF EXISTS upsert_products_bulk;
DROP PROCEDURE IF EXISTS finalize_import;
DROP PROCEDURE IF EXISTS imported_dates;
DROP PROCEDURE IF EXISTS purge_old_aggs;
DROP PROCEDURE IF EXISTS db_health_check;
DROP PROCEDURE IF EXISTS refresh_filter_hierarchy;
DROP PROCEDURE IF EXISTS refresh_product_universe;
DROP PROCEDURE IF EXISTS has_role;

-- =============================================
-- TABLES
-- =============================================

-- Sem FOREIGN KEY em nenhuma tabela: decisão deliberada, não esquecimento.
-- staging_sales/sales_daily_agg/sales_prod_daily_agg/products são reescritas
-- em bulk (upsert_products_bulk, finalize_import, refresh_product_universe,
-- purge_old_aggs fazem INSERT...ON DUPLICATE KEY e DELETE de milhares de
-- linhas de uma vez); FK forçaria checagem referencial linha a linha nesses
-- caminhos, sem ganho real: a integridade de prod_code/store_code já é
-- garantida pelo próprio pipeline de import (staging → agregação na mesma
-- transação), não por constraint de banco.

-- token_version: contador que invalida sessões já emitidas. O JWT é stateless e
-- vale 7 dias, então sem isto redefinir a senha de uma conta comprometida não
-- derrubava quem já estava logado. O token carrega a versão vigente na emissão;
-- requireAuth/getMe comparam com a do banco e resetPassword incrementa.
-- Ver migrations/0003_token_version.sql.
--
-- username/employee_id NULL UNIQUE: nullable só para acomodar usuários
-- legados migrados do modelo por e-mail, que podem ter só um dos dois
-- definido até o admin completar o outro (ver
-- migrations/0006_users_username_matricula.sql). employee_id nasceu como
-- `matricula` nessa migration e foi renomeado em
-- migrations/0009_users_employee_id.sql +
-- migrations/0010_drop_users_matricula.sql (padronização de nomenclatura,
-- 2026-08-05). Cadastro de usuário novo pelo admin exige os dois via Zod
-- (UsernameSchema/EmployeeIdSchema em schemas.ts), não via NOT NULL do
-- banco.
--
-- password NULL: conta criada sem senha (primeiro acesso) ou zerada por reset
-- de admin. password_changed_at NULL ou mais velha que 30 dias força troca no
-- próximo login (ver passwordChangeRequired em session.ts). Ambos os campos
-- tratam NULL como "precisa agir" (fail-safe), nunca como "está tudo certo".
CREATE TABLE IF NOT EXISTS users (
  id            VARCHAR(36) PRIMARY KEY,
  username      VARCHAR(60) NULL UNIQUE,
  employee_id   VARCHAR(30) NULL UNIQUE,
  name          VARCHAR(255) NOT NULL,
  password      VARCHAR(255) NULL,
  role          ENUM('admin','user') NOT NULL DEFAULT 'user',
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  token_version INT NOT NULL DEFAULT 0,
  password_changed_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_role (role),
  INDEX idx_users_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS stores (
  store_code VARCHAR(20) PRIMARY KEY,
  store_name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS products (
  prod_code VARCHAR(20) NOT NULL,
  prod_name VARCHAR(255) NOT NULL,
  sale_date DATE NOT NULL,
  PRIMARY KEY (prod_code, sale_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS staging_sales (
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  sale_date    DATE NOT NULL,
  batch_id     VARCHAR(36) NOT NULL,
  store_code   VARCHAR(20) NOT NULL,
  store_name   VARCHAR(255),
  prod_code    VARCHAR(20) NOT NULL,
  prod_name    VARCHAR(255),
  depto        VARCHAR(100),
  secao        VARCHAR(100),
  grupo        VARCHAR(100),
  subgrupo     VARCHAR(100),
  val_vda      DECIMAL(15,2) NOT NULL DEFAULT 0,
  INDEX idx_staging_batch (batch_id),
  INDEX idx_staging_sale_date (sale_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- VAL_VDA é a ÚNICA medida que existe. Não procure quantidade, custo,
-- devolução ou margem: o export do GPA não traz nada disso.
--
-- Verificado em 2026-07-23 nas 68 planilhas de data/ (maio a julho/2026), todas
-- com 24 colunas e o mesmo cabeçalho:
--
--   NOM_DEPTO | NOM_SECAO | NOM_GRUPO | NOM_SUBGRUPO | NOM_PROD | VAL_VDA ×N lojas | Total
--
-- Estas tabelas carregavam qty_vda, val_cus, val_dev, val_sld e per_mrg (e mais
-- sete variantes no staging), todas estruturalmente zero por falta de fonte.
-- Removidas na migration 0002. Se um dia o export passar a trazer as medidas,
-- reintroduza as colunas junto com o parser que as preenche, e não antes.
CREATE TABLE IF NOT EXISTS sales_daily_agg (
  sale_date   DATE NOT NULL,
  store_code  VARCHAR(20) NOT NULL,
  val_vda     DECIMAL(15,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (sale_date, store_code),
  INDEX idx_daily_sale_date (sale_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sem índice em depto/secao/grupo/subgrupo de propósito: nenhuma proc de
-- análise se beneficia deles (filtrar por qualquer um custava mais que não
-- filtrar, já que o plano de acesso real é sempre a varredura por sale_date). Os 4
-- juntos chegaram a ocupar 532,81 MB, 74,7% do índice da tabela. Removidos em
-- produção e medidos em 2026-07-30 (ver scripts/migrations/0004_drop_indices_
-- categoria_sales_prod_daily_agg.sql e docs/medicao-performance.md): hash
-- idêntico nas procs, sem regressão de leitura. Não recrie sem medir de novo.
CREATE TABLE IF NOT EXISTS sales_prod_daily_agg (
  sale_date   DATE NOT NULL,
  store_code  VARCHAR(20) NOT NULL,
  prod_code   VARCHAR(20) NOT NULL,
  prod_name   VARCHAR(255),
  depto       VARCHAR(100),
  secao       VARCHAR(100),
  grupo       VARCHAR(100),
  subgrupo    VARCHAR(100),
  val_vda     DECIMAL(15,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (sale_date, store_code, prod_code),
  INDEX idx_prod_daily_prod_code (prod_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS import_log (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  sale_date   DATE NOT NULL UNIQUE,
  row_count   INT NOT NULL DEFAULT 0,
  imported_by VARCHAR(36),
  imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  batch_id    VARCHAR(36) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS filter_hierarchy (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  store_code  VARCHAR(20) NOT NULL,
  store_name  VARCHAR(255) NOT NULL,
  depto       VARCHAR(100),
  secao       VARCHAR(100),
  grupo       VARCHAR(100),
  subgrupo    VARCHAR(100),
  INDEX idx_filter_store (store_code),
  INDEX idx_filter_depto (depto),
  INDEX idx_filter_secao (secao),
  INDEX idx_filter_grupo (grupo),
  INDEX idx_filter_subgrupo (subgrupo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Universo de PLUs: uma linha por (prod_code, store_code) que JÁ vendeu alguma
-- vez dentro da janela de retenção, com a categoria e o nome da venda mais
-- recente, mais a data dessa venda.
--
-- Derivada de sales_prod_daily_agg (como a filter_hierarchy), regenerada por
-- refresh_product_universe() num cron diário (scripts/refresh-universe.ts),
-- não mais ao fim de cada import/purge (ver comentário em finalize_import
-- sobre por quê, item 5 de docs/continuar.md).
--
-- Existe por performance. O KPI "PLUs sem venda" precisa comparar o período
-- contra todo o histórico; fazer isso direto no sales_prod_daily_agg custa um
-- COUNT(DISTINCT) sobre ~3,4M linhas: medido em 4,6s contra 0,4s da consulta
-- só do período, numa tela que não tem cache. Aqui são ~176k linhas.
CREATE TABLE IF NOT EXISTS product_universe (
  prod_code      VARCHAR(20)  NOT NULL,
  store_code     VARCHAR(20)  NOT NULL,
  prod_name      VARCHAR(255),
  depto          VARCHAR(100),
  secao          VARCHAR(100),
  grupo          VARCHAR(100),
  subgrupo       VARCHAR(100),
  last_sale_date DATE NOT NULL,
  PRIMARY KEY (prod_code, store_code),
  INDEX idx_pu_store (store_code),
  INDEX idx_pu_depto (depto),
  INDEX idx_pu_secao (secao),
  INDEX idx_pu_grupo (grupo),
  INDEX idx_pu_subgrupo (subgrupo),
  INDEX idx_pu_last_sale (last_sale_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Trilha de auditoria: ações sensíveis de auth e admin.
-- actor_username é desnormalizado de propósito: o registro precisa sobreviver
-- mesmo se o usuário for removido depois.
CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actor_id    VARCHAR(36),
  actor_username VARCHAR(60),
  action      VARCHAR(60) NOT NULL,
  target_type VARCHAR(40),
  target_id   VARCHAR(255),
  detail      VARCHAR(500),
  ip          VARCHAR(45),
  INDEX idx_audit_created (created_at),
  INDEX idx_audit_actor (actor_id),
  INDEX idx_audit_action (action)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Heartbeat das crons: cada job faz upsert do seu último run para o
-- painel admin mostrar se está rodando no prazo.
CREATE TABLE IF NOT EXISTS cron_heartbeat (
  job              VARCHAR(40) PRIMARY KEY,
  last_run_at      TIMESTAMP NULL DEFAULT NULL,
  last_status      ENUM('ok','fail'),
  last_detail      VARCHAR(500),
  last_duration_ms INT,
  updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- STORED PROCEDURES
-- =============================================

DELIMITER //

-- 1/16: dashboard_metrics
CREATE PROCEDURE dashboard_metrics(
  p_date_from DATE,
  p_date_to DATE,
  p_stores JSON,
  p_deptos JSON,
  p_secoes JSON,
  p_grupos JSON,
  p_subgrupos JSON
)
BEGIN
  DROP TEMPORARY TABLE IF EXISTS tmp_filters;
  CREATE TEMPORARY TABLE tmp_filters (
    store_code VARCHAR(20),
    depto VARCHAR(100),
    secao VARCHAR(100),
    grupo VARCHAR(100),
    subgrupo VARCHAR(100)
  ) ENGINE=MEMORY;

  IF JSON_LENGTH(p_stores) > 0 THEN
    INSERT INTO tmp_filters (store_code)
    SELECT DISTINCT value FROM JSON_TABLE(p_stores, '$[*]' COLUMNS (value VARCHAR(20) PATH '$')) AS j;
  END IF;
  IF JSON_LENGTH(p_deptos) > 0 THEN
    INSERT INTO tmp_filters (depto)
    SELECT DISTINCT value FROM JSON_TABLE(p_deptos, '$[*]' COLUMNS (value VARCHAR(100) PATH '$')) AS j;
  END IF;
  IF JSON_LENGTH(p_secoes) > 0 THEN
    INSERT INTO tmp_filters (secao)
    SELECT DISTINCT value FROM JSON_TABLE(p_secoes, '$[*]' COLUMNS (value VARCHAR(100) PATH '$')) AS j;
  END IF;
  IF JSON_LENGTH(p_grupos) > 0 THEN
    INSERT INTO tmp_filters (grupo)
    SELECT DISTINCT value FROM JSON_TABLE(p_grupos, '$[*]' COLUMNS (value VARCHAR(100) PATH '$')) AS j;
  END IF;
  IF JSON_LENGTH(p_subgrupos) > 0 THEN
    INSERT INTO tmp_filters (subgrupo)
    SELECT DISTINCT value FROM JSON_TABLE(p_subgrupos, '$[*]' COLUMNS (value VARCHAR(100) PATH '$')) AS j;
  END IF;

  -- UMA varredura de sales_prod_daily_agg, não quatro.
  --
  -- Os quatro result sets precisam de três grãos: sale_date (byDate), store_code
  -- (byStore) e depto (byDepto); o total é a soma de tudo. Antes cada um saía da
  -- sua própria varredura da tabela inteira: os mesmos ~1,4M linhas relidos
  -- quatro vezes para agrupar por uma coluna diferente. Medido em prod
  -- (docs/medicao-performance.md): 46,3s numa janela de 28 dias, a proc mais cara
  -- do sistema.
  --
  -- O grão comum (sale_date, store_code, depto) colapsa esses ~1,4M linhas em
  -- poucos milhares: 56 datas x ~10 lojas x ~20 departamentos. Somar de novo a
  -- partir dele dá exatamente o mesmo número: SUM é associativo, e nenhum dos
  -- quatro result sets precisa de grão mais fino que este. Se um dia algum
  -- precisar (por seção, por produto), o grão da temporária tem de crescer junto,
  -- ou o número sai errado sem nada acusar.
  --
  -- CREATE ... AS SELECT de propósito, em vez de tabela declarada: preserva o
  -- tipo que o SUM produz, sem risco de truncar num DECIMAL escolhido a mão.
  DROP TEMPORARY TABLE IF EXISTS tmp_period;
  CREATE TEMPORARY TABLE tmp_period ENGINE=InnoDB AS
  SELECT a.sale_date, a.store_code, a.depto, SUM(a.val_vda) AS val
  FROM sales_prod_daily_agg a
  WHERE (p_date_from IS NULL OR a.sale_date >= p_date_from)
    AND (p_date_to IS NULL OR a.sale_date <= p_date_to)
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.store_code IS NOT NULL)
      OR a.store_code IN (SELECT t.store_code FROM tmp_filters t WHERE t.store_code IS NOT NULL))
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.depto IS NOT NULL)
      OR a.depto IN (SELECT t.depto FROM tmp_filters t WHERE t.depto IS NOT NULL))
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.secao IS NOT NULL)
      OR a.secao IN (SELECT t.secao FROM tmp_filters t WHERE t.secao IS NOT NULL))
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.grupo IS NOT NULL)
      OR a.grupo IN (SELECT t.grupo FROM tmp_filters t WHERE t.grupo IS NOT NULL))
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.subgrupo IS NOT NULL)
      OR a.subgrupo IN (SELECT t.subgrupo FROM tmp_filters t WHERE t.subgrupo IS NOT NULL))
  GROUP BY a.sale_date, a.store_code, a.depto;

  -- Result set 1: aggregates
  -- Só `total` é lido (callMetrics, em src/lib/api-types.ts). Este SELECT também
  -- calculava total_plus/plus_with_sale/plus_without_sale, que o TypeScript
  -- descartava: três COUNT(DISTINCT prod_code) sobre a janela filtrada de
  -- sales_prod_daily_agg a cada chamada, sem nenhum leitor. Os KPIs equivalentes
  -- que existem de verdade ficam em area_analysis, que os entrega para a tela de
  -- área. Não confundir os dois.
  SELECT COALESCE(SUM(val), 0) AS total FROM tmp_period;

  -- Result set 2: byStore
  -- store_name é dependente funcional de store_code, então juntar depois de
  -- agregar dá o mesmo que juntar antes, e junta contra alguns milhares de
  -- linhas em vez de milhões.
  SELECT p.store_code AS code, s.store_name AS name, SUM(p.val) AS val
  FROM tmp_period p
  LEFT JOIN stores s ON s.store_code = p.store_code
  GROUP BY p.store_code, s.store_name
  ORDER BY val DESC;

  -- Result set 3: byDepto
  -- O IS NOT NULL passou para o rollup. Dá o mesmo conjunto: depto faz parte da
  -- chave do grão, então descartar o grupo NULL aqui é idêntico a ter descartado
  -- as linhas antes de agrupar.
  SELECT p.depto AS name, SUM(p.val) AS val
  FROM tmp_period p
  WHERE p.depto IS NOT NULL
  GROUP BY p.depto
  ORDER BY val DESC;

  -- Result set 4: byDate
  SELECT p.sale_date AS date, SUM(p.val) AS val
  FROM tmp_period p
  GROUP BY p.sale_date
  ORDER BY p.sale_date;

  DROP TEMPORARY TABLE IF EXISTS tmp_period;
  DROP TEMPORARY TABLE IF EXISTS tmp_filters;
END//

-- 2/16: dashboard_rankings
CREATE PROCEDURE dashboard_rankings(
  p_date_from DATE,
  p_date_to DATE,
  p_stores JSON,
  p_deptos JSON,
  p_secoes JSON,
  p_grupos JSON,
  p_subgrupos JSON,
  p_limit INT
)
BEGIN
  DROP TEMPORARY TABLE IF EXISTS tmp_filters;
  CREATE TEMPORARY TABLE tmp_filters (
    store_code VARCHAR(20),
    depto VARCHAR(100),
    secao VARCHAR(100),
    grupo VARCHAR(100),
    subgrupo VARCHAR(100)
  ) ENGINE=MEMORY;

  IF JSON_LENGTH(p_stores) > 0 THEN
    INSERT INTO tmp_filters (store_code)
    SELECT DISTINCT value FROM JSON_TABLE(p_stores, '$[*]' COLUMNS (value VARCHAR(20) PATH '$')) AS j;
  END IF;
  IF JSON_LENGTH(p_deptos) > 0 THEN
    INSERT INTO tmp_filters (depto)
    SELECT DISTINCT value FROM JSON_TABLE(p_deptos, '$[*]' COLUMNS (value VARCHAR(100) PATH '$')) AS j;
  END IF;
  IF JSON_LENGTH(p_secoes) > 0 THEN
    INSERT INTO tmp_filters (secao)
    SELECT DISTINCT value FROM JSON_TABLE(p_secoes, '$[*]' COLUMNS (value VARCHAR(100) PATH '$')) AS j;
  END IF;
  IF JSON_LENGTH(p_grupos) > 0 THEN
    INSERT INTO tmp_filters (grupo)
    SELECT DISTINCT value FROM JSON_TABLE(p_grupos, '$[*]' COLUMNS (value VARCHAR(100) PATH '$')) AS j;
  END IF;
  IF JSON_LENGTH(p_subgrupos) > 0 THEN
    INSERT INTO tmp_filters (subgrupo)
    SELECT DISTINCT value FROM JSON_TABLE(p_subgrupos, '$[*]' COLUMNS (value VARCHAR(100) PATH '$')) AS j;
  END IF;

  SET @limit_val = COALESCE(p_limit, 10);

  -- UMA varredura de sales_prod_daily_agg, não cinco.
  --
  -- Os cinco rankings são cinco agrupamentos diferentes do MESMO recorte: depto,
  -- seção, grupo, subgrupo e produto. Antes cada um relia a tabela inteira para
  -- agrupar por uma coluna. Medido em prod (docs/medicao-performance.md): 32,4s
  -- numa janela de 28 dias.
  --
  -- O grão fino (as quatro categorias + produto) é o menor grão que serve os
  -- cinco: agrupar por ele e somar de novo dá exatamente o mesmo total, porque
  -- SUM é associativo e cada coluna de ranking é uma projeção desta chave.
  -- Verificado em prod: o hash do resultado é idêntico ao da versão anterior.
  --
  -- Medido: 30,7s -> 17,8s (-42%). NÃO são os 80% que "cinco varreduras viram
  -- uma" sugere, e a razão importa para quem for mexer nisto depois: materializar
  -- a temporária custa caro por si só (~1,4M linhas colapsando em ~100k grupos,
  -- escritos em disco). Uma variante com DUAS temporárias mais baratas (uma no
  -- grão de categoria, outra no de produto) foi medida e ficou em 31,8s, ou
  -- seja, igual ao original: o preço da materialização é por temporária, não por
  -- linha lida. Uma só compensa; duas não.
  DROP TEMPORARY TABLE IF EXISTS tmp_period;
  CREATE TEMPORARY TABLE tmp_period ENGINE=InnoDB AS
  SELECT a.depto, a.secao, a.grupo, a.subgrupo, a.prod_code, a.prod_name,
         SUM(a.val_vda) AS v
  FROM sales_prod_daily_agg a
  WHERE (p_date_from IS NULL OR a.sale_date >= p_date_from)
    AND (p_date_to IS NULL OR a.sale_date <= p_date_to)
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.store_code IS NOT NULL) OR a.store_code IN (SELECT t.store_code FROM tmp_filters t WHERE t.store_code IS NOT NULL))
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.depto IS NOT NULL) OR a.depto IN (SELECT t.depto FROM tmp_filters t WHERE t.depto IS NOT NULL))
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.secao IS NOT NULL) OR a.secao IN (SELECT t.secao FROM tmp_filters t WHERE t.secao IS NOT NULL))
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.grupo IS NOT NULL) OR a.grupo IN (SELECT t.grupo FROM tmp_filters t WHERE t.grupo IS NOT NULL))
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.subgrupo IS NOT NULL) OR a.subgrupo IN (SELECT t.subgrupo FROM tmp_filters t WHERE t.subgrupo IS NOT NULL))
  GROUP BY a.depto, a.secao, a.grupo, a.subgrupo, a.prod_code, a.prod_name;

  -- A coluna da temporária chama-se `v`, não `val`: os rollups devolvem
  -- `SUM(v) AS val` e ordenam por `val`. Se a coluna também se chamasse `val`, o
  -- ORDER BY teria duas resoluções possíveis: o servidor prefere o alias, mas
  -- não é o tipo de detalhe que deva estar sustentando a ordenação de um ranking.
  --
  -- O PREPARE fica por causa do LIMIT ?, que é a razão de ele existir aqui: as
  -- datas não são mais placeholders, já foram aplicadas na varredura acima.

  -- byDepto
  PREPARE stmt FROM 'SELECT depto AS name, SUM(v) AS val
    FROM tmp_period WHERE depto IS NOT NULL
    GROUP BY depto ORDER BY val DESC LIMIT ?';
  EXECUTE stmt USING @limit_val;
  DEALLOCATE PREPARE stmt;

  -- bySecao
  PREPARE stmt FROM 'SELECT secao AS name, SUM(v) AS val
    FROM tmp_period WHERE secao IS NOT NULL
    GROUP BY secao ORDER BY val DESC LIMIT ?';
  EXECUTE stmt USING @limit_val;
  DEALLOCATE PREPARE stmt;

  -- byGrupo
  PREPARE stmt FROM 'SELECT grupo AS name, SUM(v) AS val
    FROM tmp_period WHERE grupo IS NOT NULL
    GROUP BY grupo ORDER BY val DESC LIMIT ?';
  EXECUTE stmt USING @limit_val;
  DEALLOCATE PREPARE stmt;

  -- bySubgrupo
  PREPARE stmt FROM 'SELECT subgrupo AS name, SUM(v) AS val
    FROM tmp_period WHERE subgrupo IS NOT NULL
    GROUP BY subgrupo ORDER BY val DESC LIMIT ?';
  EXECUTE stmt USING @limit_val;
  DEALLOCATE PREPARE stmt;

  -- byProduto
  PREPARE stmt FROM 'SELECT prod_code AS code, prod_name AS name, SUM(v) AS val
    FROM tmp_period
    GROUP BY prod_code, prod_name ORDER BY val DESC LIMIT ?';
  EXECUTE stmt USING @limit_val;
  DEALLOCATE PREPARE stmt;

  DROP TEMPORARY TABLE IF EXISTS tmp_period;
  DROP TEMPORARY TABLE IF EXISTS tmp_filters;
END//

-- 3/16: filter_options (uses filter_hierarchy, 21k rows instead of 942k)
CREATE PROCEDURE filter_options(
  p_date_from DATE,
  p_date_to DATE,
  p_stores JSON,
  p_deptos JSON,
  p_secoes JSON,
  p_grupos JSON
)
BEGIN
  DECLARE v_has_store, v_has_depto, v_has_secao, v_has_grupo INT DEFAULT 0;

  DROP TEMPORARY TABLE IF EXISTS tmp_filters;
  CREATE TEMPORARY TABLE tmp_filters (
    store_code VARCHAR(20),
    depto VARCHAR(100),
    secao VARCHAR(100),
    grupo VARCHAR(100)
  ) ENGINE=MEMORY;

  IF JSON_LENGTH(p_stores) > 0 THEN
    INSERT INTO tmp_filters (store_code)
    SELECT DISTINCT value FROM JSON_TABLE(p_stores, '$[*]' COLUMNS (value VARCHAR(20) PATH '$')) AS j;
  END IF;
  IF JSON_LENGTH(p_deptos) > 0 THEN
    INSERT INTO tmp_filters (depto)
    SELECT DISTINCT value FROM JSON_TABLE(p_deptos, '$[*]' COLUMNS (value VARCHAR(100) PATH '$')) AS j;
  END IF;
  IF JSON_LENGTH(p_secoes) > 0 THEN
    INSERT INTO tmp_filters (secao)
    SELECT DISTINCT value FROM JSON_TABLE(p_secoes, '$[*]' COLUMNS (value VARCHAR(100) PATH '$')) AS j;
  END IF;
  IF JSON_LENGTH(p_grupos) > 0 THEN
    INSERT INTO tmp_filters (grupo)
    SELECT DISTINCT value FROM JSON_TABLE(p_grupos, '$[*]' COLUMNS (value VARCHAR(100) PATH '$')) AS j;
  END IF;

  SELECT
    IFNULL(MAX(store_code IS NOT NULL), 0),
    IFNULL(MAX(depto IS NOT NULL), 0),
    IFNULL(MAX(secao IS NOT NULL), 0),
    IFNULL(MAX(grupo IS NOT NULL), 0)
  INTO v_has_store, v_has_depto, v_has_secao, v_has_grupo
  FROM tmp_filters;

  SELECT MAX(sale_date) AS latest_date FROM import_log;

  -- All queries use filter_hierarchy (21k rows): no date filtering on options
  --
  -- Cascata só de cima pra baixo (Loja > Departamento > Seção > Grupo >
  -- Subgrupo), nunca o inverso: cada nível filtra só pelos níveis ACIMA dele,
  -- nunca pelos abaixo. Antes disso, um nível de baixo (ex: Grupo) também
  -- estreitava as opções do nível de cima (ex: Departamento) — o que parecia
  -- inofensivo, mas colapsava `opts.deptos` pro próprio subconjunto já
  -- selecionado e disparava um falso allSelected no MultiSelect (o filtro
  -- virava "Todos" sozinho sem o usuário nunca ter clicado "Selecionar
  -- todos", ver src/components/multi-select.tsx). Área já seguia essa mesma
  -- regra desde sempre (computeAreaCascadeOptions em src/lib/filter-cascade.ts),
  -- por isso nunca teve esse bug.
  --
  -- Stores: raiz da cascata, não filtra por nada.
  SELECT DISTINCT f.store_code, COALESCE(s.store_name, f.store_code) AS store_name
  FROM filter_hierarchy f
  LEFT JOIN stores s ON s.store_code = f.store_code
  ORDER BY f.store_code;

  -- Deptos: filtra só por store (único nível acima dele).
  SELECT DISTINCT f.depto
  FROM filter_hierarchy f
  WHERE f.depto IS NOT NULL
    AND (v_has_store = 0 OR f.store_code IN (SELECT t.store_code FROM tmp_filters t WHERE t.store_code IS NOT NULL))
  ORDER BY f.depto;

  -- Secoes: filtra por store/depto (níveis acima dele).
  SELECT DISTINCT f.secao
  FROM filter_hierarchy f
  WHERE f.secao IS NOT NULL
    AND (v_has_store = 0 OR f.store_code IN (SELECT t.store_code FROM tmp_filters t WHERE t.store_code IS NOT NULL))
    AND (v_has_depto = 0 OR f.depto IN (SELECT t.depto FROM tmp_filters t WHERE t.depto IS NOT NULL))
  ORDER BY f.secao;

  -- Grupos: filter by store/depto/secao selections
  SELECT DISTINCT f.grupo
  FROM filter_hierarchy f
  WHERE f.grupo IS NOT NULL
    AND (v_has_store = 0 OR f.store_code IN (SELECT t.store_code FROM tmp_filters t WHERE t.store_code IS NOT NULL))
    AND (v_has_depto = 0 OR f.depto IN (SELECT t.depto FROM tmp_filters t WHERE t.depto IS NOT NULL))
    AND (v_has_secao = 0 OR f.secao IN (SELECT t.secao FROM tmp_filters t WHERE t.secao IS NOT NULL))
  ORDER BY f.grupo;

  -- Subgrupos: filter by all higher-level selections
  SELECT DISTINCT f.subgrupo
  FROM filter_hierarchy f
  WHERE f.subgrupo IS NOT NULL
    AND (v_has_store = 0 OR f.store_code IN (SELECT t.store_code FROM tmp_filters t WHERE t.store_code IS NOT NULL))
    AND (v_has_depto = 0 OR f.depto IN (SELECT t.depto FROM tmp_filters t WHERE t.depto IS NOT NULL))
    AND (v_has_secao = 0 OR f.secao IN (SELECT t.secao FROM tmp_filters t WHERE t.secao IS NOT NULL))
    AND (v_has_grupo = 0 OR f.grupo IN (SELECT t.grupo FROM tmp_filters t WHERE t.grupo IS NOT NULL))
  ORDER BY f.subgrupo;

  SELECT DISTINCT sale_date FROM import_log ORDER BY sale_date ASC;

  DROP TEMPORARY TABLE IF EXISTS tmp_filters;
END//

-- 4/16: area_analysis
--
-- NÃO reescrever esta proc no modelo de "uma varredura + temporária" sem medir a
-- proc inteira. Já foi tentado (PR #9) e REGREDIU em produção: 23,0s -> 30,6s na
-- janela de 28 dias, revertido no PR seguinte. O experimento que aprovou a
-- mudança replicou a consulta sem os cinco predicados NOT EXISTS/OR de filtro:
-- eles são baratos numa subquery derivada e caros como condição de um
-- CREATE TEMPORARY TABLE ... AS SELECT. Ver docs/medicao-performance.md.
--
-- O mesmo modelo FUNCIONOU em dashboard_metrics (46,3s -> 10,1s) e
-- dashboard_rankings (32,4s -> 19,0s), que não fazem o LEFT JOIN contra a
-- product_universe. A diferença está aí, não na ideia.
CREATE PROCEDURE area_analysis(
  p_date_from DATE,
  p_date_to DATE,
  p_stores JSON,
  p_deptos JSON,
  p_secoes JSON,
  p_grupos JSON,
  p_subgrupos JSON,
  p_page INT,
  p_page_size INT,
  p_search VARCHAR(255),
  p_sort_by VARCHAR(50),
  p_sort_dir VARCHAR(10)
)
BEGIN
  DECLARE v_offset INT DEFAULT 0;
  DECLARE v_limit INT DEFAULT 20;
  DECLARE v_total DECIMAL(18,2) DEFAULT 0;
  DECLARE v_with_sale INT DEFAULT 0;
  DECLARE v_universe INT DEFAULT 0;

  DROP TEMPORARY TABLE IF EXISTS tmp_filters;
  CREATE TEMPORARY TABLE tmp_filters (
    store_code VARCHAR(20),
    depto VARCHAR(100),
    secao VARCHAR(100),
    grupo VARCHAR(100),
    subgrupo VARCHAR(100)
  ) ENGINE=MEMORY;

  IF JSON_LENGTH(p_stores) > 0 THEN
    INSERT INTO tmp_filters (store_code) SELECT DISTINCT value FROM JSON_TABLE(p_stores, '$[*]' COLUMNS (value VARCHAR(20) PATH '$')) AS j;
  END IF;
  IF JSON_LENGTH(p_deptos) > 0 THEN
    INSERT INTO tmp_filters (depto) SELECT DISTINCT value FROM JSON_TABLE(p_deptos, '$[*]' COLUMNS (value VARCHAR(100) PATH '$')) AS j;
  END IF;
  IF JSON_LENGTH(p_secoes) > 0 THEN
    INSERT INTO tmp_filters (secao) SELECT DISTINCT value FROM JSON_TABLE(p_secoes, '$[*]' COLUMNS (value VARCHAR(100) PATH '$')) AS j;
  END IF;
  IF JSON_LENGTH(p_grupos) > 0 THEN
    INSERT INTO tmp_filters (grupo) SELECT DISTINCT value FROM JSON_TABLE(p_grupos, '$[*]' COLUMNS (value VARCHAR(100) PATH '$')) AS j;
  END IF;
  IF JSON_LENGTH(p_subgrupos) > 0 THEN
    INSERT INTO tmp_filters (subgrupo) SELECT DISTINCT value FROM JSON_TABLE(p_subgrupos, '$[*]' COLUMNS (value VARCHAR(100) PATH '$')) AS j;
  END IF;

  IF p_page IS NOT NULL AND p_page_size IS NOT NULL THEN
    SET v_offset = (p_page - 1) * p_page_size;
    SET v_limit = p_page_size;
  END IF;

  -- Result set 1: aggregate KPIs
  --
  -- Venda e "PLUs com venda" saem do PERÍODO; o universo sai da
  -- product_universe, que não tem recorte de data: é todo PLU que já vendeu
  -- dentro da retenção, sob os mesmos filtros de loja/categoria.
  --
  -- Antes as três contagens saíam da mesma varredura do período, e como o
  -- parser descarta linha de valor zero (xlsx-parser.ts), nunca existia linha
  -- com val_vda = 0: "PLUs sem venda" dava 0 sempre e "PLUs (área)" repetia
  -- "PLUs com venda". Medido em prod: 339.007 linhas no período, ZERO com
  -- val_vda <= 0.
  SELECT COALESCE(SUM(a.val_vda), 0), COUNT(DISTINCT a.prod_code)
    INTO v_total, v_with_sale
  FROM sales_prod_daily_agg a
  WHERE (p_date_from IS NULL OR a.sale_date >= p_date_from)
    AND (p_date_to IS NULL OR a.sale_date <= p_date_to)
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.store_code IS NOT NULL) OR a.store_code IN (SELECT t.store_code FROM tmp_filters t WHERE t.store_code IS NOT NULL))
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.depto IS NOT NULL) OR a.depto IN (SELECT t.depto FROM tmp_filters t WHERE t.depto IS NOT NULL))
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.secao IS NOT NULL) OR a.secao IN (SELECT t.secao FROM tmp_filters t WHERE t.secao IS NOT NULL))
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.grupo IS NOT NULL) OR a.grupo IN (SELECT t.grupo FROM tmp_filters t WHERE t.grupo IS NOT NULL))
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.subgrupo IS NOT NULL) OR a.subgrupo IN (SELECT t.subgrupo FROM tmp_filters t WHERE t.subgrupo IS NOT NULL));

  SELECT COUNT(DISTINCT u.prod_code) INTO v_universe
  FROM product_universe u
  WHERE (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.store_code IS NOT NULL) OR u.store_code IN (SELECT t.store_code FROM tmp_filters t WHERE t.store_code IS NOT NULL))
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.depto IS NOT NULL) OR u.depto IN (SELECT t.depto FROM tmp_filters t WHERE t.depto IS NOT NULL))
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.secao IS NOT NULL) OR u.secao IN (SELECT t.secao FROM tmp_filters t WHERE t.secao IS NOT NULL))
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.grupo IS NOT NULL) OR u.grupo IN (SELECT t.grupo FROM tmp_filters t WHERE t.grupo IS NOT NULL))
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.subgrupo IS NOT NULL) OR u.subgrupo IN (SELECT t.subgrupo FROM tmp_filters t WHERE t.subgrupo IS NOT NULL));

  -- GREATEST protege dois casos em que o universo pode ficar momentaneamente
  -- menor que o período: a product_universe desatualizada (import gravou o agg
  -- mas o refresh falhou) e o PLU reclassificado: o universo guarda a
  -- categoria da última venda, então sob filtro de categoria ele pode aparecer
  -- no período e não no universo. Nenhum dos dois pode virar KPI negativo.
  SELECT
    v_total                                  AS total,
    GREATEST(v_universe, v_with_sale)        AS plus_total,
    v_with_sale                              AS plus_with_sale,
    GREATEST(v_universe - v_with_sale, 0)    AS plus_without_sale;

  -- Result set 2: total count for pagination
  -- Conta o mesmo conjunto que a listagem (result set 4) devolve: o universo
  -- sob os filtros, não só quem vendeu no período. Se contasse o período, a
  -- paginação prometeria menos páginas do que a lista realmente tem.
  -- (Como antes, não considera p_search: a busca reduz a lista mas não este
  -- total. Limitação pré-existente, mantida para não mudar duas coisas de uma
  -- vez.)
  --
  -- v_universe (result set 1) já é exatamente esta contagem: mesma tabela,
  -- mesmo WHERE, calculada linhas acima. Reaproveita em vez de escanear
  -- product_universe de novo. NÃO confundir com a regressão documentada em
  -- docs/medicao-performance.md: aquela mexia em sales_prod_daily_agg via
  -- CREATE TEMPORARY TABLE ... AS SELECT; isto só reusa uma variável já
  -- calculada, sem alterar o plano de nenhuma varredura na tabela grande.
  SELECT v_universe AS total_products;

  -- Result set 3: byDate evolution
  SELECT a.sale_date AS date, SUM(a.val_vda) AS val
  FROM sales_prod_daily_agg a
  WHERE (p_date_from IS NULL OR a.sale_date >= p_date_from)
    AND (p_date_to IS NULL OR a.sale_date <= p_date_to)
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.store_code IS NOT NULL) OR a.store_code IN (SELECT t.store_code FROM tmp_filters t WHERE t.store_code IS NOT NULL))
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.depto IS NOT NULL) OR a.depto IN (SELECT t.depto FROM tmp_filters t WHERE t.depto IS NOT NULL))
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.secao IS NOT NULL) OR a.secao IN (SELECT t.secao FROM tmp_filters t WHERE t.secao IS NOT NULL))
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.grupo IS NOT NULL) OR a.grupo IN (SELECT t.grupo FROM tmp_filters t WHERE t.grupo IS NOT NULL))
    AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.subgrupo IS NOT NULL) OR a.subgrupo IN (SELECT t.subgrupo FROM tmp_filters t WHERE t.subgrupo IS NOT NULL))
  GROUP BY a.sale_date ORDER BY a.sale_date;

  -- Result set 4: paginated products
  --
  -- A listagem parte do UNIVERSO (product_universe) e traz as vendas do período
  -- por LEFT JOIN, então o PLU sem venda no recorte aparece, com val = 0. É o
  -- que a UI sempre esperou: area-table.tsx pinta de amarelo a linha com
  -- `p.val === 0` e a legenda promete "produtos sem venda no período". Enquanto
  -- a lista saía direto do sales_prod_daily_agg, essa linha era impossível:
  -- o parser descarta valor zero, então só entrava quem vendeu.
  --
  -- De quebra sai mais barato: agregar sobre a product_universe (~176k linhas)
  -- e juntar o período já agregado mede 0,8s contra 2,8s da versão anterior.
  --
  -- E corrige uma duplicação silenciosa: o GROUP BY antigo incluía nome e
  -- categoria vindos do agg, então PLU reclassificado no meio do período virava
  -- duas linhas (13.608 grupos para 13.595 PLUs distintos em prod). Aqui a
  -- classificação é uma só, a da última venda.

  -- Ordenação por whitelist. Diferente das datas e da busca, que viajam como
  -- placeholders do PREPARE, a coluna do ORDER BY não pode ser parametrizada:
  -- ela É estrutura da consulta, então entra concatenada. Antes o valor de
  -- p_sort_by ia direto para o CONCAT: qualquer texto que chegasse virava SQL.
  --
  -- A borda em TypeScript já restringe a um enum Zod (AreaAnalysisSchema), e é
  -- por isso que nunca houve exploração possível pela aplicação. Mas a proc é
  -- chamável por qualquer cliente do banco (CLI, console, uma integração
  -- futura) e não pode depender de quem chama ter validado antes.
  --
  -- Os quatro valores são os que a aplicação realmente envia: três vêm do enum
  -- e `last_sale_date` é a tradução de "daysSince" feita em area.functions.ts
  -- (ordenar por "dias sem vender" é ordenar por última venda, invertido).
  -- Qualquer outra coisa cai no default em vez de falhar: uma listagem ordenada
  -- por venda é melhor resposta a um parâmetro inválido do que um erro 500.
  SET @sort_col = CASE p_sort_by
    WHEN 'val' THEN 'val'
    WHEN 'prod_code' THEN 'prod_code'
    WHEN 'prod_name' THEN 'prod_name'
    WHEN 'last_sale_date' THEN 'last_sale_date'
    ELSE 'val'
  END;
  SET @sort_dir = IF(p_sort_dir = 'asc' OR p_sort_dir = 'ASC', 'ASC', 'DESC');

  SET @sql = CONCAT(
     'SELECT u.prod_code, u.prod_name, u.depto, u.secao, u.grupo, u.subgrupo,
             COALESCE(s.val, 0) AS val,
             COALESCE(s.last_in_period, u.last_sale_date) AS last_sale_date
      FROM (
        SELECT uu.prod_code,
               MAX(uu.prod_name) AS prod_name, MAX(uu.depto) AS depto,
               MAX(uu.secao) AS secao, MAX(uu.grupo) AS grupo,
               MAX(uu.subgrupo) AS subgrupo, MAX(uu.last_sale_date) AS last_sale_date
        FROM product_universe uu
        WHERE (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.store_code IS NOT NULL) OR uu.store_code IN (SELECT t.store_code FROM tmp_filters t WHERE t.store_code IS NOT NULL))
          AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.depto IS NOT NULL) OR uu.depto IN (SELECT t.depto FROM tmp_filters t WHERE t.depto IS NOT NULL))
          AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.secao IS NOT NULL) OR uu.secao IN (SELECT t.secao FROM tmp_filters t WHERE t.secao IS NOT NULL))
          AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.grupo IS NOT NULL) OR uu.grupo IN (SELECT t.grupo FROM tmp_filters t WHERE t.grupo IS NOT NULL))
          AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.subgrupo IS NOT NULL) OR uu.subgrupo IN (SELECT t.subgrupo FROM tmp_filters t WHERE t.subgrupo IS NOT NULL))',
    IF(p_search IS NOT NULL AND p_search != '',
      ' AND (uu.prod_name LIKE ? OR uu.prod_code LIKE ?)', ''),
    '   GROUP BY uu.prod_code
      ) u
      LEFT JOIN (
        SELECT a.prod_code, SUM(a.val_vda) AS val,
               MAX(a.sale_date) AS last_in_period
        FROM sales_prod_daily_agg a
        WHERE (? IS NULL OR a.sale_date >= ?)
          AND (? IS NULL OR a.sale_date <= ?)
          AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.store_code IS NOT NULL) OR a.store_code IN (SELECT t.store_code FROM tmp_filters t WHERE t.store_code IS NOT NULL))
          AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.depto IS NOT NULL) OR a.depto IN (SELECT t.depto FROM tmp_filters t WHERE t.depto IS NOT NULL))
          AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.secao IS NOT NULL) OR a.secao IN (SELECT t.secao FROM tmp_filters t WHERE t.secao IS NOT NULL))
          AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.grupo IS NOT NULL) OR a.grupo IN (SELECT t.grupo FROM tmp_filters t WHERE t.grupo IS NOT NULL))
          AND (NOT EXISTS (SELECT 1 FROM tmp_filters t WHERE t.subgrupo IS NOT NULL) OR a.subgrupo IN (SELECT t.subgrupo FROM tmp_filters t WHERE t.subgrupo IS NOT NULL))
        GROUP BY a.prod_code
      ) s ON s.prod_code = u.prod_code',
    CONCAT(' ORDER BY ', @sort_col, ' ', @sort_dir),
    IF(v_limit > 0, CONCAT(' LIMIT ', v_limit), ''),
    IF(v_offset > 0, CONCAT(' OFFSET ', v_offset), '')
  );

  -- Ordem dos placeholders: o filtro de busca agora vive na subquery do
  -- universo, que vem ANTES da subquery do período, por isso @search_param
  -- precede as datas aqui.
  IF p_search IS NOT NULL AND p_search != '' THEN
    SET @search_param = CONCAT('%', p_search, '%');
    PREPARE stmt FROM @sql;
    EXECUTE stmt USING @search_param, @search_param, p_date_from, p_date_from, p_date_to, p_date_to;
    DEALLOCATE PREPARE stmt;
  ELSE
    PREPARE stmt FROM @sql;
    EXECUTE stmt USING p_date_from, p_date_from, p_date_to, p_date_to;
    DEALLOCATE PREPARE stmt;
  END IF;

  DROP TEMPORARY TABLE IF EXISTS tmp_filters;
END//

-- 5/16: area_filter_hierarchy
CREATE PROCEDURE area_filter_hierarchy()
BEGIN
  SELECT MAX(sale_date) AS latest_date FROM import_log;

  SELECT store_code, store_name, depto, secao, grupo, subgrupo
  FROM filter_hierarchy
  ORDER BY store_code, depto, secao, grupo, subgrupo;

  SELECT DISTINCT sale_date FROM import_log ORDER BY sale_date ASC;
END//

-- 6/16: product_search
CREATE PROCEDURE product_search(p_q VARCHAR(255))
BEGIN
  SELECT DISTINCT prod_code, prod_name
  FROM products
  WHERE prod_name LIKE CONCAT('%', p_q, '%')
     OR prod_code LIKE CONCAT('%', p_q, '%')
  LIMIT 20;
END//

-- 7/16: get_product_by_code
CREATE PROCEDURE get_product_by_code(p_code VARCHAR(20))
BEGIN
  SELECT DISTINCT prod_code, prod_name
  FROM products
  WHERE prod_code = p_code
  LIMIT 1;
END//

-- 8/16: product_analysis
--
-- p_store_codes é JSON (array de códigos de loja), não mais VARCHAR único:
-- suporta comparar um subconjunto específico de lojas, não só "uma loja" ou
-- "todas". Array vazio = todas (mesmo comportamento de p_store_code IS NULL
-- de antes). Diferente da regressão de area_analysis
-- (docs/medicao-performance.md): aqui o filtro por prod_code já é altamente
-- seletivo (um produto tem poucas dezenas/centenas de linhas no total em
-- sales_prod_daily_agg), então o custo do JSON_CONTAINS é irrelevante: não
-- é o mesmo padrão de predicado repetido sobre uma tabela inteira sem
-- filtro seletivo antes dele.
CREATE PROCEDURE product_analysis(
  p_prod_code VARCHAR(20),
  p_store_codes JSON,
  p_ref_date DATE
)
BEGIN
  DECLARE v_ref_date DATE;

  SET v_ref_date = COALESCE(p_ref_date, (SELECT MAX(sale_date) FROM sales_prod_daily_agg WHERE prod_code = p_prod_code));

  -- Result set 1: product metadata (always returns row from products even without sales)
  SELECT p.prod_code, p.prod_name, h.depto, h.secao, h.grupo, h.subgrupo
  FROM products p
  LEFT JOIN (
    SELECT prod_code, depto, secao, grupo, subgrupo
    FROM sales_prod_daily_agg
    WHERE prod_code = p_prod_code
    ORDER BY sale_date DESC
    LIMIT 1
  ) h ON true
  WHERE p.prod_code = p_prod_code
  LIMIT 1;

  -- Result set 2: refValue + refDate
  SELECT v_ref_date AS ref_date, COALESCE(SUM(val_vda), 0) AS ref_value
  FROM sales_prod_daily_agg
  WHERE prod_code = p_prod_code
    AND sale_date = v_ref_date
    AND (JSON_LENGTH(p_store_codes) = 0 OR JSON_CONTAINS(p_store_codes, JSON_QUOTE(store_code)));

  -- Result set 3: byStore, sempre TODAS as lojas, sem filtro de p_store_codes.
  -- O cliente decide se mostra e para quais códigos filtrar (comparação de
  -- um subconjunto não precisa de outra ida ao banco).
  SELECT a.store_code AS code, COALESCE(s.store_name, a.store_code) AS name, SUM(a.val_vda) AS val
  FROM sales_prod_daily_agg a
  LEFT JOIN stores s ON s.store_code = a.store_code
  WHERE a.prod_code = p_prod_code
    AND a.sale_date = v_ref_date
  GROUP BY a.store_code, s.store_name
  ORDER BY val DESC;

  -- Result set 4: evolution (last 28 days)
  --
  -- INTERVAL 27, não 28: os dois extremos são inclusivos, então `ref - 27` até
  -- `ref` são 28 datas. Com 28 vinham 29, contradizendo o rótulo "últimos 28
  -- dias" da tela e do PDF, e 28 aqui não é número redondo qualquer, são 4
  -- semanas exatas, o que importa porque a análise ao lado compara o mesmo dia
  -- da semana. Com 29 dias a janela pegava um dia da semana repetido.
  SELECT a.sale_date AS date, SUM(a.val_vda) AS val
  FROM sales_prod_daily_agg a
  WHERE a.prod_code = p_prod_code
    AND a.sale_date >= DATE_SUB(v_ref_date, INTERVAL 27 DAY)
    AND a.sale_date <= v_ref_date
    AND (JSON_LENGTH(p_store_codes) = 0 OR JSON_CONTAINS(p_store_codes, JSON_QUOTE(a.store_code)))
  GROUP BY a.sale_date
  ORDER BY a.sale_date;

  -- Result set 5: lastFourSameWeekday
  SELECT a.sale_date AS date, SUM(a.val_vda) AS val
  FROM sales_prod_daily_agg a
  WHERE a.prod_code = p_prod_code
    AND DAYOFWEEK(a.sale_date) = DAYOFWEEK(v_ref_date)
    AND a.sale_date < v_ref_date
    AND (JSON_LENGTH(p_store_codes) = 0 OR JSON_CONTAINS(p_store_codes, JSON_QUOTE(a.store_code)))
  GROUP BY a.sale_date
  ORDER BY a.sale_date DESC
  LIMIT 4;

  -- Result set 6: lastFourAll
  SELECT a.sale_date AS date, SUM(a.val_vda) AS val
  FROM sales_prod_daily_agg a
  WHERE a.prod_code = p_prod_code
    AND a.sale_date < v_ref_date
    AND (JSON_LENGTH(p_store_codes) = 0 OR JSON_CONTAINS(p_store_codes, JSON_QUOTE(a.store_code)))
  GROUP BY a.sale_date
  ORDER BY a.sale_date DESC
  LIMIT 4;
END//

-- 9/16: upsert_products_bulk
CREATE PROCEDURE upsert_products_bulk(
  p_rows JSON,
  p_sale_date DATE
)
BEGIN
  DECLARE v_idx INT DEFAULT 0;
  DECLARE v_total INT;
  DECLARE v_prod_code VARCHAR(20);
  DECLARE v_prod_name VARCHAR(255);

  DROP TEMPORARY TABLE IF EXISTS tmp_products;
  CREATE TEMPORARY TABLE tmp_products (
    prod_code VARCHAR(20),
    prod_name VARCHAR(255)
  ) ENGINE=MEMORY;

  INSERT INTO tmp_products (prod_code, prod_name)
  SELECT j.prod_code, j.prod_name
  FROM JSON_TABLE(p_rows, '$[*]' COLUMNS (
    prod_code VARCHAR(20) PATH '$.prod_code',
    prod_name VARCHAR(255) PATH '$.prod_name'
  )) AS j;

  INSERT IGNORE INTO products (prod_code, prod_name, sale_date)
  SELECT DISTINCT t.prod_code, t.prod_name, p_sale_date
  FROM tmp_products t;

  DROP TEMPORARY TABLE IF EXISTS tmp_products;
END//

-- 10/16: finalize_import
CREATE PROCEDURE finalize_import(
  p_batch_id VARCHAR(36),
  p_sale_date DATE,
  p_row_count INT,
  p_imported_by VARCHAR(36)
)
BEGIN
  DECLARE v_staging_count INT DEFAULT 0;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;

  SELECT COUNT(*) INTO v_staging_count FROM staging_sales WHERE batch_id = p_batch_id AND sale_date = p_sale_date;
  IF v_staging_count = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No staging rows found for given batch_id and sale_date';
  END IF;

  DELETE FROM sales_daily_agg WHERE sale_date = p_sale_date;
  DELETE FROM sales_prod_daily_agg WHERE sale_date = p_sale_date;

  INSERT INTO sales_daily_agg (sale_date, store_code, val_vda)
  SELECT
    p_sale_date,
    s.store_code,
    COALESCE(SUM(s.val_vda), 0)
  FROM staging_sales s
  WHERE s.batch_id = p_batch_id AND s.sale_date = p_sale_date
  GROUP BY s.store_code;

  INSERT INTO sales_prod_daily_agg (sale_date, store_code, prod_code, prod_name, depto, secao, grupo, subgrupo, val_vda)
  SELECT
    p_sale_date,
    s.store_code,
    s.prod_code,
    MAX(s.prod_name),
    s.depto,
    s.secao,
    s.grupo,
    s.subgrupo,
    COALESCE(SUM(s.val_vda), 0)
  FROM staging_sales s
  WHERE s.batch_id = p_batch_id AND s.sale_date = p_sale_date
  GROUP BY s.store_code, s.prod_code, s.depto, s.secao, s.grupo, s.subgrupo;

  DELETE FROM staging_sales WHERE batch_id = p_batch_id AND sale_date = p_sale_date;

  -- v_staging_count, não p_row_count: o valor que o cliente manda é só o que
  -- ele PRETENDIA importar (parsed.sales.length, calculado antes de qualquer
  -- chunk ser de fato inserido): nunca é cruzado contra o que realmente
  -- chegou no staging. Um chunk perdido silenciosamente gravaria o número
  -- errado em import_log sem detecção nenhuma (ver
  -- docs/auditoria-qa-2026-08-01.md, item 8). v_staging_count já foi contado
  -- e verificado > 0 acima nesta mesma procedure: é a única fonte confiável.
  INSERT INTO import_log (sale_date, row_count, imported_by, batch_id)
  VALUES (p_sale_date, v_staging_count, p_imported_by, p_batch_id)
  ON DUPLICATE KEY UPDATE
    row_count = VALUES(row_count),
    imported_by = VALUES(imported_by),
    imported_at = CURRENT_TIMESTAMP,
    batch_id = VALUES(batch_id);

  -- Até 30/07/2026, chamava refresh_filter_hierarchy()/refresh_product_universe()
  -- aqui dentro: cada import pagava ~30-36s de regeneração completa das duas
  -- tabelas (varrem sales_prod_daily_agg inteira, não só a data importada; ver
  -- comentário nas procs). Item 5 de docs/continuar.md: PLU/categoria novos são
  -- raros o bastante para não justificar esse custo síncrono em toda importação.
  -- As duas passaram a rodar num cron diário (scripts/refresh-universe.ts, 03h30,
  -- depois do purge das 03h): um PLU vendido pela primeira vez hoje só aparece
  -- na Área após o refresh seguinte, não no mesmo dia. Aceito conscientemente:
  -- ver a troca completa na decisão registrada em docs/continuar.md item 5.
  COMMIT;
END//

-- 11/16: imported_dates
CREATE PROCEDURE imported_dates()
BEGIN
  SELECT sale_date, row_count, imported_at
  FROM import_log
  ORDER BY sale_date DESC;
END//

-- 12/16: purge_old_aggs
--
-- Outra ponta da invariante de retenção; o lado JS está em
-- src/lib/retention.ts (isWithinRetention), usado pelo import-watch para não
-- importar o que este purge apagaria, senão vira um loop diário de
-- importar -> purgar -> reimportar.
--
-- A comparação é ESTRITA (`< @cutoff`), logo a data exatamente na borda
-- (p_days atrás) é PRESERVADA. O lado JS usa `<=` justamente para casar com
-- isso. Mexeu em um, revise o outro.
--
-- DEPENDÊNCIA DE FUSO: os dois lados só coincidem porque o host e o MariaDB
-- estão em UTC (`time_zone = SYSTEM`, TZ do host `Etc/UTC`): aí CURRENT_DATE é
-- o mesmo dia que o JS calcula em UTC. Trocar o fuso para America/Sao_Paulo faz
-- CURRENT_DATE virar 3h antes do dia UTC e desalinha a borda em um dia.
CREATE PROCEDURE purge_old_aggs(p_days INT)
BEGIN
  DECLARE v_deleted INT DEFAULT 0;
  -- Sem isto até 31/07/2026, as 4 DELETEs abaixo faziam autocommit cada uma
  -- por conta própria (sem START TRANSACTION, toda instrução isolada já é sua
  -- própria transação implícita): uma falha na 3ª, por exemplo, deixava os
  -- agregados purgados mas products/import_log intactos, sem rollback e sem
  -- v_deleted refletindo o que realmente aconteceu. Mesmo padrão de
  -- finalize_import, que já tinha essa proteção.
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  -- O 180 é só fallback: toda chamada real (purgeOldAggs em
  -- admin-system.functions.ts, scripts/purge-aggs.ts) passa p_days
  -- explicitamente a partir de RETENTION_DAYS (src/lib/retention.ts). SQL não
  -- importa TS, então este literal só é exercitado por uma chamada manual
  -- direto no banco, mas se RETENTION_DAYS mudar, mude aqui também, para o
  -- fallback não ficar defasado do valor praticado.
  SET @cutoff = DATE_SUB(CURRENT_DATE, INTERVAL COALESCE(p_days, 180) DAY);

  START TRANSACTION;

  DELETE FROM sales_daily_agg WHERE sale_date < @cutoff;
  SET v_deleted = v_deleted + ROW_COUNT();

  DELETE FROM sales_prod_daily_agg WHERE sale_date < @cutoff;
  SET v_deleted = v_deleted + ROW_COUNT();

  -- products faltava aqui desde sempre: a tabela não era purgada por nada, só
  -- recebia INSERT IGNORE a cada import (~10,2k linhas/dia, sem teto). Ela
  -- alimenta product_search e get_product_by_code, então um PLU cujas vendas
  -- foram purgadas continuava aparecendo na busca e abria uma página de produto
  -- sem dado nenhum.
  --
  -- Descoberto em 2026-07-25, ao purgar à mão as datas anteriores a 27/05: foi
  -- preciso apagar products e regenerar a filter_hierarchy fora desta proc,
  -- justamente porque ela não fazia nem um nem outro.
  DELETE FROM products WHERE sale_date < @cutoff;
  SET v_deleted = v_deleted + ROW_COUNT();

  DELETE FROM import_log WHERE sale_date < @cutoff;
  SET v_deleted = v_deleted + ROW_COUNT();

  COMMIT;

  -- Até 30/07/2026, chamava refresh_product_universe()/refresh_filter_hierarchy()
  -- aqui (condicionado a v_deleted > 0): as duas tabelas derivadas precisam
  -- refletir o agg que acabou de encolher, senão um PLU cuja última venda saiu
  -- na poda nunca sai do universo, e os filtros seguem oferecendo combinações
  -- que já não existem. Isso agora é responsabilidade do cron dedicado
  -- (scripts/refresh-universe.ts, 03h30: depois do purge das 03h, então já
  -- enxerga o agg pós-poda), não mais desta proc. Ver item 5 de
  -- docs/continuar.md e o comentário equivalente em finalize_import.
  SELECT v_deleted AS deleted;
END//

-- 13/16: db_health_check
CREATE PROCEDURE db_health_check()
BEGIN
  SELECT VERSION() AS version, NOW() AS time;

  SELECT
    ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS db_size_mb
  FROM information_schema.tables
  WHERE table_schema = DATABASE();

  SELECT
    table_name AS table_name,
    ROUND((data_length + index_length) / 1024 / 1024, 2) AS size_mb,
    table_rows AS row_estimate
  FROM information_schema.tables
  WHERE table_schema = DATABASE()
  ORDER BY size_mb DESC;
END//

-- 14/16: refresh_filter_hierarchy
--
-- DELETE, não TRUNCATE. Os dois esvaziam a tabela, mas TRUNCATE é DDL: provoca
-- commit implícito e não respeita MVCC. Mediu-se em 2026-07-25, com 164k linhas
-- na product_universe: durante os ~33s do refresh, um leitor concorrente via
-- ZERO linha na tabela, e a tela Área parte do universo, então ela ficava
-- vazia a cada import, em pleno horário comercial (o cron roda 10h–22h). Com
-- DELETE, o leitor continua enxergando a versão anterior até o COMMIT.
--
-- O custo medido do DELETE sobre o TRUNCATE foi de +11% (32,8s → 36,5s), que é
-- barato pelo que compra: além da visibilidade, o DELETE é transacional, então
-- uma falha no meio do refresh volta ao estado anterior em vez de deixar a
-- tabela truncada. Ver a nota de atomicidade no finalize_import.
--
-- Correção em 31/07/2026: a garantia acima só é real com o DELETE e o INSERT
-- na MESMA transação: sem START TRANSACTION explícito, cada instrução já é
-- sua própria transação implícita (autocommit) e o leitor via a tabela
-- momentaneamente vazia entre as duas, exatamente o sintoma que o DELETE
-- devia evitar. Era inofensivo enquanto esta proc só era chamada de dentro de
-- finalize_import (que já envolvia tudo numa transação); deixou de ser
-- verdade quando virou uma chamada standalone do cron dedicado
-- (scripts/refresh-universe.ts, item 5 de docs/continuar.md).
CREATE PROCEDURE refresh_filter_hierarchy()
BEGIN
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;

  DELETE FROM filter_hierarchy;

  INSERT INTO filter_hierarchy (store_code, store_name, depto, secao, grupo, subgrupo)
  SELECT DISTINCT
    a.store_code,
    COALESCE(s.store_name, a.store_code),
    a.depto,
    a.secao,
    a.grupo,
    a.subgrupo
  FROM sales_prod_daily_agg a
  LEFT JOIN stores s ON s.store_code = a.store_code
  WHERE a.depto IS NOT NULL OR a.secao IS NOT NULL OR a.grupo IS NOT NULL OR a.subgrupo IS NOT NULL;

  COMMIT;
END//

-- 15/16: refresh_product_universe
-- Regenera a product_universe do zero (mesmo padrão da refresh_filter_hierarchy:
-- a tabela é derivada, então é recriada, nunca editada em linha).
--
-- O JOIN com o MAX(sale_date) por (prod_code, store_code) serve a dois
-- propósitos de uma vez: `a.sale_date` já É a última venda, e nome/categoria
-- saem da linha mais recente: um PLU reclassificado fica com a categoria
-- atual, não com a primeira que teve. Como a PK do agg é
-- (sale_date, store_code, prod_code), o JOIN devolve exatamente uma linha por
-- par.
--
-- DELETE em vez de TRUNCATE pelo mesmo motivo da refresh_filter_hierarchy: com
-- TRUNCATE a tabela fica visivelmente vazia para quem lê durante o refresh.
-- Mesma correção de 31/07/2026 documentada lá: DELETE + INSERT precisam estar
-- na mesma transação para a garantia de visibilidade valer de verdade,
-- especialmente aqui: area_analysis faz LEFT JOIN do período sobre esta
-- tabela para decidir quais produtos existem.
CREATE PROCEDURE refresh_product_universe()
BEGIN
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;

  DELETE FROM product_universe;

  INSERT INTO product_universe
    (prod_code, store_code, prod_name, depto, secao, grupo, subgrupo, last_sale_date)
  SELECT a.prod_code, a.store_code, a.prod_name, a.depto, a.secao, a.grupo, a.subgrupo, a.sale_date
  FROM sales_prod_daily_agg a
  JOIN (
    SELECT prod_code, store_code, MAX(sale_date) AS ult
    FROM sales_prod_daily_agg
    GROUP BY prod_code, store_code
  ) m
    ON m.prod_code = a.prod_code
   AND m.store_code = a.store_code
   AND m.ult = a.sale_date;

  COMMIT;
END//

-- 16/16: has_role
CREATE PROCEDURE has_role(p_user_id VARCHAR(36), p_role VARCHAR(20))
BEGIN
  SELECT COUNT(*) > 0 AS has_role
  FROM users
  WHERE id = p_user_id AND role = p_role AND is_active = TRUE;
END//

DELIMITER ;
