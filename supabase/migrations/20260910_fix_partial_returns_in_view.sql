-- Update dashboard_stats view to include partial return deductions
-- Partial returns don't change orders.internal_status, so we need to query the returns table
CREATE OR REPLACE VIEW public.dashboard_stats WITH (security_invoker = true) AS
SELECT
  COUNT(*) FILTER (WHERE internal_status = 'pending') AS pending_orders,
  COUNT(*) FILTER (WHERE internal_status = 'preparing') AS preparing_orders,
  COUNT(*) FILTER (WHERE internal_status = 'dispatched') AS dispatched_orders,
  COUNT(*) FILTER (WHERE internal_status = 'delivered') AS delivered_orders,
  COUNT(*) FILTER (WHERE internal_status = 'hold') AS hold_orders,
  COUNT(*) FILTER (WHERE internal_status = 'cancelled') AS cancelled_orders,
  COUNT(*) FILTER (WHERE internal_status = 'returned') AS returned_orders,
  COALESCE(SUM(total_price) FILTER (WHERE internal_status = 'returned'), 0)
    + COALESCE((SELECT SUM(refund_amount) FROM public.returns WHERE return_type = 'partial' AND is_verified = true), 0)
    AS returned_revenue,
  COALESCE(SUM(return_delivery_fee) FILTER (WHERE internal_status = 'returned'), 0) AS total_return_fees,
  COUNT(*) FILTER (WHERE DATE(shopify_created_at) = CURRENT_DATE) AS orders_today,
  COUNT(*) FILTER (WHERE internal_status = 'dispatched' AND DATE(updated_at) = CURRENT_DATE) AS dispatched_today,
  COALESCE(SUM(total_price) FILTER (WHERE DATE(shopify_created_at) = CURRENT_DATE), 0) AS revenue_today
FROM public.orders;
