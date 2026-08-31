-- Fix multiple permissive policies on public.profiles

DROP POLICY IF EXISTS "users_read_own_profile" ON public.profiles;
DROP POLICY IF EXISTS "admin_all_profiles" ON public.profiles;

-- Create a helper function to avoid infinite recursion when checking role
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role = 'admin' FROM public.profiles WHERE user_id = auth.uid();
$$;

-- Unified SELECT policy
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT TO authenticated USING (
  user_id = (select auth.uid()) OR (select public.is_admin())
);

-- Admin write policies
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK ((select public.is_admin()));
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE TO authenticated USING ((select public.is_admin())) WITH CHECK ((select public.is_admin()));
CREATE POLICY "profiles_delete" ON public.profiles FOR DELETE TO authenticated USING ((select public.is_admin()));
