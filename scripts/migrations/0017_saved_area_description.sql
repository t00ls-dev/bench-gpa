ALTER TABLE saved_area_analyses
  ADD COLUMN IF NOT EXISTS description VARCHAR(1000) NULL AFTER name;
