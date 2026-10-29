-- Migration: 20261029200000_inventory_views_stats.sql
-- Description: Flat ledger view (powers global search/filter/export across product, staff,
-- category, correction fields) and a DB-side overview stats function (no row-limit issues).

CREATE OR REPLACE VIEW public.inventory_ledger_view
WITH (security_invoker = true) AS
SELECT
  t.id,
  t.transaction_number,
  t.product_id,
  t.transaction_type,
  t.quantity,
  t.source_category_id,
  t.source_category_snapshot,
  t.stock_out_reason,
  t.reference_id,
  t.brought_by,
  t.received_by,
  t.unit_cost,
  t.total_cost,
  t.notes,
  t.transaction_date,
  t.created_by,
  t.created_at,
  p.product_name,
  p.sku,
  p.style_code,
  p.status AS product_status,
  s.full_name AS staff_name,
  c.name AS category_name,
  cor.id AS correction_id,
  cor.reason AS correction_reason,
  cor.created_at AS corrected_at,
  cb.full_name AS corrected_by_name
FROM public.inventory_transactions t
JOIN public.inventory_products p ON p.id = t.product_id
LEFT JOIN public.profiles s ON s.id = t.created_by
LEFT JOIN public.inventory_source_categories c ON c.id = t.source_category_id
LEFT JOIN public.inventory_transaction_corrections cor ON cor.original_transaction_id = t.id
LEFT JOIN public.profiles cb ON cb.id = cor.created_by;

-- Trigram indexes for fast partial, case-insensitive search (pg_trgm already present in this project)
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE INDEX IF NOT EXISTS idx_inv_products_name_trgm ON public.inventory_products USING gin (product_name extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_inv_products_sku_trgm ON public.inventory_products USING gin (sku extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_inv_products_style_trgm ON public.inventory_products USING gin (style_code extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_inv_tx_ref_trgm ON public.inventory_transactions USING gin (reference_id extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_inv_tx_notes_trgm ON public.inventory_transactions USING gin (notes extensions.gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.inventory_overview_stats()
RETURNS TABLE (
  total_products BIGINT,
  total_stock_in BIGINT,
  total_stock_out BIGINT,
  available_stock BIGINT,
  today_stock_in BIGINT,
  today_stock_out BIGINT
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH bounds AS (
    SELECT (date_trunc('day', now() AT TIME ZONE 'Asia/Dhaka') AT TIME ZONE 'Asia/Dhaka') AS day_start
  )
  SELECT
    (SELECT count(*) FROM public.inventory_products WHERE status = 'active'),
    COALESCE(SUM(t.quantity) FILTER (WHERE t.transaction_type IN ('STOCK_IN','ADJUSTMENT_IN')), 0)::BIGINT,
    COALESCE(SUM(t.quantity) FILTER (WHERE t.transaction_type IN ('STOCK_OUT','ADJUSTMENT_OUT')), 0)::BIGINT,
    (COALESCE(SUM(t.quantity) FILTER (WHERE t.transaction_type IN ('STOCK_IN','ADJUSTMENT_IN')), 0)
     - COALESCE(SUM(t.quantity) FILTER (WHERE t.transaction_type IN ('STOCK_OUT','ADJUSTMENT_OUT')), 0))::BIGINT,
    COALESCE(SUM(t.quantity) FILTER (WHERE t.transaction_type IN ('STOCK_IN','ADJUSTMENT_IN') AND t.transaction_date >= b.day_start), 0)::BIGINT,
    COALESCE(SUM(t.quantity) FILTER (WHERE t.transaction_type IN ('STOCK_OUT','ADJUSTMENT_OUT') AND t.transaction_date >= b.day_start), 0)::BIGINT
  FROM public.inventory_transactions t, bounds b;
$$;

