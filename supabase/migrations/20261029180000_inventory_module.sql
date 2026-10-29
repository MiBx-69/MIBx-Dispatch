-- Migration: 20261029180000_inventory_module.sql
-- Description: Complete Inventory & Stock Ledger Management module tables, indexes, views, and functions

-- 1. Create inventory_products table
CREATE TABLE IF NOT EXISTS public.inventory_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_name TEXT NOT NULL,
  sku TEXT,
  style_code TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Create inventory_source_categories table
CREATE TABLE IF NOT EXISTS public.inventory_source_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Create inventory_transactions table
CREATE TABLE IF NOT EXISTS public.inventory_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_number TEXT NOT NULL UNIQUE,
  product_id UUID NOT NULL REFERENCES public.inventory_products(id) ON DELETE RESTRICT,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT')),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  source_category_id UUID REFERENCES public.inventory_source_categories(id) ON DELETE SET NULL,
  source_category_snapshot TEXT,
  stock_out_reason TEXT,
  reference_id TEXT,
  brought_by TEXT,
  received_by TEXT,
  unit_cost NUMERIC(12, 2),
  total_cost NUMERIC(12, 2),
  notes TEXT,
  transaction_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Create inventory_transaction_corrections table
CREATE TABLE IF NOT EXISTS public.inventory_transaction_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_transaction_id UUID NOT NULL REFERENCES public.inventory_transactions(id) ON DELETE RESTRICT,
  correction_transaction_id UUID NOT NULL REFERENCES public.inventory_transactions(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Performance and lookup indexes
CREATE INDEX IF NOT EXISTS idx_inventory_products_name ON public.inventory_products USING btree (product_name);
CREATE INDEX IF NOT EXISTS idx_inventory_products_sku ON public.inventory_products USING btree (sku);
CREATE INDEX IF NOT EXISTS idx_inventory_products_style ON public.inventory_products USING btree (style_code);
CREATE INDEX IF NOT EXISTS idx_inventory_products_status ON public.inventory_products (status);

CREATE INDEX IF NOT EXISTS idx_inventory_tx_product_date ON public.inventory_transactions (product_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_tx_number ON public.inventory_transactions (transaction_number);
CREATE INDEX IF NOT EXISTS idx_inventory_tx_type ON public.inventory_transactions (transaction_type);
CREATE INDEX IF NOT EXISTS idx_inventory_tx_ref ON public.inventory_transactions (reference_id);
CREATE INDEX IF NOT EXISTS idx_inventory_tx_date ON public.inventory_transactions (transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_tx_category ON public.inventory_transactions (source_category_id);
CREATE INDEX IF NOT EXISTS idx_inventory_tx_created_by ON public.inventory_transactions (created_by);

CREATE INDEX IF NOT EXISTS idx_inventory_corrections_orig ON public.inventory_transaction_corrections (original_transaction_id);
CREATE INDEX IF NOT EXISTS idx_inventory_corrections_corr ON public.inventory_transaction_corrections (correction_transaction_id);

-- 6. Real-time Calculated Stock View
CREATE OR REPLACE VIEW public.inventory_product_stock_view 
WITH (security_invoker = true) AS
SELECT
  p.id,
  p.id AS product_id,
  p.product_name,
  p.sku,
  p.style_code,
  p.description,
  p.status,
  p.created_at,
  p.updated_at,
  COALESCE(SUM(CASE WHEN t.transaction_type IN ('STOCK_IN', 'ADJUSTMENT_IN') THEN t.quantity ELSE 0 END), 0)::INT AS total_stock_in,
  COALESCE(SUM(CASE WHEN t.transaction_type IN ('STOCK_OUT', 'ADJUSTMENT_OUT') THEN t.quantity ELSE 0 END), 0)::INT AS total_stock_out,
  (COALESCE(SUM(CASE WHEN t.transaction_type IN ('STOCK_IN', 'ADJUSTMENT_IN') THEN t.quantity ELSE 0 END), 0) -
   COALESCE(SUM(CASE WHEN t.transaction_type IN ('STOCK_OUT', 'ADJUSTMENT_OUT') THEN t.quantity ELSE 0 END), 0))::INT AS current_stock,
  MAX(t.transaction_date) AS last_transaction_date,
  COUNT(t.id)::INT AS transaction_count
FROM public.inventory_products p
LEFT JOIN public.inventory_transactions t ON t.product_id = p.id
GROUP BY p.id;

-- 7. Concurrency-safe atomic transaction function with negative stock prevention
CREATE OR REPLACE FUNCTION public.record_stock_transaction(
  p_product_id UUID,
  p_transaction_type TEXT,
  p_quantity INT,
  p_transaction_number TEXT,
  p_source_category_id UUID DEFAULT NULL,
  p_source_category_snapshot TEXT DEFAULT NULL,
  p_stock_out_reason TEXT DEFAULT NULL,
  p_reference_id TEXT DEFAULT NULL,
  p_brought_by TEXT DEFAULT NULL,
  p_received_by TEXT DEFAULT NULL,
  p_unit_cost NUMERIC(12, 2) DEFAULT NULL,
  p_total_cost NUMERIC(12, 2) DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_transaction_date TIMESTAMPTZ DEFAULT NOW(),
  p_created_by UUID DEFAULT NULL
)
RETURNS public.inventory_transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product RECORD;
  v_current_stock INT;
  v_new_transaction public.inventory_transactions;
BEGIN
  -- 1. Validate quantity
  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'Transaction quantity must be greater than zero. Received: %', p_quantity;
  END IF;

  -- 2. Validate transaction type
  IF p_transaction_type NOT IN ('STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT') THEN
    RAISE EXCEPTION 'Invalid transaction type: %', p_transaction_type;
  END IF;

  -- 3. Lock product row to prevent race conditions
  SELECT id, product_name, status INTO v_product
  FROM public.inventory_products
  WHERE id = p_product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product with id % not found', p_product_id;
  END IF;

  IF v_product.status = 'archived' THEN
    RAISE EXCEPTION 'Cannot record transactions for archived product "%"', v_product.product_name;
  END IF;

  -- 4. Calculate current available stock
  SELECT
    COALESCE(SUM(CASE WHEN transaction_type IN ('STOCK_IN', 'ADJUSTMENT_IN') THEN quantity ELSE -quantity END), 0)
  INTO v_current_stock
  FROM public.inventory_transactions
  WHERE product_id = p_product_id;

  -- 5. Prevent negative inventory for outgoing transactions
  IF p_transaction_type IN ('STOCK_OUT', 'ADJUSTMENT_OUT') THEN
    IF v_current_stock < p_quantity THEN
      RAISE EXCEPTION 'Insufficient stock for product "%": Available stock is %, but requested %',
        v_product.product_name, v_current_stock, p_quantity;
    END IF;
  END IF;

  -- 6. Insert new transaction
  INSERT INTO public.inventory_transactions (
    transaction_number,
    product_id,
    transaction_type,
    quantity,
    source_category_id,
    source_category_snapshot,
    stock_out_reason,
    reference_id,
    brought_by,
    received_by,
    unit_cost,
    total_cost,
    notes,
    transaction_date,
    created_by
  ) VALUES (
    p_transaction_number,
    p_product_id,
    p_transaction_type,
    p_quantity,
    p_source_category_id,
    p_source_category_snapshot,
    p_stock_out_reason,
    p_reference_id,
    p_brought_by,
    p_received_by,
    p_unit_cost,
    p_total_cost,
    p_notes,
    COALESCE(p_transaction_date, NOW()),
    p_created_by
  )
  RETURNING * INTO v_new_transaction;

  -- 7. Touch product updated_at
  UPDATE public.inventory_products
  SET updated_at = NOW()
  WHERE id = p_product_id;

  RETURN v_new_transaction;
END;
$$;

-- 8. Seed default source categories
INSERT INTO public.inventory_source_categories (name, description, is_active)
VALUES
  ('New Arrival', 'Fresh stock arrival from factory or collection', true),
  ('Showroom', 'Products brought in or transferred from physical showroom', true),
  ('Local Market', 'Purchases or acquisitions from local wholesale/retail market', true),
  ('Supplier', 'Direct deliveries from external material or garment supplier', true),
  ('Warehouse', 'Central warehouse transfers and relocations', true),
  ('Returned Stock', 'Returned goods inspected and restored into stock ledger', true),
  ('Other', 'Miscellaneous stock source', true)
ON CONFLICT (name) DO NOTHING;

-- 9. Row Level Security Setup
ALTER TABLE public.inventory_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_source_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transaction_corrections ENABLE ROW LEVEL SECURITY;

-- Read policies: Any authenticated user can read inventory
CREATE POLICY "inventory_products_select" ON public.inventory_products FOR SELECT TO authenticated USING (true);
CREATE POLICY "inventory_categories_select" ON public.inventory_source_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "inventory_transactions_select" ON public.inventory_transactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "inventory_corrections_select" ON public.inventory_transaction_corrections FOR SELECT TO authenticated USING (true);

-- Insert policies: Any authenticated user (staff or admin) can insert products and transactions
CREATE POLICY "inventory_products_insert" ON public.inventory_products FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "inventory_transactions_insert" ON public.inventory_transactions FOR INSERT TO authenticated WITH CHECK (true);

-- Category insert/update: Authenticated admins can modify categories
CREATE POLICY "inventory_categories_insert" ON public.inventory_source_categories FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE profiles.user_id = (select auth.uid()) AND profiles.role = 'admin')
);
CREATE POLICY "inventory_categories_update" ON public.inventory_source_categories FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE profiles.user_id = (select auth.uid()) AND profiles.role = 'admin')
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE profiles.user_id = (select auth.uid()) AND profiles.role = 'admin')
);

-- Product update (e.g. updating SKU, Style Code, archive status)
CREATE POLICY "inventory_products_update" ON public.inventory_products FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Corrections insert: Authenticated users can insert corrections
CREATE POLICY "inventory_corrections_insert" ON public.inventory_transaction_corrections FOR INSERT TO authenticated WITH CHECK (true);

