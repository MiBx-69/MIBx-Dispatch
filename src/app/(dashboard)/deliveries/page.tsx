import { resolveDateRange } from "@/lib/date-utils";
import { getComprehensiveBusinessReport } from "@/lib/business-metrics-engine";
import { DeliveriesClient } from "./deliveries-client";

export const metadata = { title: "Deliveries & Performance — Universes RAW" };
export const dynamic = "force-dynamic";

export default async function DeliveriesPage({
  searchParams,
}: {
  searchParams: Promise<{
    dateFilter?: string;
    from?: string;
    to?: string;
    search?: string;
  }>;
}) {
  const params = await searchParams;
  const dateFilter = params.dateFilter || "this_month";
  const { startDateStr, endDateStr } = resolveDateRange(
    dateFilter,
    params.from,
    params.to
  );

  const effectiveStart =
    startDateStr || new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const effectiveEnd = endDateStr || new Date().toISOString();

  const { report, rawOrders, rawReturns } = await getComprehensiveBusinessReport(
    effectiveStart,
    effectiveEnd
  );

  const partialByOrder = new Map<string, number>();
  for (const r of rawReturns) {
    if (r.return_type === "partial" && r.is_verified !== false) {
      const val = Number(r.returned_product_value ?? r.refund_amount ?? 0);
      partialByOrder.set(r.order_id, (partialByOrder.get(r.order_id) || 0) + val);
    }
  }

  const deliveredOrders = rawOrders
    .filter((o) => o.internal_status === "delivered")
    .map((o) => {
      const origTotal = Number(o.original_total_price ?? o.total_price ?? 0);
      const partialDed = partialByOrder.get(o.id) || 0;
      return {
        id: o.id,
        shopify_order_name: o.shopify_order_name,
        customer_name: o.customer_name || "Unknown",
        customer_phone: o.customer_phone || "",
        consignment_id: o.pathao_consignment_id || "",
        delivery_status: o.pathao_delivery_status || "Delivered",
        shopify_created_at: o.shopify_created_at,
        delivered_at: o.delivered_at || o.updated_at || o.shopify_created_at,
        original_total: origTotal,
        partial_return_deduction: partialDed,
        net_delivered_value: Math.max(0, origTotal - partialDed),
      };
    });

  return (
    <DeliveriesClient
      report={report}
      deliveredOrders={deliveredOrders}
      dateFilter={dateFilter}
      customFrom={params.from || ""}
      customTo={params.to || ""}
      initialSearch={params.search || ""}
    />
  );
}
