-- Migration: 20261031120000_dispatch_claims_and_telemetry.sql
-- 1. Create dispatch_claims table for atomic concurrency protection against duplicate consignments
CREATE TABLE IF NOT EXISTS public.dispatch_claims (
  order_id UUID PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'in_progress',
  consignment_id TEXT,
  error_message TEXT,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '2 minutes')
);

CREATE INDEX IF NOT EXISTS idx_dispatch_claims_status_expires
  ON public.dispatch_claims(status, expires_at);

-- Enable RLS
ALTER TABLE public.dispatch_claims ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service and authenticated read dispatch_claims" ON public.dispatch_claims;
CREATE POLICY "Service and authenticated read dispatch_claims"
  ON public.dispatch_claims FOR SELECT
  TO authenticated, service_role
  USING (true);

DROP POLICY IF EXISTS "Service and authenticated manage dispatch_claims" ON public.dispatch_claims;
CREATE POLICY "Service and authenticated manage dispatch_claims"
  ON public.dispatch_claims FOR ALL
  TO authenticated, service_role
  USING (true)
  WITH CHECK (true);

-- 2. Add composite indexes on dispatches for fast sorting, pagination and filtering
CREATE INDEX IF NOT EXISTS idx_dispatches_dispatched_at_id
  ON public.dispatches(dispatched_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_dispatches_normalized_status
  ON public.dispatches(normalized_status)
  WHERE is_cancelled = false;

CREATE INDEX IF NOT EXISTS idx_pathao_payment_invoices_actual_settlement
  ON public.pathao_payment_invoices(actual_received_settlement)
  WHERE actual_received_settlement IS NOT NULL;

