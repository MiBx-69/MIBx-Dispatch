-- =============================================================================
-- MIBx DISPATCH — ADVANCED PATHAO COURIER INTEGRATION & SHOPIFY SYNCHRONIZATION
-- Migration: 20261030140000_pathao_advanced_integration.sql
-- =============================================================================

-- 1. Enhance public.dispatches with normalized status, timestamps, and sync tracking
ALTER TABLE public.dispatches
  ADD COLUMN IF NOT EXISTS normalized_status TEXT,
  ADD COLUMN IF NOT EXISTS last_pathao_event TEXT,
  ADD COLUMN IF NOT EXISTS last_event_timestamp TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS return_initiated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS returned_to_merchant_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS shopify_fulfillment_id TEXT,
  ADD COLUMN IF NOT EXISTS shopify_sync_status TEXT DEFAULT 'synced',
  ADD COLUMN IF NOT EXISTS shopify_sync_error TEXT,
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS partial_delivery_reconciliation_required BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS partial_delivery_details JSONB,
  ADD COLUMN IF NOT EXISTS paid_return_details JSONB,
  ADD COLUMN IF NOT EXISTS payment_invoice_details JSONB;

CREATE INDEX IF NOT EXISTS idx_dispatches_normalized_status ON public.dispatches(normalized_status);
CREATE INDEX IF NOT EXISTS idx_dispatches_consignment_id ON public.dispatches(consignment_id);
CREATE INDEX IF NOT EXISTS idx_dispatches_merchant_order_id ON public.dispatches(merchant_order_id);
CREATE INDEX IF NOT EXISTS idx_dispatches_shopify_sync_status ON public.dispatches(shopify_sync_status);

-- 2. Enhance public.webhook_logs for durable idempotency, retry tracking & Shopify sync status
ALTER TABLE public.webhook_logs
  ADD COLUMN IF NOT EXISTS merchant_order_id TEXT,
  ADD COLUMN IF NOT EXISTS normalized_event TEXT,
  ADD COLUMN IF NOT EXISTS event_timestamp TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS processing_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS shopify_sync_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS retry_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_retry_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_logs_idempotency_key
  ON public.webhook_logs(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_webhook_logs_processing_status
  ON public.webhook_logs(processing_status);

CREATE INDEX IF NOT EXISTS idx_webhook_logs_pathao_consignment
  ON public.webhook_logs(pathao_consignment_id);

-- 3. Create public.pathao_status_history (immutable parcel event history)
CREATE TABLE IF NOT EXISTS public.pathao_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_id UUID REFERENCES public.dispatches(id) ON DELETE SET NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  consignment_id TEXT NOT NULL,
  merchant_order_id TEXT,
  raw_event TEXT NOT NULL,
  normalized_status TEXT NOT NULL,
  reason TEXT,
  event_timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pathao_status_history_consignment
  ON public.pathao_status_history(consignment_id, event_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_pathao_status_history_order_id
  ON public.pathao_status_history(order_id, event_timestamp DESC);

-- 4. Create public.pathao_payment_invoices (COD settlement & payment invoice ledger)
CREATE TABLE IF NOT EXISTS public.pathao_payment_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consignment_id TEXT NOT NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  dispatch_id UUID REFERENCES public.dispatches(id) ON DELETE SET NULL,
  merchant_order_id TEXT,
  invoice_reference TEXT,
  expected_cod NUMERIC(12,2) NOT NULL DEFAULT 0,
  collected_cod NUMERIC(12,2) NOT NULL DEFAULT 0,
  delivery_charge NUMERIC(12,2) NOT NULL DEFAULT 0,
  return_charge NUMERIC(12,2) NOT NULL DEFAULT 0,
  other_deductions NUMERIC(12,2) NOT NULL DEFAULT 0,
  expected_settlement NUMERIC(12,2) NOT NULL DEFAULT 0,
  actual_received_settlement NUMERIC(12,2) NOT NULL DEFAULT 0,
  settlement_status TEXT NOT NULL DEFAULT 'pending',
  payment_date TIMESTAMPTZ,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pathao_payment_invoices_consignment
  ON public.pathao_payment_invoices(consignment_id);

CREATE INDEX IF NOT EXISTS idx_pathao_payment_invoices_order_id
  ON public.pathao_payment_invoices(order_id);

-- 5. Enable RLS and policies for authenticated/service_role access
ALTER TABLE public.pathao_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pathao_payment_invoices ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'pathao_status_history' AND policyname = 'Authenticated read pathao_status_history'
  ) THEN
    CREATE POLICY "Authenticated read pathao_status_history"
      ON public.pathao_status_history FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'pathao_payment_invoices' AND policyname = 'Authenticated read pathao_payment_invoices'
  ) THEN
    CREATE POLICY "Authenticated read pathao_payment_invoices"
      ON public.pathao_payment_invoices FOR SELECT TO authenticated USING (true);
  END IF;
END
$$;

