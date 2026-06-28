-- Self-only SELECT on user_roles so has_role can be SECURITY INVOKER
-- without infinite recursion. Admin reads go through service_role.
DROP POLICY IF EXISTS user_roles_select ON public.user_roles;
CREATE POLICY user_roles_select ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Convert helper functions to SECURITY INVOKER
ALTER FUNCTION public.has_role(uuid, public.app_role) SECURITY INVOKER;
ALTER FUNCTION public.is_approved(uuid) SECURITY INVOKER;