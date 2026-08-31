-- 1. Fix Function Search Path Mutable
ALTER FUNCTION public.handle_new_user() SET search_path = '';
ALTER FUNCTION public.set_updated_at() SET search_path = '';
ALTER FUNCTION public.rls_auto_enable() SET search_path = '';

-- 2. Fix Extension in Public
CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION pg_trgm SET SCHEMA extensions;

-- 3. Fix Public Can Execute SECURITY DEFINER Function (anon_security_definer_function_executable)
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM authenticated;

-- 4. Fix Security Definer View
ALTER VIEW public.orders_with_dispatch SET (security_invoker = true);
ALTER VIEW public.dashboard_stats SET (security_invoker = true);

-- 5. Fix RLS Policy Always True (Restrict to Admins, except profiles which needs self-read)

-- Drop the overly permissive policies
DROP POLICY IF EXISTS "authenticated_all" ON public.app_settings;
DROP POLICY IF EXISTS "authenticated_all" ON public.customers;
DROP POLICY IF EXISTS "authenticated_all" ON public.dispatches;
DROP POLICY IF EXISTS "authenticated_all" ON public.orders;
DROP POLICY IF EXISTS "authenticated_all" ON public.pathao_tokens;
DROP POLICY IF EXISTS "authenticated_all" ON public.profiles;
DROP POLICY IF EXISTS "authenticated_all" ON public.sync_logs;
DROP POLICY IF EXISTS "authenticated_all" ON public.webhook_logs;

-- Recreate policies for admin access only
CREATE POLICY "admin_all" ON public.app_settings FOR ALL TO authenticated USING (
  (SELECT role FROM public.profiles WHERE user_id = auth.uid()) = 'admin'
) WITH CHECK (
  (SELECT role FROM public.profiles WHERE user_id = auth.uid()) = 'admin'
);

CREATE POLICY "admin_all" ON public.customers FOR ALL TO authenticated USING (
  (SELECT role FROM public.profiles WHERE user_id = auth.uid()) = 'admin'
) WITH CHECK (
  (SELECT role FROM public.profiles WHERE user_id = auth.uid()) = 'admin'
);

CREATE POLICY "admin_all" ON public.dispatches FOR ALL TO authenticated USING (
  (SELECT role FROM public.profiles WHERE user_id = auth.uid()) = 'admin'
) WITH CHECK (
  (SELECT role FROM public.profiles WHERE user_id = auth.uid()) = 'admin'
);

CREATE POLICY "admin_all" ON public.orders FOR ALL TO authenticated USING (
  (SELECT role FROM public.profiles WHERE user_id = auth.uid()) = 'admin'
) WITH CHECK (
  (SELECT role FROM public.profiles WHERE user_id = auth.uid()) = 'admin'
);

CREATE POLICY "admin_all" ON public.pathao_tokens FOR ALL TO authenticated USING (
  (SELECT role FROM public.profiles WHERE user_id = auth.uid()) = 'admin'
) WITH CHECK (
  (SELECT role FROM public.profiles WHERE user_id = auth.uid()) = 'admin'
);

CREATE POLICY "admin_all" ON public.sync_logs FOR ALL TO authenticated USING (
  (SELECT role FROM public.profiles WHERE user_id = auth.uid()) = 'admin'
) WITH CHECK (
  (SELECT role FROM public.profiles WHERE user_id = auth.uid()) = 'admin'
);

CREATE POLICY "admin_all" ON public.webhook_logs FOR ALL TO authenticated USING (
  (SELECT role FROM public.profiles WHERE user_id = auth.uid()) = 'admin'
) WITH CHECK (
  (SELECT role FROM public.profiles WHERE user_id = auth.uid()) = 'admin'
);

-- Profiles needs a special policy so users can read their own profile on login
CREATE POLICY "users_read_own_profile" ON public.profiles FOR SELECT TO authenticated USING (
  user_id = auth.uid()
);

CREATE POLICY "admin_all_profiles" ON public.profiles FOR ALL TO authenticated USING (
  (SELECT role FROM public.profiles WHERE user_id = auth.uid()) = 'admin'
) WITH CHECK (
  (SELECT role FROM public.profiles WHERE user_id = auth.uid()) = 'admin'
);
