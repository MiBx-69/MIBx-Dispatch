-- Migration: add_delivered_at
-- Adds delivered_at to orders

ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
