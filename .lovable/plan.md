## Diagnóstico

O erro vem de `src/lib/upload.functions.ts` (linha 61), do bloco introduzido na última otimização (2-passos para evitar UPDATE massivo em `products`):

```ts
const { data: existing, error: selErr } = await supabaseAdmin
  .from("products")
  .select("prod_code, prod_name, last_seen")
  .in("prod_code", codes);       // codes tem milhares de itens
```

Cada arquivo XLSX gera de **milhares a dezenas de milhares** de `prod_code`. O `.in(...)` do PostgREST serializa a lista inteira na **URL** (querystring). Quando ela ultrapassa o limite do gateway/PostgREST (~8 KB de URL), a request é rejeitada e o `select` retorna erro — que o `safeError` traduz para "Falha ao consultar produtos".

Ou seja: o INSERT (linhas 50–53) passa porque vai no body do POST, mas o SELECT seguinte quebra porque manda os códigos na URL.

Contexto: a base tem 16.274 produtos hoje, e importações típicas mandam milhares de códigos de uma vez.

## Correção

Mover a lógica de merge para um RPC SQL, eliminando o round-trip e o problema de tamanho de URL. Uma única chamada, transacional, sem serializar códigos na querystring.

### 1. Nova migration: `upsert_products_bulk(jsonb, date)`

```sql
CREATE OR REPLACE FUNCTION public.upsert_products_bulk(
  p_rows jsonb,          -- [{prod_code, prod_name}, ...]
  p_sale_date date
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.products (prod_code, prod_name, last_seen)
  SELECT r->>'prod_code', r->>'prod_name', p_sale_date
  FROM jsonb_array_elements(p_rows) r
  ON CONFLICT (prod_code) DO UPDATE
    SET prod_name = EXCLUDED.prod_name,
        last_seen = GREATEST(products.last_seen, EXCLUDED.last_seen)
    WHERE products.prod_name IS DISTINCT FROM EXCLUDED.prod_name
       OR products.last_seen IS NULL
       OR products.last_seen < EXCLUDED.last_seen;
END;
$$;
REVOKE ALL ON FUNCTION public.upsert_products_bulk(jsonb, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_products_bulk(jsonb, date) TO service_role;
```

Preserva a otimização anterior: só faz UPDATE quando o nome muda ou `last_seen` avança — mas em SQL puro, sem ler linhas de volta.

### 2. Ajustar `src/lib/upload.functions.ts` (bloco `if (data.products.length)`)

Substituir o INSERT + SELECT + UPDATE em 2 passos por uma única chamada:

```ts
const { error: upErr } = await supabaseAdmin.rpc("upsert_products_bulk", {
  p_rows: data.products,
  p_sale_date: data.sale_date,
});
if (upErr) throw safeError("beginImport.products.upsert", upErr, "Falha ao cadastrar produtos.");
```

## Por que não só "chunkar" o `.in(...)`

Funcionaria, mas manteria N round-trips extras por import (uma para cada lote de ~500 códigos) e um UPDATE cliente-lado depois. O RPC resolve em uma única chamada e é mais robusto.

## Verificação

- Rodar o import de um arquivo real após o deploy.
- Confirmar no `import_log` que a data foi finalizada.
- `SELECT count(*) FROM products` antes/depois para checar que produtos novos entraram e que nomes atualizados foram propagados.
