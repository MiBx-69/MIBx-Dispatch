-- Migration: 20261029190000_inventory_hardening.sql
-- Description: Lock down ledger writes to the server-side RPC, add idempotency,
-- DB-generated transaction numbers, and ledger immutability.

-- 1. Remove client-side write policies. All writes go through server routes (service role)
--    and the record_stock_transaction RPC, so direct inserts/updates by clients are denied.
DROP POLICY IF EXISTS "inventory_products_insert" ON public.inventory_products;
DROP POLICY IF EXISTS "inventory_products_update" ON public.inventory_products;
DROP POLICY IF EXISTS "inventory_transactions_insert" ON public.inventory_transactions;
DROP POLICY IF EXISTS "inventory_corrections_insert" ON public.inventory_transaction_corrections;
DROP POLICY IF EXISTS "inventory_categories_insert" ON public.inventory_source_categories;
DROP POLICY IF EXISTS "inventory_categories_update" ON public.inventory_source_categories;

-- 2. Idempotency key (prevents duplicate transactions on repeated submits)
ALTER TABLE public.inventory_transactions
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_tx_idempotency
  ON public.inventory_transactions (idempotency_key) WHERE idempotency_key IS NOT NULL;

-- 3. Collision-free transaction numbers
CREATE SEQUENCE IF NOT EXISTS public.inventory_tx_seq START 1;

-- 4. Ledger immutability: original transactions can never be edited or deleted
CREATE OR REPLACE FUNCTION public.inventory_block_ledger_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Inventory ledger records are immutable. Use a correction/reversal transaction instead.';
END;
$$;

DROP TRIGGER IF EXISTS trg_inventory_tx_immutable ON public.inventory_transactions;
CREATE TRIGGER trg_inventory_tx_immutable
  BEFORE UPDATE OR DELETE ON public.inventory_transactions
  FOR EACH ROW EXECUTE FUNCTION public.inventory_block_ledger_mutation();

DROP TRIGGER IF EXISTS trg_inventory_corrections_immutable ON public.inventory_transaction_corrections;
CREATE TRIGGER trg_inventory_corrections_immutable
  BEFORE UPDATE OR DELETE ON public.inventory_transaction_corrections
  FOR EACH ROW EXECUTE FUNCTION public.inventory_block_ledger_mutation();

-- 5. Replace RPC: new signature with idempotency key; number generated in DB
DROP FUNCTION IF EXISTS public.record_stock_transaction(
  UUID, TEXT, INT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TIMESTAMPTZ, UUID
);

CREATE OR REPLACE FUNCTION public.record_stock_transaction(
  p_product_id UUID,
  p_transaction_type TEXT,
  p_quantity INT,
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
  p_created_by UUID DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS public.inventory_transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product RECORD;
  v_current_stock INT;
  v_existing public.inventory_transactions;
  v_new public.inventory_transactions;
  v_number TEXT;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Transaction quantity must be greater than zero. Received: %', p_quantity;
  END IF;

  IF p_transaction_type NOT IN ('STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT') THEN
    RAISE EXCEPTION 'Invalid transaction type: %', p_transaction_type;
  END IF;

  -- Lock the product row: serializes concurrent movements for the same product
  SELECT id, product_name, status INTO v_product
  FROM public.inventory_products
  WHERE id = p_product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product with id % not found', p_product_id;
  END IF;

  -- Idempotency check AFTER taking the lock so concurrent duplicates resolve safely
  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.inventory_transactions WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN v_existing;
    END IF;
  END IF;

  IF v_product.status = 'archived' THEN
    RAISE EXCEPTION 'Cannot record transactions for archived product "%"', v_product.product_name;
  END IF;

  SELECT COALESCE(SUM(CASE WHEN transaction_type IN ('STOCK_IN', 'ADJUSTMENT_IN') THEN quantity ELSE -quantity END), 0)
  INTO v_current_stock
  FROM public.inventory_transactions
  WHERE product_id = p_product_id;

  IF p_transaction_type IN ('STOCK_OUT', 'ADJUSTMENT_OUT') AND v_current_stock < p_quantity THEN
    RAISE EXCEPTION 'Insufficient stock for product "%": Available stock is %, but requested %',
      v_product.product_name, v_current_stock, p_quantity;
  END IF;

  v_number := 'TXN-' ||
    CASE WHEN p_transaction_type IN ('STOCK_IN', 'ADJUSTMENT_IN') THEN 'IN' ELSE 'OUT' END ||
    '-' || to_char(NOW(), 'YYYYMMDD') || '-' || lpad(nextval('public.inventory_tx_seq')::TEXT, 6, '0');

  INSERT INTO public.inventory_transactions (
    transaction_number, product_id, transaction_type, quantity,
    source_category_id, source_category_snapshot, stock_out_reason, reference_id,
    brought_by, received_by, unit_cost, total_cost, notes, transaction_date,
    created_by, idempotency_key
  ) VALUES (
    v_number, p_product_id, p_transaction_type, p_quantity,
    p_source_category_id, p_source_category_snapshot, p_stock_out_reason, p_reference_id,
    p_brought_by, p_received_by, p_unit_cost, p_total_cost, p_notes,
    COALESCE(p_transaction_date, NOW()), p_created_by, p_idempotency_key
  )
  RETURNING * INTO v_new;

  UPDATE public.inventory_products SET updated_at = NOW() WHERE id = p_product_id;

  RETURN v_new;
END;
$$;

-- 6. Only the server (service role) may execute the RPC; never the anon/authenticated roles
REVOKE ALL ON FUNCTION public.record_stock_transaction(
  UUID, TEXT, INT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TIMESTAMPTZ, UUID, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_stock_transaction(
  UUID, TEXT, INT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TIMESTAMPTZ, UUID, TEXT
) TO service_role;

-- 7. Atomic correction: adjustment transaction + audit link in ONE database transaction
CREATE OR REPLACE FUNCTION public.correct_stock_transaction(
  p_original_transaction_id UUID,
  p_action TEXT,
  p_reason TEXT,
  p_new_quantity INT DEFAULT NULL,
  p_created_by UUID DEFAULT NULL
)
RETURNS public.inventory_transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orig public.inventory_transactions;
  v_adj_type TEXT;
  v_adj_qty INT;
  v_is_in BOOLEAN;
  v_diff INT;
  v_adj public.inventory_transactions;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'A reason for correction is required';
  END IF;

  SELECT * INTO v_orig FROM public.inventory_transactions WHERE id = p_original_transaction_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Original transaction not found';
  END IF;

  -- Serialize corrections of the same product and guard against double-correction
  PERFORM 1 FROM public.inventory_products WHERE id = v_orig.product_id FOR UPDATE;

  IF EXISTS (SELECT 1 FROM public.inventory_transaction_corrections WHERE original_transaction_id = p_original_transaction_id) THEN
    RAISE EXCEPTION 'This transaction has already been corrected or reversed';
  END IF;

  IF v_orig.transaction_type LIKE 'ADJUSTMENT_%' THEN
    RAISE EXCEPTION 'Adjustment transactions cannot be corrected again';
  END IF;

  v_is_in := v_orig.transaction_type IN ('STOCK_IN', 'ADJUSTMENT_IN');

  IF p_action = 'reverse' THEN
    v_adj_qty := v_orig.quantity;
    v_adj_type := CASE WHEN v_is_in THEN 'ADJUSTMENT_OUT' ELSE 'ADJUSTMENT_IN' END;
  ELSIF p_action = 'adjust' THEN
    IF p_new_quantity IS NULL OR p_new_quantity < 0 THEN
      RAISE EXCEPTION 'A valid corrected quantity is required';
    END IF;
    v_diff := p_new_quantity - v_orig.quantity;
    IF v_diff = 0 THEN
      RAISE EXCEPTION 'Corrected quantity equals the original quantity';
    END IF;
    v_adj_qty := abs(v_diff);
    -- original IN: more => add, less => remove. original OUT: more => remove, less => add back
    v_adj_type := CASE
      WHEN v_is_in AND v_diff > 0 THEN 'ADJUSTMENT_IN'
      WHEN v_is_in AND v_diff < 0 THEN 'ADJUSTMENT_OUT'
      WHEN NOT v_is_in AND v_diff > 0 THEN 'ADJUSTMENT_OUT'
      ELSE 'ADJUSTMENT_IN'
    END;
  ELSE
    RAISE EXCEPTION 'Invalid correction action: %', p_action;
  END IF;

  -- Reuses the stock-validated insert path (never allows negative stock)
  v_adj := public.record_stock_transaction(
    v_orig.product_id, v_adj_type, v_adj_qty,
    v_orig.source_category_id, v_orig.source_category_snapshot,
    'Correction: ' || trim(p_reason), v_orig.transaction_number,
    NULL, NULL, v_orig.unit_cost, NULL,
    'Correction for ' || v_orig.transaction_number || ': ' || trim(p_reason),
    NOW(), p_created_by, NULL
  );

  INSERT INTO public.inventory_transaction_corrections (
    original_transaction_id, correction_transaction_id, reason, created_by
  ) VALUES (p_original_transaction_id, v_adj.id, trim(p_reason), p_created_by);

  RETURN v_adj;
END;
$$;

REVOKE ALL ON FUNCTION public.correct_stock_transaction(UUID, TEXT, TEXT, INT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.correct_stock_transaction(UUID, TEXT, TEXT, INT, UUID) TO service_role;
