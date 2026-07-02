
# Refatoração do sistema de login — Bench GPA

Objetivo: substituir o login por magic link por **e-mail sintético + senha**, unificar `profiles` + `user_roles` em uma única tabela `public.users`, restringir criação/gestão de usuários ao admin e remover toda a infraestrutura de e-mail.

---

## 1. Migração de banco (única migration, revisada antes de rodar)

### 1.1 Criar `public.users`

```sql
CREATE TABLE public.users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE CHECK (email ~ '@gpabr\.com$'),
  name text NOT NULL,
  role public.app_role NOT NULL DEFAULT 'user',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.users TO authenticated;
GRANT ALL ON public.users TO service_role;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- usuário lê a própria linha (para checar is_active pós-login)
CREATE POLICY "users_self_select" ON public.users
  FOR SELECT TO authenticated
  USING (id = auth.uid());

-- admin lê tudo (via has_role, sem recursão pois has_role é SECURITY INVOKER + STABLE)
CREATE POLICY "users_admin_select" ON public.users
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
```

Escritas em `public.users` ficam restritas ao `service_role` (via server functions do admin) — nenhuma policy de INSERT/UPDATE/DELETE para `authenticated`.

### 1.2 Atualizar funções de autorização

```sql
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = _user_id AND role = _role AND is_active = true
  )
$$;

-- Renomeia is_approved -> is_active_user (para não colidir com a coluna)
DROP FUNCTION IF EXISTS public.is_approved(uuid);
CREATE OR REPLACE FUNCTION public.is_active_user(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = _user_id AND is_active = true)
$$;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_user(uuid) TO authenticated;
```

### 1.3 Atualizar RLS de todas as tabelas de dados

Substituir `public.is_approved(auth.uid())` por `public.is_active_user(auth.uid())` em: `sales`, `sales_daily_agg`, `products`, `stores`, `import_log`, `filter_hierarchy`. Atualizar também RPCs (`product_search`, `imported_dates`, `dashboard_metrics`, `dashboard_rankings`, `filter_options`, `area_analysis`, `product_analysis`, `products_in_decline`) para chamar `is_active_user`.

### 1.4 Limpeza do modelo antigo

```sql
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP TABLE IF EXISTS public.user_roles CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TYPE  IF EXISTS public.user_status;
```

### 1.5 Reset de usuários + admin inicial

```sql
DELETE FROM auth.users;  -- limpeza pontual da migração
-- admin criado pela mesma migration via extensão pgcrypto:
-- INSERT em auth.users com senha bcrypt + INSERT em public.users
-- email: 0001@gpabr.com  senha inicial: definir na hora (informar ao usuário)
```
(Se preferir, criar o admin depois via `supabase.auth.admin.createUser` num script one-shot; a migration deixa apenas a estrutura pronta.)

### 1.6 Remover infraestrutura de e-mail

```sql
DROP FUNCTION IF EXISTS public.enqueue_email(text, jsonb);
DROP FUNCTION IF EXISTS public.email_queue_dispatch();
DROP FUNCTION IF EXISTS public.email_queue_wake();
DROP FUNCTION IF EXISTS public.read_email_batch(text, int, int);
DROP FUNCTION IF EXISTS public.move_to_dlq(text, text, bigint, jsonb);
DROP FUNCTION IF EXISTS public.delete_email(text, bigint);
DROP TABLE IF EXISTS public.email_send_log;
DROP TABLE IF EXISTS public.email_send_state;
DROP TABLE IF EXISTS public.suppressed_emails;
DROP TABLE IF EXISTS public.email_unsubscribe_tokens;
-- unschedule cron 'process-email-queue'
```

Auth Hook de "Send Email" desativado via `supabase--configure_auth` / painel (nota: pode exigir passo manual).

---

## 2. Server functions (`src/lib/admin.functions.ts`)

Substituir `listUsers`, `setUserStatus`, `setUserRole` por:

- `listUsers()` — `SELECT id, email, name, role, is_active, created_at FROM public.users ORDER BY created_at DESC`
- `createUser({ email, name, password, role })` — valida domínio `@gpabr.com`; chama `supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true })`; INSERT em `public.users`.
- `setUserRole({ userId, role })` — `UPDATE public.users SET role = ...` (impede auto-rebaixamento do último admin).
- `setUserActive({ userId, isActive })` — `UPDATE public.users SET is_active = ...` (impede auto-desativação).
- `resetPassword({ userId, password })` — `supabaseAdmin.auth.admin.updateUserById(userId, { password })`.

**Não existe** `deleteUser`.

---

## 3. Página de login (`src/routes/auth.tsx`)

Reescrever com formulário e-mail + senha:
- `supabase.auth.signInWithPassword({ email, password })`
- Após sucesso: `select is_active from public.users where id = auth.uid()`. Se `false` → `signOut()` + toast "Usuário inativo, procure o administrador".
- Sem magic link, sem cooldown, sem "reenviar".

---

## 4. Página de admin (`src/routes/_authenticated/admin.tsx`)

- Botão "Novo usuário" abre dialog com: E-mail (sufixo `@gpabr.com` fixo na UI), Nome, Senha inicial, Papel.
- Tabela lista: E-mail · Nome · Papel · Ativo · Cadastro · Ações.
- Ações por linha: toggle Ativo/Inativo, alternar Admin/Usuário, botão "Redefinir senha" (dialog com nova senha).
- Remover qualquer ação de exclusão.

---

## 5. Remoções de arquivos

- `src/lib/email-templates/` (todos os 6 templates + `registry.ts` se existir)
- `src/routes/lovable/email/**` (webhook, preview, queue/process)
- Referências a `@lovable.dev/email-js`, `@lovable.dev/webhooks-js`, `@react-email/components`, `react-email` no `package.json` (`bun remove`).
- Migration antiga `20260629000154_email_infra.sql`: **não** deletar arquivo histórico; a nova migration faz o `DROP` correspondente (revert efetivo em runtime).

---

## 6. Ajustes menores

- `src/integrations/supabase/types.ts` — regenerado automaticamente após a migration.
- Referências a `profiles`/`user_roles`/`status`/`is_approved` no código: atualizar para `users`/`is_active`/`is_active_user`.
- `beforeLoad` de `/admin` e `/upload`: trocar consulta de `user_roles` por `users`.

---

## Ordem de execução (após aprovação)

1. Rodar **migration única** (seções 1.1–1.6) via `supabase--migration`.
2. Criar admin inicial (`0001@gpabr.com`) via server-side script one-shot ou `INSERT` embutido na migration — confirmar senha inicial com o usuário.
3. Reescrever `auth.tsx`, `admin.functions.ts`, `admin.tsx`.
4. Deletar diretórios/arquivos de e-mail + `bun remove` das libs.
5. Desativar Auth Hook de envio de e-mail no Supabase Auth.
6. Verificar typecheck e testar login manualmente.

---

**Pendências para confirmar antes de executar:**

1. **Senha inicial do admin `0001@gpabr.com`**: qual valor usar? (Sugestão: gerar aleatória e mostrar uma única vez.)
2. Confirmar que posso **apagar todos os usuários atuais** em `auth.users` (não há dados de usuário a preservar).
3. Confirmar que a **migration `20260629000154_email_infra.sql` fica no histórico** (apenas revertida por DROP) — padrão Supabase, não deleto o arquivo.
