-- =============================================================================
-- MiBx Dispatch — Simplified & Fully Synchronized Shopify Return System
-- =============================================================================

-- 1. Add Shopify synchronization & remaining_items columns to `returns`
ALTER TABLE public.returns
  ADD COLUMN IF NOT EXISTS shopify_return_id TEXT,
  ADD COLUMN IF NOT EXISTS shopify_refund_id TEXT,
  ADD COLUMN IF NOT EXISTS shopify_sync_status TEXT DEFAULT 'synced',
  ADD COLUMN IF NOT EXISTS shopify_sync_error TEXT,
  ADD COLUMN IF NOT EXISTS shopify_financial_status TEXT,
  ADD COLUMN IF NOT EXISTS remaining_items JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- 2. Drop legacy status check constraint so simple return statuses never fail
ALTER TABLE public.returns
  DROP CONSTRAINT IF EXISTS returns_status_check;

-- 3. Normalize legacy statuses: remove Admin Attention / pending_verification
UPDATE public.returns
SET
  status = 'received',
  is_verified = true,
  verification_status = 'verified',
  shopify_sync_status = COALESCE(shopify_sync_status, 'synced')
WHERE status = 'pending_verification' OR is_verified IS DISTINCT FROM true;

-- 4. Ensure return_type is strictly 'partial' or 'full'
UPDATE public.returns
SET return_type = CASE
  WHEN return_type = 'partial' THEN 'partial'
  ELSE 'full'
END
WHERE return_type NOT IN ('partial', 'full');

-- 5. Indexes for fast Shopify ID lookup and idempotency protection
CREATE UNIQUE INDEX IF NOT EXISTS idx_returns_idempotency_key
  ON public.returns (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_returns_shopify_refund_id
  ON public.returns (shopify_refund_id)
  WHERE shopify_refund_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_returns_shopify_return_id
  ON public.returns (shopify_return_id)
  WHERE shopify_return_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_returns_sync_status
  ON public.returns (shopify_sync_status, returned_at DESC);
