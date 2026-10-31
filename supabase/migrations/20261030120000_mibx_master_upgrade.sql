-- =============================================================================
-- MiBx Dispatch (Universes RAW) — Master Upgrade Migration
-- =============================================================================
-- 1. Non-destructive Order Financial Columns & Backfill
-- 2. Courier Settlement Batches & Parcel-Level Reconciliation Columns
-- 3. Returns Reference ID, Product Value, Quantities, Verification & Missing Return Backfill
-- 4. Expense & Financial Transactions Enhancements (Payment Method, Receipt, Audit Log)
-- 5. Daily Closing & Month-End Closing Tables with Locking & Audit Trail
-- 6. CHECK Constraint Fixes, Asia/Dhaka View Fix, Webhook Idempotency & Performance Indexes
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. ORDERS TABLE ENHANCEMENTS & NON-DESTRUCTIVE BACKFILL
-- =============================================================================
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS original_total_price NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS original_subtotal_price NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS shipping_charge NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'cod',
  ADD COLUMN IF NOT EXISTS cod_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Restore any orders whose total_price and line_items were destructively mutated by partial returns
DO $$
DECLARE
  rec RECORD;
  restored_items JSONB;
  elem JSONB;
  partial_refund_sum NUMERIC(12,2);
BEGIN
  FOR rec IN
    SELECT o.id, o.total_price, o.subtotal_price, o.line_items
    FROM public.orders o
    WHERE o.original_total_price IS NULL
      AND o.line_items IS NOT NULL
      AND o.line_items::text LIKE '%original_quantity%'
  LOOP
    SELECT COALESCE(SUM(COALESCE(r.refund_amount, 0)), 0)
      INTO partial_refund_sum
      FROM public.returns r
      WHERE r.order_id = rec.id
        AND r.return_type = 'partial'
        AND r.is_verified = true;

    restored_items := '[]'::jsonb;
    IF jsonb_typeof(rec.line_items) = 'array' THEN
      FOR elem IN SELECT * FROM jsonb_array_elements(rec.line_items)
      LOOP
        IF elem ? 'original_quantity' THEN
          elem := jsonb_set(elem, '{quantity}', elem->'original_quantity');
        END IF;
        restored_items := restored_items || jsonb_build_array(elem);
      END LOOP;
    ELSE
      restored_items := rec.line_items;
    END IF;

    UPDATE public.orders
       SET total_price = COALESCE(rec.total_price, 0) + partial_refund_sum,
           original_total_price = COALESCE(rec.total_price, 0) + partial_refund_sum,
           original_subtotal_price = COALESCE(rec.subtotal_price, COALESCE(rec.total_price, 0) + partial_refund_sum),
           line_items = restored_items
     WHERE id = rec.id;
  END LOOP;
END $$;

-- Backfill standard financial columns on orders
UPDATE public.orders
SET
  original_total_price = COALESCE(original_total_price, total_price, 0),
  original_subtotal_price = COALESCE(original_subtotal_price, subtotal_price, total_price, 0),
  shipping_charge = CASE
    WHEN shipping_charge IS NULL OR shipping_charge = 0
      THEN GREATEST(0, COALESCE(original_total_price, total_price, 0) - COALESCE(original_subtotal_price, subtotal_price, total_price, 0))
    ELSE shipping_charge
  END,
  payment_method = COALESCE(
    NULLIF(payment_method, ''),
    CASE WHEN LOWER(COALESCE(financial_status, '')) = 'paid' THEN 'prepaid' ELSE 'cod' END
  ),
  cod_amount = COALESCE(
    cod_amount,
    CASE WHEN LOWER(COALESCE(financial_status, '')) = 'paid' THEN 0 ELSE COALESCE(original_total_price, total_price, 0) END
  )
WHERE original_total_price IS NULL
   OR original_subtotal_price IS NULL
   OR cod_amount IS NULL;

-- =============================================================================
-- 2. COURIER SETTLEMENT BATCHES & PARCEL-LEVEL RECONCILIATION
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.courier_settlement_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_reference TEXT UNIQUE NOT NULL,
  courier TEXT NOT NULL DEFAULT 'pathao',
  settlement_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_expected_cod NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_collected_cod NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_delivery_charges NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_return_charges NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_other_deductions NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_settlement_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  actual_received_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  discrepancy_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_method TEXT DEFAULT 'Bank Transfer',
  payment_reference TEXT,
  notes TEXT,
  parcel_count INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.courier_settlement_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "courier_settlement_batches_select_authenticated" ON public.courier_settlement_batches;
CREATE POLICY "courier_settlement_batches_select_authenticated"
  ON public.courier_settlement_batches FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "courier_settlement_batches_write_authenticated" ON public.courier_settlement_batches;
CREATE POLICY "courier_settlement_batches_write_authenticated"
  ON public.courier_settlement_batches FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

ALTER TABLE public.dispatches
  ADD COLUMN IF NOT EXISTS expected_cod NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS actual_cod_collected NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS return_charge NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_deductions NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS settlement_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_received_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS settlement_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_reference TEXT,
  ADD COLUMN IF NOT EXISTS settlement_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS settlement_notes TEXT,
  ADD COLUMN IF NOT EXISTS settlement_batch_id UUID REFERENCES public.courier_settlement_batches(id) ON DELETE SET NULL;

-- Backfill dispatches expected_cod and actual_cod_collected
UPDATE public.dispatches
SET
  expected_cod = COALESCE(expected_cod, amount_to_collect, 0),
  actual_cod_collected = CASE
    WHEN actual_cod_collected = 0 AND LOWER(COALESCE(pathao_order_status, '')) = 'delivered'
      THEN COALESCE(amount_to_collect, 0)
    ELSE actual_cod_collected
  END,
  settlement_amount = CASE
    WHEN settlement_amount = 0 AND LOWER(COALESCE(pathao_order_status, '')) = 'delivered'
      THEN GREATEST(0, COALESCE(amount_to_collect, 0) - COALESCE(delivery_fee, 0) - COALESCE(return_charge, 0) - COALESCE(other_deductions, 0))
    ELSE settlement_amount
  END
WHERE expected_cod IS NULL
   OR (actual_cod_collected = 0 AND LOWER(COALESCE(pathao_order_status, '')) = 'delivered');

-- =============================================================================
-- 3. RETURNS ENHANCEMENTS, CHECK CONSTRAINTS & MISSING PATHAO RETURNS BACKFILL
-- =============================================================================
-- Fix CHECK constraints on returns.return_source, sync_logs.sync_type, webhook_logs.source
ALTER TABLE public.returns DROP CONSTRAINT IF EXISTS returns_return_source_check;
ALTER TABLE public.returns
  ADD CONSTRAINT returns_return_source_check
  CHECK (return_source IN ('pathao_webhook', 'manual', 'shopify_webhook', 'cron_sync', 'pathao_sync'));

ALTER TABLE public.sync_logs DROP CONSTRAINT IF EXISTS sync_logs_sync_type_check;
ALTER TABLE public.sync_logs
  ADD CONSTRAINT sync_logs_sync_type_check
  CHECK (sync_type IN ('full_shopify', 'incremental_shopify', 'delta_shopify', 'pathao_status', 'sales_analytics'));

ALTER TABLE public.webhook_logs DROP CONSTRAINT IF EXISTS webhook_logs_source_check;
ALTER TABLE public.webhook_logs
  ADD CONSTRAINT webhook_logs_source_check
  CHECK (source IN ('shopify', 'pathao', 'sms', 'cron'));

CREATE SEQUENCE IF NOT EXISTS public.return_ref_seq START WITH 1001 INCREMENT BY 1;

ALTER TABLE public.returns
  ADD COLUMN IF NOT EXISTS return_reference TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS original_order_quantity INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS returned_quantity INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS returned_product_value NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'verified',
  ADD COLUMN IF NOT EXISTS staff_responsible TEXT,
  ADD COLUMN IF NOT EXISTS audit_history JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE OR REPLACE FUNCTION public.generate_return_reference()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  date_part TEXT;
  seq_num BIGINT;
BEGIN
  IF NEW.return_reference IS NULL OR BTRIM(NEW.return_reference) = '' THEN
    date_part := to_char(COALESCE(NEW.returned_at, NEW.created_at, now()) AT TIME ZONE 'Asia/Dhaka', 'YYYYMMDD');
    seq_num := nextval('public.return_ref_seq');
    NEW.return_reference := 'RET-' || date_part || '-' || LPAD(seq_num::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_generate_return_reference ON public.returns;
CREATE TRIGGER trg_generate_return_reference
  BEFORE INSERT ON public.returns
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_return_reference();

-- Backfill return_reference and returned_product_value on existing returns
UPDATE public.returns r
SET
  return_reference = COALESCE(
    r.return_reference,
    'RET-' || to_char(COALESCE(r.returned_at, r.created_at, now()) AT TIME ZONE 'Asia/Dhaka', 'YYYYMMDD') || '-' || LPAD(nextval('public.return_ref_seq')::text, 5, '0')
  ),
  verification_status = CASE
    WHEN r.is_verified = false THEN 'unverified'
    ELSE 'verified'
  END,
  returned_product_value = CASE
    WHEN COALESCE(r.returned_product_value, 0) > 0 THEN r.returned_product_value
    WHEN r.return_type = 'full' THEN COALESCE(r.refund_amount, r.order_total, 0)
    WHEN r.is_verified = true THEN COALESCE(r.refund_amount, 0)
    ELSE 0
  END
WHERE r.return_reference IS NULL
   OR COALESCE(r.returned_product_value, 0) = 0;

-- Backfill missing returns rows for orders marked internal_status = 'returned' (from Pathao webhook/cron bug)
INSERT INTO public.returns (
  order_id,
  dispatch_id,
  consignment_id,
  return_reason,
  return_type,
  return_source,
  returned_items,
  order_total,
  return_delivery_fee,
  refund_amount,
  returned_product_value,
  original_order_quantity,
  returned_quantity,
  is_paid_return,
  is_verified,
  verification_status,
  status,
  returned_at,
  processed_at,
  created_at
)
SELECT
  o.id AS order_id,
  (
    SELECT d.id
    FROM public.dispatches d
    WHERE d.order_id = o.id AND COALESCE(d.is_cancelled, false) = false
    ORDER BY d.dispatched_at DESC
    LIMIT 1
  ) AS dispatch_id,
  o.pathao_consignment_id AS consignment_id,
  COALESCE(
    NULLIF(o.return_reason, ''),
    CASE
      WHEN LOWER(COALESCE(o.pathao_delivery_status, '')) = 'paid return' THEN 'Paid Return via Courier'
      ELSE 'Customer refused'
    END
  ) AS return_reason,
  'full' AS return_type,
  'pathao_webhook' AS return_source,
  COALESCE(o.line_items, '[]'::jsonb) AS returned_items,
  COALESCE(o.original_total_price, o.total_price, 0) AS order_total,
  CASE
    WHEN LOWER(COALESCE(o.pathao_delivery_status, '')) = 'paid return' THEN 0
    WHEN COALESCE(o.return_delivery_fee, 0) > 0 THEN o.return_delivery_fee
    ELSE 110
  END AS return_delivery_fee,
  COALESCE(o.original_subtotal_price, o.subtotal_price, o.total_price, 0) AS refund_amount,
  COALESCE(o.original_subtotal_price, o.subtotal_price, o.total_price, 0) AS returned_product_value,
  GREATEST(1, COALESCE((
    SELECT SUM(COALESCE((item->>'quantity')::int, 1))
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(o.line_items) = 'array' THEN o.line_items ELSE '[]'::jsonb END
    ) AS item
  ), 1)) AS original_order_quantity,
  GREATEST(1, COALESCE((
    SELECT SUM(COALESCE((item->>'quantity')::int, 1))
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(o.line_items) = 'array' THEN o.line_items ELSE '[]'::jsonb END
    ) AS item
  ), 1)) AS returned_quantity,
  (LOWER(COALESCE(o.pathao_delivery_status, '')) = 'paid return') AS is_paid_return,
  true AS is_verified,
  'verified' AS verification_status,
  'received' AS status,
  COALESCE(o.returned_at, o.updated_at, o.created_at, now()) AS returned_at,
  COALESCE(o.returned_at, o.updated_at, o.created_at, now()) AS processed_at,
  COALESCE(o.returned_at, o.updated_at, o.created_at, now()) AS created_at
FROM public.orders o
WHERE o.internal_status = 'returned'
  AND COALESCE(o.is_archived, false) = false
  AND NOT EXISTS (
    SELECT 1 FROM public.returns r WHERE r.order_id = o.id
  );

-- =============================================================================
-- 4. TRANSACTIONS (EXPENSE & FINANCE) ENHANCEMENTS
-- =============================================================================
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'Cash',
  ADD COLUMN IF NOT EXISTS receipt_url TEXT,
  ADD COLUMN IF NOT EXISTS reference_id TEXT,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS is_courier_charge BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS audit_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- =============================================================================
-- 5. DAILY CLOSING & MONTH-END CLOSING TABLES
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.daily_closings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  closing_date DATE UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'locked')),
  metrics_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  prepared_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  prepared_by_name TEXT,
  approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_by_name TEXT,
  approved_at TIMESTAMPTZ,
  audit_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.daily_closings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "daily_closings_select_authenticated" ON public.daily_closings;
CREATE POLICY "daily_closings_select_authenticated"
  ON public.daily_closings FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "daily_closings_write_authenticated" ON public.daily_closings;
CREATE POLICY "daily_closings_write_authenticated"
  ON public.daily_closings FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.monthly_closings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year INT NOT NULL,
  month INT NOT NULL CHECK (month BETWEEN 1 AND 12),
  period_key TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'approved', 'locked', 'reopened')),
  validation_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  statement_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_by_name TEXT,
  approved_at TIMESTAMPTZ,
  locked_at TIMESTAMPTZ,
  reopened_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reopened_by_name TEXT,
  reopened_at TIMESTAMPTZ,
  reopen_reason TEXT,
  audit_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.monthly_closings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "monthly_closings_select_authenticated" ON public.monthly_closings;
CREATE POLICY "monthly_closings_select_authenticated"
  ON public.monthly_closings FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "monthly_closings_write_authenticated" ON public.monthly_closings;
CREATE POLICY "monthly_closings_write_authenticated"
  ON public.monthly_closings FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- 6. ASIA/DHAKA VIEW FIX, WEBHOOK IDEMPOTENCY & PERFORMANCE INDEXES
-- =============================================================================
CREATE OR REPLACE VIEW public.dashboard_stats WITH (security_invoker = true) AS
SELECT
  COUNT(*) FILTER (WHERE internal_status = 'pending') AS pending_orders,
  COUNT(*) FILTER (WHERE internal_status = 'preparing') AS preparing_orders,
  COUNT(*) FILTER (WHERE internal_status = 'dispatched') AS dispatched_orders,
  COUNT(*) FILTER (WHERE internal_status = 'delivered') AS delivered_orders,
  COUNT(*) FILTER (WHERE internal_status = 'hold') AS hold_orders,
  COUNT(*) FILTER (WHERE internal_status = 'cancelled') AS cancelled_orders,
  COUNT(*) FILTER (WHERE internal_status = 'returned') AS returned_orders,
  COALESCE(SUM(COALESCE(original_total_price, total_price)) FILTER (WHERE internal_status = 'returned'), 0)
    + COALESCE((SELECT SUM(COALESCE(returned_product_value, refund_amount, 0)) FROM public.returns WHERE return_type = 'partial' AND is_verified = true), 0)
    AS returned_revenue,
  COALESCE(SUM(return_delivery_fee) FILTER (WHERE internal_status = 'returned'), 0) AS total_return_fees,
  COUNT(*) FILTER (WHERE (shopify_created_at AT TIME ZONE 'Asia/Dhaka')::date = (NOW() AT TIME ZONE 'Asia/Dhaka')::date) AS orders_today,
  COUNT(*) FILTER (WHERE internal_status = 'dispatched' AND (updated_at AT TIME ZONE 'Asia/Dhaka')::date = (NOW() AT TIME ZONE 'Asia/Dhaka')::date) AS dispatched_today,
  COALESCE(SUM(COALESCE(original_total_price, total_price)) FILTER (WHERE (shopify_created_at AT TIME ZONE 'Asia/Dhaka')::date = (NOW() AT TIME ZONE 'Asia/Dhaka')::date), 0) AS revenue_today
FROM public.orders;

ALTER TABLE public.webhook_logs
  ADD COLUMN IF NOT EXISTS webhook_id TEXT;

CREATE INDEX IF NOT EXISTS idx_webhook_logs_webhook_id
  ON public.webhook_logs(webhook_id)
  WHERE webhook_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_shopify_created_at
  ON public.orders(shopify_created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_delivered_at
  ON public.orders(delivered_at DESC)
  WHERE delivered_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_returned_at
  ON public.orders(returned_at DESC)
  WHERE returned_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dispatches_settlement_status
  ON public.dispatches(settlement_status, dispatched_at DESC);

CREATE INDEX IF NOT EXISTS idx_returns_returned_at
  ON public.returns(returned_at DESC);

CREATE INDEX IF NOT EXISTS idx_returns_order_id_type
  ON public.returns(order_id, return_type);

CREATE INDEX IF NOT EXISTS idx_transactions_date_type
  ON public.transactions(date DESC, type);

COMMIT;
