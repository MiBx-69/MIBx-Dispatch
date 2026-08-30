import { createServiceClient } from "@/lib/supabase/server";
import { Package, Truck, CheckCircle, Clock, AlertCircle, TrendingUp, Zap } from "lucide-react";
import Link from "next/link";
import { StatusBadge } from "@/components/ui/status-badge";
import type { Order, DashboardStats } from "@/types/database";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const supabase = createServiceClient();

  // Fetch stats
  const { data: stats } = await supabase
    .from("dashboard_stats")
    .select("*")
    .single();

  // Fetch 10 most recent orders
  const { data: recentOrders } = await supabase
    .from("orders")
    .select("*")
    .order("shopify_created_at", { ascending: false })
    .limit(10);

  // Fetch 5 recent dispatches
  const { data: recentDispatches } = await supabase
    .from("dispatches")
    .select("*")
    .order("dispatched_at", { ascending: false })
    .limit(5);

  const s = stats as DashboardStats | null;

  const statCards = [
    {
      label: "Pending Orders",
      value: s?.pending_orders || 0,
      icon: Clock,
      color: "text-zinc-400",
      bg: "bg-zinc-800/50",
      href: "/orders?status=pending",
    },
    {
      label: "Preparing",
      value: s?.preparing_orders || 0,
      icon: Package,
      color: "text-amber-400",
      bg: "bg-amber-500/10",
      href: "/orders?status=preparing",
    },
    {
      label: "Dispatched",
      value: s?.dispatched_orders || 0,
      icon: Truck,
      color: "text-indigo-400",
      bg: "bg-indigo-500/10",
      href: "/orders?status=dispatched",
    },
    {
      label: "Delivered",
      value: s?.delivered_orders || 0,
      icon: CheckCircle,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
      href: "/orders?status=delivered",
    },
    {
      label: "On Hold",
      value: s?.hold_orders || 0,
      icon: AlertCircle,
      color: "text-orange-400",
      bg: "bg-orange-500/10",
      href: "/orders?status=hold",
    },
    {
      label: "Today's Revenue",
      value: `৳${Number(s?.revenue_today || 0).toLocaleString()}`,
      icon: TrendingUp,
      color: "text-violet-400",
      bg: "bg-violet-500/10",
      isText: true,
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Today's Summary */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <div className="col-span-2 sm:col-span-1 rounded-2xl p-5 glass">
          <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Orders Today</p>
          <p className="text-4xl font-bold text-white mt-2">{s?.orders_today || 0}</p>
          <p className="text-xs text-zinc-500 mt-2">
            {s?.dispatched_today || 0} dispatched today
          </p>
        </div>
        <div className="col-span-2 sm:col-span-1 rounded-2xl p-5 bg-indigo-600/10 border border-indigo-500/20">
          <p className="text-xs text-indigo-400 font-medium uppercase tracking-wider">Dispatched Today</p>
          <p className="text-4xl font-bold text-indigo-300 mt-2">{s?.dispatched_today || 0}</p>
          <Link href="/dispatches" className="text-xs text-indigo-500 mt-2 inline-block hover:text-indigo-400 transition-colors">
            View all dispatches →
          </Link>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {statCards.map((card) => (
          <div
            key={card.label}
            className={`rounded-xl p-4 ${card.bg} border border-zinc-800/50 ${
              card.href ? "hover:border-zinc-700 transition-colors" : ""
            }`}
          >
            {card.href ? (
              <Link href={card.href} className="block">
                <StatCardContent {...card} />
              </Link>
            ) : (
              <StatCardContent {...card} />
            )}
          </div>
        ))}
      </div>

      {/* Recent Orders */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-zinc-300">Recent Orders</h2>
          <Link href="/orders" className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
            View all
          </Link>
        </div>
        <div className="space-y-2">
          {recentOrders?.length === 0 && (
            <div className="text-center py-10 text-zinc-600 text-sm rounded-xl border border-zinc-800">
              No orders yet. Sync your Shopify store first.
            </div>
          )}
          {recentOrders?.map((order: Order) => (
            <Link key={order.id} href={`/orders/${order.id}`}>
              <div className="flex items-center gap-3 p-3.5 rounded-xl bg-zinc-900 border border-zinc-800
                             hover:border-zinc-700 hover:bg-zinc-800/50 transition-all">
                {/* Order name */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-zinc-200">
                      {order.shopify_order_name}
                    </span>
                    <StatusBadge status={order.internal_status} />
                  </div>
                  <p className="text-xs text-zinc-500 mt-0.5 truncate">
                    {order.customer_name}
                    {order.customer_phone ? ` · ${order.customer_phone}` : ""}
                  </p>
                </div>
                {/* Amount */}
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-zinc-200">
                    ৳{Number(order.total_price).toLocaleString()}
                  </p>
                  <p className="text-xs text-zinc-600">
                    {new Date(order.shopify_created_at || order.created_at).toLocaleDateString("en-BD", {
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-sm font-semibold text-zinc-300 mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 gap-3">
          <Link href="/orders?status=pending"
            className="flex flex-col items-center gap-2 p-4 rounded-xl bg-zinc-900 border border-zinc-800
                      hover:border-indigo-500/50 hover:bg-indigo-600/5 transition-all">
            <Package className="w-6 h-6 text-indigo-400" />
            <span className="text-xs font-medium text-zinc-300">Pending Orders</span>
          </Link>
          <form action="/api/sync/shopify" method="POST">
            <button type="submit"
              className="w-full flex flex-col items-center gap-2 p-4 rounded-xl bg-zinc-900 border border-zinc-800
                        hover:border-emerald-500/50 hover:bg-emerald-600/5 transition-all">
              <Zap className="w-6 h-6 text-emerald-400" />
              <span className="text-xs font-medium text-zinc-300">Sync Shopify</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function StatCardContent({ label, value, icon: Icon, color, isText }: any) {
  return (
    <>
      <Icon className={`w-5 h-5 ${color} mb-2`} />
      <p className={`text-xl font-bold ${isText ? color : "text-white"}`}>{value}</p>
      <p className="text-xs text-zinc-500 mt-0.5">{label}</p>
    </>
  );
}
