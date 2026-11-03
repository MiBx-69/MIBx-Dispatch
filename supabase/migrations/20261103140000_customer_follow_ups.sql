-- 20261103140000_customer_follow_ups.sql
-- Customer Follow-up CRM & Reminders

CREATE TABLE IF NOT EXISTS public.customer_follow_ups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  note TEXT,
  reminder_date TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for fast query lookup & reminder notifications
CREATE INDEX IF NOT EXISTS idx_customer_follow_ups_customer_id ON public.customer_follow_ups(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_follow_ups_reminder ON public.customer_follow_ups(reminder_date) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_customer_follow_ups_status ON public.customer_follow_ups(status);

-- RLS policies
ALTER TABLE public.customer_follow_ups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read on customer_follow_ups"
  ON public.customer_follow_ups FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated insert on customer_follow_ups"
  ON public.customer_follow_ups FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated update on customer_follow_ups"
  ON public.customer_follow_ups FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated delete on customer_follow_ups"
  ON public.customer_follow_ups FOR DELETE
  TO authenticated
  USING (true);

