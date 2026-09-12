-- Migration: Add master SMS toggle, sender ID toggles, and event type selections to app_settings
ALTER TABLE "public"."app_settings" 
ADD COLUMN IF NOT EXISTS "sms_master_enabled" boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS "sms_sender_id_enabled" boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS "sms_non_sender_id_enabled" boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS "sms_sender_id_event_types" text DEFAULT 'order,dispatch,out_for_delivery,delivered,returned,on_hold,cancelled,manual';
