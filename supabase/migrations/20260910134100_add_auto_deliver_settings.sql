-- Migration: add_auto_deliver_settings
-- Adds auto_mark_delivered_days to app_settings

ALTER TABLE public.app_settings
ADD COLUMN auto_mark_delivered_days INTEGER DEFAULT 7;
