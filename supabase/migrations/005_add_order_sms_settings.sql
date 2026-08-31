-- Add order confirmation SMS settings
ALTER TABLE public.app_settings
ADD COLUMN sms_auto_order_enabled BOOLEAN DEFAULT false,
ADD COLUMN sms_auto_order_template TEXT DEFAULT 'প্রিয় {{customer_name}}, আমাদের ওয়েবসাইটে আপনি একটি অর্ডার প্লেস করেছেন (অর্ডার আইডি: {{order_id}})। অর্ডারটি কনফার্ম করতে আমাদের টিম খুব শীঘ্রই আপনাকে কল করবে। যেকোনো প্রয়োজনে আমাদের পেইজে যোগাযোগ করুন অথবা কল করুন 09643655867 নাম্বারে। ধন্যবাদ, Universes!';

-- Update default templates for dispatch and delivery with professional bangla text
UPDATE public.app_settings
SET 
  sms_auto_dispatch_template = 'প্রিয় {{customer_name}}, Universes থেকে আপনার অর্ডার {{order_id}} ডিসপ্যাচ করা হয়েছে। খুব শীঘ্রই আপনি প্রোডাক্টটি পেয়ে যাবেন। আপনার বকেয়া বিল {{total_price}} টাকা। প্রোডাক্টটি গ্রহণ করার জন্য অনুগ্রহ করে বিল প্রস্তুত রাখুন।',
  sms_auto_delivered_template = 'প্রিয় {{customer_name}}, আপনার অর্ডার {{order_id}} সফলভাবে ডেলিভারি করা হয়েছে। Universes এর সাথে থাকার জন্য ধন্যবাদ! আমাদের সার্ভিস সম্পর্কে আপনার মতামত জানাতে ভুলবেন না।';
