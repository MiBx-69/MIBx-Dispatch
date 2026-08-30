-- MiBx-Dispatch ERP — Supabase Database Schema
-- Run this in your Supabase SQL Editor or via supabase db push

-- ─── Enable UUID extension ───────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- for fuzzy search

-- ─── Profiles (extends Supabase auth.users) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'staff')),
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (new.id, new.raw_user_meta_data->>'full_name');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ─── App Settings (single row — system config) ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.app_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  system_name TEXT NOT NULL DEFAULT 'MiBx Dispatch',
  -- Shopify
  shopify_shop_domain TEXT,           -- e.g. mystore.myshopify.com
  shopify_access_token TEXT,          -- shpat_xxxx (encrypted at rest by Supabase Vault in prod)
  shopify_webhook_secret TEXT,
  shopify_api_version TEXT DEFAULT '2026-07',
  -- Pathao
  pathao_client_id TEXT,
  pathao_client_secret TEXT,
  pathao_username TEXT,
  pathao_password TEXT,
  pathao_store_id INTEGER,
  pathao_base_url TEXT DEFAULT 'https://api-hermes.pathao.com',
  -- Fraud
  fraudspy_api_key TEXT,
  fraud_check_enabled BOOLEAN DEFAULT FALSE,
  -- Notifications
  notification_email TEXT,
  -- Meta
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert default settings row
INSERT INTO public.app_settings (id) VALUES (uuid_generate_v4())
ON CONFLICT DO NOTHING;

-- ─── Customers (synced from Shopify) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shopify_customer_id BIGINT UNIQUE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  default_address JSONB,              -- {address1, city, province, zip, country}
  total_orders INTEGER DEFAULT 0,
  total_spent DECIMAL(12,2) DEFAULT 0,
  currency TEXT DEFAULT 'BDT',
  shopify_tags TEXT[] DEFAULT '{}',
  -- Marketing (architecture ready — implement later)
  sms_opt_in BOOLEAN DEFAULT FALSE,
  email_opt_in BOOLEAN DEFAULT FALSE,
  whatsapp_opt_in BOOLEAN DEFAULT FALSE,
  marketing_tags TEXT[] DEFAULT '{}',
  -- Meta
  shopify_created_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_customers_shopify_id ON public.customers(shopify_customer_id);
CREATE INDEX idx_customers_phone ON public.customers(phone);
CREATE INDEX idx_customers_email ON public.customers(email);
CREATE INDEX idx_customers_name_trgm ON public.customers USING gin(name gin_trgm_ops);

-- ─── Orders (synced from Shopify) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shopify_order_id BIGINT UNIQUE NOT NULL,
  shopify_order_name TEXT NOT NULL,         -- "#1001"
  shopify_order_number INTEGER,
  -- Customer info (denormalized for speed)
  customer_id UUID REFERENCES public.customers(id),
  customer_shopify_id BIGINT,
  customer_name TEXT NOT NULL DEFAULT 'Unknown',
  customer_phone TEXT,
  customer_email TEXT,
  -- Shipping
  shipping_address JSONB,                   -- full address object
  -- Items
  line_items JSONB NOT NULL DEFAULT '[]',   -- [{title, qty, price, weight, variant, sku}]
  -- Financials
  total_price DECIMAL(12,2) DEFAULT 0,
  subtotal_price DECIMAL(12,2) DEFAULT 0,
  total_tax DECIMAL(12,2) DEFAULT 0,
  currency TEXT DEFAULT 'BDT',
  -- Status (from Shopify)
  financial_status TEXT,                    -- paid | pending | refunded | voided
  fulfillment_status TEXT,                  -- null | partial | fulfilled | restocked
  shopify_tags TEXT[] DEFAULT '{}',
  -- Internal ERP status
  internal_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (internal_status IN ('pending','preparing','hold','cancelled','dispatched','delivered','delayed','returned')),
  -- Pathao dispatch info
  pathao_consignment_id TEXT,
  pathao_tracking_url TEXT,
  pathao_delivery_status TEXT,              -- Pending | Picked Up | In Transit | Delivered | Return...
  shopify_fulfillment_id TEXT,
  -- Fraud
  fraud_score INTEGER,
  fraud_status TEXT CHECK (fraud_status IN ('safe','risky','fraud','unchecked')),
  fraud_data JSONB,
  -- Notes
  note TEXT,
  cancel_reason TEXT,
  -- Timestamps
  shopify_created_at TIMESTAMPTZ,
  shopify_updated_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_orders_shopify_id ON public.orders(shopify_order_id);
CREATE INDEX idx_orders_internal_status ON public.orders(internal_status);
CREATE INDEX idx_orders_financial_status ON public.orders(financial_status);
CREATE INDEX idx_orders_created_at ON public.orders(shopify_created_at DESC);
CREATE INDEX idx_orders_customer_name_trgm ON public.orders USING gin(customer_name gin_trgm_ops);
CREATE INDEX idx_orders_customer_phone ON public.orders(customer_phone);
CREATE INDEX idx_orders_pathao_id ON public.orders(pathao_consignment_id);

-- ─── Dispatches (Pathao dispatch records) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dispatches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES public.orders(id),
  shopify_order_id BIGINT NOT NULL,
  shopify_order_name TEXT,
  -- Pathao response
  consignment_id TEXT UNIQUE NOT NULL,
  merchant_order_id TEXT,
  pathao_order_status TEXT DEFAULT 'Pending',
  delivery_fee DECIMAL(8,2),
  -- Dispatch details snapshot (what was sent to Pathao)
  recipient_name TEXT,
  recipient_phone TEXT,
  recipient_address TEXT,
  recipient_city INTEGER,
  recipient_zone INTEGER,
  amount_to_collect DECIMAL(12,2) DEFAULT 0,
  item_weight DECIMAL(5,2) DEFAULT 0.5,
  item_quantity INTEGER DEFAULT 1,
  delivery_type INTEGER DEFAULT 48,        -- 48=Normal, 12=OnDemand
  item_type INTEGER DEFAULT 2,             -- 1=Document, 2=Parcel
  item_description TEXT,
  -- Full Pathao API response
  pathao_response JSONB,
  -- Tracking updates (array of status events)
  tracking_history JSONB DEFAULT '[]',
  -- Who dispatched
  dispatched_by UUID REFERENCES public.profiles(id),
  is_cancelled BOOLEAN DEFAULT FALSE,
  cancel_reason TEXT,
  cancelled_at TIMESTAMPTZ,
  -- Timestamps
  dispatched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dispatches_order_id ON public.dispatches(order_id);
CREATE INDEX idx_dispatches_consignment ON public.dispatches(consignment_id);
CREATE INDEX idx_dispatches_status ON public.dispatches(pathao_order_status);
CREATE INDEX idx_dispatches_date ON public.dispatches(dispatched_at DESC);

-- ─── Webhook Logs ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.webhook_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source TEXT NOT NULL CHECK (source IN ('shopify', 'pathao')),
  topic TEXT,
  shopify_order_id BIGINT,
  pathao_consignment_id TEXT,
  payload JSONB,
  processed BOOLEAN DEFAULT FALSE,
  error TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhook_logs_source ON public.webhook_logs(source);
CREATE INDEX idx_webhook_logs_received ON public.webhook_logs(received_at DESC);

-- ─── Sync Logs ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sync_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sync_type TEXT NOT NULL CHECK (sync_type IN ('full_shopify', 'incremental_shopify', 'pathao_status')),
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  orders_synced INTEGER DEFAULT 0,
  customers_synced INTEGER DEFAULT 0,
  errors INTEGER DEFAULT 0,
  error_details TEXT,
  triggered_by UUID REFERENCES public.profiles(id),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- ─── Pathao Token Cache (persisted for restarts) ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.pathao_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Updated_at Trigger Helper ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER set_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
CREATE OR REPLACE TRIGGER set_customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
CREATE OR REPLACE TRIGGER set_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
CREATE OR REPLACE TRIGGER set_dispatches_updated_at BEFORE UPDATE ON public.dispatches FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
CREATE OR REPLACE TRIGGER set_app_settings_updated_at BEFORE UPDATE ON public.app_settings FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- ─── Row Level Security ───────────────────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pathao_tokens ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read/write everything (internal tool — no public access)
CREATE POLICY "authenticated_all" ON public.profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON public.orders FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON public.customers FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON public.dispatches FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON public.app_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON public.webhook_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON public.sync_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON public.pathao_tokens FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Service role (used by API routes) can bypass RLS
-- (Supabase service role key bypasses RLS by default)

-- ─── Useful Views ─────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.orders_with_dispatch AS
SELECT
  o.*,
  d.consignment_id,
  d.pathao_order_status AS dispatch_status,
  d.delivery_fee,
  d.dispatched_at,
  d.is_cancelled AS dispatch_cancelled
FROM public.orders o
LEFT JOIN public.dispatches d ON d.order_id = o.id AND d.is_cancelled = FALSE;

-- Dashboard stats view
CREATE OR REPLACE VIEW public.dashboard_stats AS
SELECT
  COUNT(*) FILTER (WHERE internal_status = 'pending') AS pending_orders,
  COUNT(*) FILTER (WHERE internal_status = 'preparing') AS preparing_orders,
  COUNT(*) FILTER (WHERE internal_status = 'dispatched') AS dispatched_orders,
  COUNT(*) FILTER (WHERE internal_status = 'delivered') AS delivered_orders,
  COUNT(*) FILTER (WHERE internal_status = 'hold') AS hold_orders,
  COUNT(*) FILTER (WHERE internal_status = 'cancelled') AS cancelled_orders,
  COUNT(*) FILTER (WHERE DATE(shopify_created_at) = CURRENT_DATE) AS orders_today,
  COUNT(*) FILTER (WHERE internal_status = 'dispatched' AND DATE(updated_at) = CURRENT_DATE) AS dispatched_today,
  COALESCE(SUM(total_price) FILTER (WHERE DATE(shopify_created_at) = CURRENT_DATE), 0) AS revenue_today
FROM public.orders;
