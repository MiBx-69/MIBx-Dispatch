-- Returns Management & Accurate Month-End Reporting
-- Migration: Add return tracking to orders + dedicated returns table

-- ─── Add return tracking columns to orders ──────────────────────────────────
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS returned_at TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS return_reason TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS return_delivery_fee DECIMAL(8,2) DEFAULT 0;

-- ─── Returns Table (detailed audit trail per return) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id),
  dispatch_id UUID REFERENCES public.dispatches(id),
  consignment_id TEXT,
  -- Return details
  return_reason TEXT,
  return_type TEXT NOT NULL DEFAULT 'full'
    CHECK (return_type IN ('full', 'partial', 'exchange')),
  return_source TEXT NOT NULL DEFAULT 'pathao_webhook'
    CHECK (return_source IN ('pathao_webhook', 'manual', 'shopify_webhook')),
  returned_items JSONB, -- Array of items and quantities returned
  -- Financials
  order_total DECIMAL(12,2) DEFAULT 0,
  return_delivery_fee DECIMAL(8,2) DEFAULT 0,
  refund_amount DECIMAL(12,2) DEFAULT 0,
  is_verified BOOLEAN NOT NULL DEFAULT true, -- Admin verification flag
  -- Who processed it
  processed_by UUID REFERENCES public.profiles(id),
  -- Status pipeline: pending_verification → in_transit → received → inspected → restocked/damaged
  status TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN ('pending_verification', 'in_transit', 'received', 'inspected', 'restocked', 'damaged')),
  notes TEXT,
  -- Timestamps
  returned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_returns_order_id ON public.returns(order_id);
CREATE INDEX IF NOT EXISTS idx_returns_returned_at ON public.returns(returned_at DESC);
CREATE INDEX IF NOT EXISTS idx_returns_status ON public.returns(status);
CREATE INDEX IF NOT EXISTS idx_returns_source ON public.returns(return_source);

-- Index on orders.returned_at for efficient report queries
CREATE INDEX IF NOT EXISTS idx_orders_returned_at ON public.orders(returned_at DESC)
  WHERE returned_at IS NOT NULL;

-- Row Level Security
ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all" ON public.returns
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Updated_at trigger
CREATE OR REPLACE TRIGGER set_returns_updated_at
  BEFORE UPDATE ON public.returns
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- ─── Update dashboard_stats view to include returned metrics ─────────────────
DROP VIEW IF EXISTS public.dashboard_stats;
CREATE VIEW public.dashboard_stats AS
SELECT
  COUNT(*) FILTER (WHERE internal_status = 'pending') AS pending_orders,
  COUNT(*) FILTER (WHERE internal_status = 'preparing') AS preparing_orders,
  COUNT(*) FILTER (WHERE internal_status = 'dispatched') AS dispatched_orders,
  COUNT(*) FILTER (WHERE internal_status = 'delivered') AS delivered_orders,
  COUNT(*) FILTER (WHERE internal_status = 'hold') AS hold_orders,
  COUNT(*) FILTER (WHERE internal_status = 'cancelled') AS cancelled_orders,
  COUNT(*) FILTER (WHERE internal_status = 'returned') AS returned_orders,
  COALESCE(SUM(total_price) FILTER (WHERE internal_status = 'returned'), 0) AS returned_revenue,
  COALESCE(SUM(return_delivery_fee) FILTER (WHERE internal_status = 'returned'), 0) AS total_return_fees,
  COUNT(*) FILTER (WHERE DATE(shopify_created_at) = CURRENT_DATE) AS orders_today,
  COUNT(*) FILTER (WHERE internal_status = 'dispatched' AND DATE(updated_at) = CURRENT_DATE) AS dispatched_today,
  COALESCE(SUM(total_price) FILTER (WHERE DATE(shopify_created_at) = CURRENT_DATE), 0) AS revenue_today
FROM public.orders;

-- Enable realtime for returns table
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE returns;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
