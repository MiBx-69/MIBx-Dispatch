-- Add covering indexes for unindexed foreign keys (Performance Improvement)
CREATE INDEX IF NOT EXISTS idx_dispatches_dispatched_by ON public.dispatches(dispatched_by);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON public.orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_sync_logs_triggered_by ON public.sync_logs(triggered_by);
CREATE INDEX IF NOT EXISTS idx_transactions_created_by ON public.transactions(created_by);
