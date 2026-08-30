-- Add pathao_webhook_secret to app_settings
ALTER TABLE public.app_settings
ADD COLUMN IF NOT EXISTS pathao_webhook_secret TEXT;
