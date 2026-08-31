import { createServiceClient } from "@/lib/supabase/server";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DollarSign, PackageX, TrendingUp, AlertCircle, ShoppingBag } from "lucide-react";

export default async function SalesReportPage({
  searchParams,
}: {
  searchParams: { month?: string };
}) {
  const supabase = createServiceClient();

  // Determine date range (defaults to current month)
  const targetDate = searchParams.month ? new Date(searchParams.month) : new Date();
  const startDate = startOfMonth(targetDate);
  const endDate = endOfMonth(targetDate);

  // Fetch orders created within the month
  const { data: orders, error } = await supabase
    .from("orders")
    .select(`
      *,
      customers (name, phone),
      dispatches (delivery_fee, pathao_order_status)
    `)
    .gte("shopify_created_at", startDate.toISOString())
    .lte("shopify_created_at", endDate.toISOString())
    .order("shopify_created_at", { ascending: false });

  if (error) {
    console.error("Sales report error:", error);
  }

  let totalGrossSales = 0;
  let totalNetSales = 0;
  let totalReturnedAmount = 0;
  let totalCourierFees = 0;
  let returnedCount = 0;
  let cancelledCount = 0;
  let partialCount = 0;
  let holdCount = 0;
  let discrepancyCount = 0;

  const orderList = orders || [];

  orderList.forEach((order) => {
    const amount = Number(order.total_price) || 0;
    const deliveryFee = order.dispatches?.[0]?.delivery_fee ? Number(order.dispatches[0].delivery_fee) : 0;
    
    totalGrossSales += amount;
    
    // Determine status from Shopify Data first, fallback to Pathao internal_status
    const tags = order.shopify_tags || [];
    const isCancelled = order.cancel_reason != null || order.financial_status === "voided" || order.internal_status === "cancelled";
    const isRefunded = order.financial_status === "refunded" || tags.includes("Pathao: Returned") || order.internal_status === "returned";
    const isPartial = order.financial_status === "partially_refunded" || tags.includes("Pathao: Partial Delivery") || order.internal_status === "partial";
    const isHold = tags.includes("Pathao: Hold") || order.internal_status === "hold";
    
    if (isCancelled) {
      totalReturnedAmount += amount;
      cancelledCount++;
    } else if (isRefunded) {
      totalReturnedAmount += amount;
      returnedCount++;
    } else if (isPartial) {
      partialCount++;
      // Partial refunds usually mean the item was mostly delivered. For exact net sales, we'd need to subtract the refunded amount, 
      // but Shopify's total_price might not reflect it unless we pull refunds. For now, add it to net sales.
      totalNetSales += amount;
    } else if (isHold) {
      holdCount++;
    } else {
      // Assuming delivered or pending delivery
      totalNetSales += amount;
    }

    if (order.dispatches && order.dispatches.length > 0) {
      totalCourierFees += deliveryFee;
    }

    if ((isRefunded || isHold || isCancelled) && order.financial_status === "paid") {
      discrepancyCount++;
    }
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Sales & Returns Report</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Reconciliation for {format(targetDate, "MMMM yyyy")}
          </p>
        </div>
        <div className="flex gap-2">
          {/* Simple Month Navigation */}
          <a
            href={`?month=${format(subMonths(targetDate, 1), "yyyy-MM-01")}`}
            className="px-3 py-1.5 bg-zinc-800 text-zinc-300 rounded text-sm hover:bg-zinc-700 transition"
          >
            &larr; Prev Month
          </a>
          {targetDate.getMonth() !== new Date().getMonth() && (
            <a
              href={`?month=${format(new Date(), "yyyy-MM-01")}`}
              className="px-3 py-1.5 bg-brand/10 text-brand rounded text-sm hover:bg-brand/20 transition"
            >
              Current Month
            </a>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-zinc-900/50 border-zinc-800/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Gross Sales</CardTitle>
            <ShoppingBag className="w-4 h-4 text-zinc-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">৳{totalGrossSales.toLocaleString()}</div>
            <p className="text-xs text-zinc-500 mt-1">{orderList.length} total orders</p>
          </CardContent>
        </Card>

        <Card className="bg-emerald-950/20 border-emerald-900/30">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-emerald-400/80">Net Delivered Sales</CardTitle>
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-400">৳{totalNetSales.toLocaleString()}</div>
            <p className="text-xs text-emerald-500/70 mt-1">Approximated (incl. partial)</p>
          </CardContent>
        </Card>

        <Card className="bg-rose-950/20 border-rose-900/30">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-rose-400/80">Returns & Cancelled</CardTitle>
            <PackageX className="w-4 h-4 text-rose-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-rose-400">৳{totalReturnedAmount.toLocaleString()}</div>
            <p className="text-xs text-rose-500/70 mt-1">{returnedCount} orders returned</p>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/50 border-zinc-800/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Courier Fees</CardTitle>
            <DollarSign className="w-4 h-4 text-zinc-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">৳{totalCourierFees.toLocaleString()}</div>
            <p className="text-xs text-zinc-500 mt-1">Based on Pathao dispatch records</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-1 bg-amber-950/20 border-amber-900/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-amber-400/80 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              Reconciliation Discrepancies
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-400">{discrepancyCount}</div>
            <p className="text-xs text-amber-500/70 mt-1">
              Orders returned/held by Pathao but marked as 'Paid' in Shopify. Need manual review.
            </p>
            <div className="mt-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">On Hold</span>
                <span className="text-white font-medium">{holdCount}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">Partial Deliveries</span>
                <span className="text-white font-medium">{partialCount}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2 bg-zinc-900/50 border-zinc-800/50">
          <CardHeader>
            <CardTitle className="text-white text-lg">Orders to Review</CardTitle>
          </CardHeader>
          <CardContent>
            {orderList.filter(o => {
              const tags = o.shopify_tags || [];
              const isCancelled = o.cancel_reason != null || o.financial_status === "voided" || o.internal_status === "cancelled";
              const isRefunded = o.financial_status === "refunded" || tags.includes("Pathao: Returned") || o.internal_status === "returned";
              const isPartial = o.financial_status === "partially_refunded" || tags.includes("Pathao: Partial Delivery") || o.internal_status === "partial";
              const isHold = tags.includes("Pathao: Hold") || o.internal_status === "hold";
              return isCancelled || isRefunded || isHold || isPartial;
            }).length === 0 ? (
              <p className="text-zinc-500 text-sm">No returns, holds, or partial deliveries to review this month.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-zinc-500 uppercase bg-zinc-900/50 border-b border-zinc-800">
                    <tr>
                      <th className="px-4 py-3 font-medium">Order</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Shopify Payment</th>
                      <th className="px-4 py-3 font-medium">Amount</th>
                      <th className="px-4 py-3 font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50">
                    {orderList
                      .filter(o => {
                        const tags = o.shopify_tags || [];
                        const isCancelled = o.cancel_reason != null || o.financial_status === "voided" || o.internal_status === "cancelled";
                        const isRefunded = o.financial_status === "refunded" || tags.includes("Pathao: Returned") || o.internal_status === "returned";
                        const isPartial = o.financial_status === "partially_refunded" || tags.includes("Pathao: Partial Delivery") || o.internal_status === "partial";
                        const isHold = tags.includes("Pathao: Hold") || o.internal_status === "hold";
                        return isCancelled || isRefunded || isHold || isPartial;
                      })
                      .map((order) => {
                        const tags = order.shopify_tags || [];
                        const isCancelled = order.cancel_reason != null || order.financial_status === "voided" || order.internal_status === "cancelled";
                        const isRefunded = order.financial_status === "refunded" || tags.includes("Pathao: Returned") || order.internal_status === "returned";
                        const isPartial = order.financial_status === "partially_refunded" || tags.includes("Pathao: Partial Delivery") || order.internal_status === "partial";
                        
                        const isDiscrepancy = (isRefunded || isCancelled || tags.includes("Pathao: Hold") || order.internal_status === "hold") && order.financial_status === "paid";
                        
                        let badgeText = "Returned";
                        if (isCancelled) badgeText = "Cancelled";
                        else if (isPartial) badgeText = "Partial";
                        else if (tags.includes("Pathao: Hold") || order.internal_status === "hold") badgeText = "Hold";

                        return (
                          <tr key={order.id} className="hover:bg-zinc-800/30 transition-colors">
                            <td className="px-4 py-3 text-white">
                              {order.shopify_order_name}
                              <div className="text-xs text-zinc-500 mt-0.5">{order.customer_name}</div>
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant="outline" className={
                                badgeText === "Returned" || badgeText === "Cancelled" ? "border-rose-500/30 text-rose-400 bg-rose-500/10" :
                                badgeText === "Partial" ? "border-amber-500/30 text-amber-400 bg-amber-500/10" :
                                "border-zinc-500/30 text-zinc-400 bg-zinc-500/10"
                              }>
                                {badgeText}
                              </Badge>
                            </td>
                            <td className="px-4 py-3">
                              <span className={isDiscrepancy ? "text-rose-400 font-medium" : "text-zinc-300"}>
                                {order.financial_status || "pending"}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-zinc-300">
                              ৳{Number(order.total_price).toLocaleString()}
                            </td>
                            <td className="px-4 py-3">
                              <a 
                                href={`https://admin.shopify.com/store/YOUR-STORE/orders/${order.shopify_order_id}`} 
                                target="_blank" 
                                rel="noreferrer"
                                className="text-brand hover:text-brand-light text-xs font-medium"
                              >
                                View in Shopify
                              </a>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
