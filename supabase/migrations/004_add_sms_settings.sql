-- Add SMS integration settings to app_settings
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS sms_api_key TEXT;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS sms_sender_id TEXT DEFAULT 'UNIVERSES';
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS sms_auto_dispatch_enabled BOOLEAN DEFAULT false;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS sms_auto_dispatch_template TEXT;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS sms_auto_delivered_enabled BOOLEAN DEFAULT false;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS sms_auto_delivered_template TEXT;
