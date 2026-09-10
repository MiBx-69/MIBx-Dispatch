-- Add delivery charges for Inside/Outside Dhaka to app_settings
ALTER TABLE public.app_settings 
ADD COLUMN IF NOT EXISTS delivery_charge_inside_dhaka numeric DEFAULT 60,
ADD COLUMN IF NOT EXISTS delivery_charge_outside_dhaka numeric DEFAULT 120;

-- Add flag to distinguish Paid Returns (no loss) from Normal Returns
ALTER TABLE public.returns
ADD COLUMN IF NOT EXISTS is_paid_return boolean DEFAULT false;

-- We don't need to change dashboard_stats since Paid Returns will just have return_delivery_fee = 0
