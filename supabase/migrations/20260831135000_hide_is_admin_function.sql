-- Move is_admin function out of public schema to avoid PostgREST RPC exposure and Security Advisor warnings

-- 1. Create a private schema for internal helpers if it doesn't exist
CREATE SCHEMA IF NOT EXISTS private;

-- 2. Grant usage to authenticated and service_role
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT USAGE ON SCHEMA private TO service_role;

-- 3. Create the function in the private schema
CREATE OR REPLACE FUNCTION private.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role = 'admin' FROM public.profiles WHERE user_id = auth.uid();
$$;

-- 4. Grant execute
REVOKE ALL ON FUNCTION private.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_admin() TO service_role;

-- 5. Update the RLS policies to use the new private function
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete" ON public.profiles;

CREATE POLICY "profiles_select" ON public.profiles FOR SELECT TO authenticated USING (
  user_id = (select auth.uid()) OR (select private.is_admin())
);
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK ((select private.is_admin()));
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE TO authenticated USING ((select private.is_admin())) WITH CHECK ((select private.is_admin()));
CREATE POLICY "profiles_delete" ON public.profiles FOR DELETE TO authenticated USING ((select private.is_admin()));

-- 6. Drop the old public function
DROP FUNCTION IF EXISTS public.is_admin();
