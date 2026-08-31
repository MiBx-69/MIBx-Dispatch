-- Migration to add 'partial' to internal_status check constraint

-- 1. Drop the existing check constraint for internal_status
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_internal_status_check;

-- 2. Add the new check constraint including 'partial'
ALTER TABLE public.orders ADD CONSTRAINT orders_internal_status_check 
CHECK (internal_status IN ('pending','preparing','hold','cancelled','dispatched','delivered','delayed','returned','partial'));
