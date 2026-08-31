-- Fix Transactions policies
DROP POLICY IF EXISTS "Admins can view transactions" ON "public"."transactions";
DROP POLICY IF EXISTS "Admins can insert transactions" ON "public"."transactions";
DROP POLICY IF EXISTS "Admins can update transactions" ON "public"."transactions";
DROP POLICY IF EXISTS "Admins can delete transactions" ON "public"."transactions";

CREATE POLICY "Admins can view transactions" 
ON "public"."transactions" 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.user_id = (select auth.uid()) 
    AND profiles.role = 'admin'
  )
);

CREATE POLICY "Admins can insert transactions" 
ON "public"."transactions" 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.user_id = (select auth.uid()) 
    AND profiles.role = 'admin'
  )
);

CREATE POLICY "Admins can update transactions" 
ON "public"."transactions" 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.user_id = (select auth.uid()) 
    AND profiles.role = 'admin'
  )
);

CREATE POLICY "Admins can delete transactions" 
ON "public"."transactions" 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.user_id = (select auth.uid()) 
    AND profiles.role = 'admin'
  )
);

-- Fix previously created admin_all policies
DROP POLICY IF EXISTS "admin_all" ON public.app_settings;
DROP POLICY IF EXISTS "admin_all" ON public.customers;
DROP POLICY IF EXISTS "admin_all" ON public.dispatches;
DROP POLICY IF EXISTS "admin_all" ON public.orders;
DROP POLICY IF EXISTS "admin_all" ON public.pathao_tokens;
DROP POLICY IF EXISTS "admin_all" ON public.sync_logs;
DROP POLICY IF EXISTS "admin_all" ON public.webhook_logs;

CREATE POLICY "admin_all" ON public.app_settings FOR ALL TO authenticated USING (
  (SELECT role FROM public.profiles WHERE user_id = (select auth.uid())) = 'admin'
) WITH CHECK (
  (SELECT role FROM public.profiles WHERE user_id = (select auth.uid())) = 'admin'
);

CREATE POLICY "admin_all" ON public.customers FOR ALL TO authenticated USING (
  (SELECT role FROM public.profiles WHERE user_id = (select auth.uid())) = 'admin'
) WITH CHECK (
  (SELECT role FROM public.profiles WHERE user_id = (select auth.uid())) = 'admin'
);

CREATE POLICY "admin_all" ON public.dispatches FOR ALL TO authenticated USING (
  (SELECT role FROM public.profiles WHERE user_id = (select auth.uid())) = 'admin'
) WITH CHECK (
  (SELECT role FROM public.profiles WHERE user_id = (select auth.uid())) = 'admin'
);

CREATE POLICY "admin_all" ON public.orders FOR ALL TO authenticated USING (
  (SELECT role FROM public.profiles WHERE user_id = (select auth.uid())) = 'admin'
) WITH CHECK (
  (SELECT role FROM public.profiles WHERE user_id = (select auth.uid())) = 'admin'
);

CREATE POLICY "admin_all" ON public.pathao_tokens FOR ALL TO authenticated USING (
  (SELECT role FROM public.profiles WHERE user_id = (select auth.uid())) = 'admin'
) WITH CHECK (
  (SELECT role FROM public.profiles WHERE user_id = (select auth.uid())) = 'admin'
);

CREATE POLICY "admin_all" ON public.sync_logs FOR ALL TO authenticated USING (
  (SELECT role FROM public.profiles WHERE user_id = (select auth.uid())) = 'admin'
) WITH CHECK (
  (SELECT role FROM public.profiles WHERE user_id = (select auth.uid())) = 'admin'
);

CREATE POLICY "admin_all" ON public.webhook_logs FOR ALL TO authenticated USING (
  (SELECT role FROM public.profiles WHERE user_id = (select auth.uid())) = 'admin'
) WITH CHECK (
  (SELECT role FROM public.profiles WHERE user_id = (select auth.uid())) = 'admin'
);

-- Fix profiles policies
DROP POLICY IF EXISTS "users_read_own_profile" ON public.profiles;
DROP POLICY IF EXISTS "admin_all_profiles" ON public.profiles;

CREATE POLICY "users_read_own_profile" ON public.profiles FOR SELECT TO authenticated USING (
  user_id = (select auth.uid())
);

CREATE POLICY "admin_all_profiles" ON public.profiles FOR ALL TO authenticated USING (
  (SELECT role FROM public.profiles WHERE user_id = (select auth.uid())) = 'admin'
) WITH CHECK (
  (SELECT role FROM public.profiles WHERE user_id = (select auth.uid())) = 'admin'
);
