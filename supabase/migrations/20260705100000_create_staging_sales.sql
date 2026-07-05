CREATE TABLE public.staging_sales (
  id BIGSERIAL PRIMARY KEY,
  batch_id UUID NOT NULL,
  sale_date DATE NOT NULL,
  store_code TEXT NOT NULL,
  store_name TEXT NOT NULL,
  depto TEXT,
  secao TEXT,
  grupo TEXT,
  subgrupo TEXT,
  prod_code TEXT NOT NULL,
  prod_name TEXT NOT NULL,
  val_vda NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_staging_sales_batch ON public.staging_sales (batch_id);
CREATE INDEX idx_staging_sales_date ON public.staging_sales (sale_date);

GRANT SELECT, INSERT, DELETE ON public.staging_sales TO service_role;

ALTER TABLE public.staging_sales ENABLE ROW LEVEL SECURITY;
