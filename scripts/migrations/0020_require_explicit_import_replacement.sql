-- Add a guarded lock acquisition for imports. It serializes the existence
-- check with the import lease, so a stale browser cannot replace a date that
-- was imported after its confirmation screen loaded.

DELIMITER //

DROP PROCEDURE IF EXISTS acquire_import_lock_checked//
CREATE PROCEDURE acquire_import_lock_checked(
  p_batch_id VARCHAR(36),
  p_sale_date DATE,
  p_user_id VARCHAR(36),
  p_stores JSON,
  p_products JSON,
  p_replace_existing BOOLEAN
)
BEGIN
  DECLARE v_acquired BOOLEAN DEFAULT FALSE;
  DECLARE v_date_exists BOOLEAN DEFAULT FALSE;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    IF v_acquired THEN
      CALL release_import_lock(p_batch_id, p_user_id);
    END IF;
    RESIGNAL;
  END;

  CALL acquire_import_lock(p_batch_id, p_sale_date, p_user_id, p_stores, p_products);
  SET v_acquired = TRUE;

  SELECT EXISTS(
    SELECT 1 FROM import_log WHERE sale_date = p_sale_date
  ) INTO v_date_exists;

  IF v_date_exists AND NOT COALESCE(p_replace_existing, FALSE) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'IMPORT_DATE_EXISTS';
  END IF;
END//

DELIMITER ;
