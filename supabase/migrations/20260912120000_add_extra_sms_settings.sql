-- Add extra SMS notification toggles and templates to app_settings
ALTER TABLE "public"."app_settings" 
ADD COLUMN IF NOT EXISTS "sms_auto_out_for_delivery_enabled" boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS "sms_auto_out_for_delivery_template" text,
ADD COLUMN IF NOT EXISTS "sms_auto_returned_enabled" boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS "sms_auto_returned_template" text,
ADD COLUMN IF NOT EXISTS "sms_auto_on_hold_enabled" boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS "sms_auto_on_hold_template" text;
