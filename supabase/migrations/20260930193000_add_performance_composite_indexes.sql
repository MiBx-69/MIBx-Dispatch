-- Migration: 20260930193000_add_performance_composite_indexes.sql
-- Description: Composite covering indexes for high-throughput ERP order filtering and courier sync

-- 1. Orders composite index for active dashboard view (is_archived, internal_status, created_at)
CREATE INDEX IF NOT EXISTS idx_orders_archived_status_created 
  ON public.orders (is_archived, internal_status, shopify_created_at DESC);

-- 2. Dispatches composite index for active shipments and courier sync
CREATE INDEX IF NOT EXISTS idx_dispatches_active_status_dispatched 
  ON public.dispatches (is_cancelled, pathao_order_status, dispatched_at DESC);

-- 3. Webhook logs index for quick source/status lookups
CREATE INDEX IF NOT EXISTS idx_webhook_logs_source_received 
  ON public.webhook_logs (source, received_at DESC);
