-- Add is_archived column to orders table for hiding/archiving dispatched or unwanted orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_orders_is_archived ON public.orders(is_archived);
