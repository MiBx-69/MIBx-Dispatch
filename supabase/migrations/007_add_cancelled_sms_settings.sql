-- Add sms_auto_cancelled_enabled and sms_auto_cancelled_template to app_settings

ALTER TABLE "public"."app_settings" 
ADD COLUMN IF NOT EXISTS "sms_auto_cancelled_enabled" boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS "sms_auto_cancelled_template" text;
