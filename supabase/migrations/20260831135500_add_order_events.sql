-- Migration: Add Order Events Timeline

CREATE TABLE public.order_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    description TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Add RLS
ALTER TABLE public.order_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access to authenticated users for order events"
ON public.order_events FOR SELECT
TO authenticated
USING (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_order_events_order_id ON public.order_events(order_id);
CREATE INDEX IF NOT EXISTS idx_order_events_created_at ON public.order_events(created_at DESC);
