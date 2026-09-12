-- Allow 'sms' and 'system' in webhook_logs source check constraint
ALTER TABLE public.webhook_logs DROP CONSTRAINT IF EXISTS webhook_logs_source_check;
ALTER TABLE public.webhook_logs ADD CONSTRAINT webhook_logs_source_check CHECK (source IN ('shopify', 'pathao', 'sms', 'system'));
