-- Add GIN trigram indexes for fast ILIKE text search across the ERP
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- Orders Table
CREATE INDEX IF NOT EXISTS idx_orders_shopify_name_trgm ON public.orders USING gin(shopify_order_name extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_orders_customer_phone_trgm ON public.orders USING gin(customer_phone extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_orders_consignment_id_trgm ON public.orders USING gin(pathao_consignment_id extensions.gin_trgm_ops);

-- Dispatches Table
CREATE INDEX IF NOT EXISTS idx_dispatches_consignment_id_trgm ON public.dispatches USING gin(consignment_id extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_dispatches_recipient_phone_trgm ON public.dispatches USING gin(recipient_phone extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_dispatches_shopify_name_trgm ON public.dispatches USING gin(shopify_order_name extensions.gin_trgm_ops);

-- Customers Table
CREATE INDEX IF NOT EXISTS idx_customers_name_trgm ON public.customers USING gin(name extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_customers_phone_trgm ON public.customers USING gin(phone extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_customers_email_trgm ON public.customers USING gin(email extensions.gin_trgm_ops);
