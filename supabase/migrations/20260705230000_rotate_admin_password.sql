
-- Rotaciona a senha do admin a partir de uma config do Supabase
-- Uso: definir app.settings.admin_password em Project Settings > Config
-- Se não estiver definida, a migration avisa e não altera nada.
DO $$
DECLARE
  v_new_pw text;
  v_admin_id uuid;
BEGIN
  v_new_pw := current_setting('app.settings.admin_password', true);
  IF v_new_pw IS NULL THEN
    RAISE WARNING 'app.settings.admin_password not set — skipping password rotation. Set it via: SELECT set_config(''app.settings.admin_password'', ''nova-senha'', false);';
    RETURN;
  END IF;

  SELECT id INTO v_admin_id FROM public.users WHERE email = '0001@gpabr.com';
  IF v_admin_id IS NULL THEN
    RAISE WARNING 'admin user (0001@gpabr.com) not found — skipping';
    RETURN;
  END IF;

  UPDATE auth.users
  SET encrypted_password = crypt(v_new_pw, gen_salt('bf')),
      updated_at = now()
  WHERE id = v_admin_id;

  RAISE NOTICE 'Admin password rotated successfully for user %', v_admin_id;
END $$;
