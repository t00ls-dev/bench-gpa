
CREATE TABLE IF NOT EXISTS public.sales_daily_agg (
  sale_date  date    not null,
  store_code text    not null,
  store_name text    not null,
  depto      text,
  secao      text,
  grupo      text,
  subgrupo   text,
  val_vda    numeric not null default 0,
  item_count integer not null default 0
);

CREATE INDEX IF NOT EXISTS sda_date_idx ON public.sales_daily_agg (sale_date);
CREATE INDEX IF NOT EXISTS sda_date_store_idx ON public.sales_daily_agg (sale_date, store_code);
CREATE INDEX IF NOT EXISTS sda_hier_idx ON public.sales_daily_agg (depto, secao, grupo, subgrupo);

