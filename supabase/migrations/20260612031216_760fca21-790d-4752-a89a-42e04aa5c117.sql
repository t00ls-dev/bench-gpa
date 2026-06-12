
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TYPE public.app_role AS ENUM ('admin', 'user');
CREATE TYPE public.user_status AS ENUM ('pending', 'approved', 'blocked');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  status public.user_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_approved(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND status = 'approved')
$$;

CREATE POLICY "profiles_select" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "profiles_update_admin" ON public.profiles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "user_roles_select" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, status)
  VALUES (NEW.id, NEW.email,
    CASE WHEN lower(NEW.email) = 'pedro.rodrigues.wch@gmail.com' THEN 'approved'::public.user_status ELSE 'pending'::public.user_status END);
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id,
    CASE WHEN lower(NEW.email) = 'pedro.rodrigues.wch@gmail.com' THEN 'admin'::public.app_role ELSE 'user'::public.app_role END);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.sales (
  id BIGSERIAL PRIMARY KEY,
  sale_date DATE NOT NULL,
  store_code TEXT NOT NULL,
  store_name TEXT NOT NULL,
  depto TEXT,
  secao TEXT,
  grupo TEXT,
  subgrupo TEXT,
  prod_code TEXT NOT NULL,
  prod_name TEXT NOT NULL,
  val_vda NUMERIC(14,2) NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales TO authenticated;
GRANT ALL ON public.sales TO service_role;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
CREATE INDEX sales_date_idx ON public.sales (sale_date);
CREATE INDEX sales_prod_idx ON public.sales (prod_code);
CREATE INDEX sales_store_date_idx ON public.sales (store_code, sale_date);
CREATE INDEX sales_hier_idx ON public.sales (depto, secao, grupo, subgrupo);
CREATE POLICY "sales_select_approved" ON public.sales FOR SELECT TO authenticated
  USING (public.is_approved(auth.uid()));
CREATE POLICY "sales_admin_all" ON public.sales FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.products (
  prod_code TEXT PRIMARY KEY,
  prod_name TEXT NOT NULL,
  last_seen DATE
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE INDEX products_name_trgm ON public.products USING gin (prod_name gin_trgm_ops);
CREATE POLICY "products_select_approved" ON public.products FOR SELECT TO authenticated
  USING (public.is_approved(auth.uid()));

CREATE TABLE public.stores (
  store_code TEXT PRIMARY KEY,
  store_name TEXT NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stores TO authenticated;
GRANT ALL ON public.stores TO service_role;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stores_select_approved" ON public.stores FOR SELECT TO authenticated
  USING (public.is_approved(auth.uid()));
