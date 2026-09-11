-- Fix Supabase Database Lint: 0010_security_definer_view
-- Configure dashboard_stats view with security_invoker = true so that RLS policies of querying user are respected
ALTER VIEW public.dashboard_stats SET (security_invoker = true);
