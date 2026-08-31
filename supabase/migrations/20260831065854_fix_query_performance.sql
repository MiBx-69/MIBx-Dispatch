-- Add index for total_orders as suggested by Supabase Query Performance Advisor
CREATE INDEX IF NOT EXISTS idx_customers_total_orders ON public.customers USING btree (total_orders);
