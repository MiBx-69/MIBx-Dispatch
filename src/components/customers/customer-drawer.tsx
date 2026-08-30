"use client";

import { useEffect, useState } from "react";
import { X, ShoppingBag, Truck, Calendar, MapPin, AlertTriangle } from "lucide-react";

export function CustomerDrawer({ customer, onClose }: { customer: any; onClose: () => void }) {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const fetchOrders = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/customers/${customer.id}/orders`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        if (mounted) setOrders(data.orders || []);
      } catch (err: any) {
        if (mounted) setError(err.message);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetchOrders();
    return () => { mounted = false; };
  }, [customer.id]);

  const cancelledOrders = orders.filter(o => o.internal_status === "cancelled" || o.internal_status === "returned").length;
  const isHighRisk = cancelledOrders > 0 && cancelledOrders >= orders.length / 2;

  // Derive the best phone and email if the Shopify Customer account is missing them (e.g. guest checkout)
  const bestPhone = customer.phone || (orders.length > 0 ? orders[0].customer_phone : null);
  const bestName = customer.name || (orders.length > 0 ? orders[0].customer_name : "Unknown");
  const bestEmail = customer.email || (orders.length > 0 ? orders[0].customer_email : null);

  return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 w-full sm:w-[450px] bg-zinc-900 border-l border-zinc-800 z-50 shadow-2xl flex flex-col animate-slide-left">
        
        {/* Header */}
        <div className="p-6 border-b border-zinc-800 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-xl font-bold text-zinc-100">{bestName}</h2>
              {customer.total_spent >= 10000 || customer.total_orders >= 5 ? (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  VIP
                </span>
              ) : null}
              {isHighRisk && (
                <span className="px-2 py-0.5 rounded flex items-center gap-1 text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30">
                  <AlertTriangle size={10} /> HIGH RISK
                </span>
              )}
            </div>
            <p className="text-sm text-zinc-400 font-mono">
              {bestPhone || (!loading ? "No phone" : "Loading...")} 
              {bestEmail && ` • ${bestEmail}`}
            </p>
          </div>
          <button onClick={onClose} className="p-2 bg-zinc-800 rounded-lg hover:bg-zinc-700 text-zinc-400 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Stats Summary */}
        <div className="grid grid-cols-2 divide-x divide-zinc-800 border-b border-zinc-800 bg-zinc-950/50">
          <div className="p-4 text-center">
            <p className="text-xs text-zinc-500 mb-1">Total Orders</p>
            <p className="text-lg font-bold text-zinc-200">{customer.total_orders}</p>
          </div>
          <div className="p-4 text-center">
            <p className="text-xs text-zinc-500 mb-1">Total Spent</p>
            <p className="text-lg font-bold text-emerald-400">৳{Number(customer.total_spent).toLocaleString()}</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="p-4 border-b border-zinc-800 flex gap-2">
          {bestPhone && (
            <a
              href={`https://wa.me/${(() => {
                const d = bestPhone.replace(/[^0-9]/g, '');
                return d.startsWith('880') ? d : d.startsWith('0') ? `88${d}` : `880${d}`;
              })()}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 bg-green-600/10 hover:bg-green-600/20 text-green-500 border border-green-600/30 font-semibold text-xs py-2 rounded-lg text-center transition-colors"
            >
              WhatsApp Message
            </a>
          )}
          {bestEmail && (
            <a
              href={`mailto:${bestEmail}`}
              className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold text-xs py-2 rounded-lg text-center transition-colors"
            >
              Email Customer
            </a>
          )}
        </div>

        {/* Order History */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <h3 className="text-sm font-semibold text-zinc-400 mb-3 flex items-center gap-2">
            <ShoppingBag size={14} /> Order History
          </h3>
          
          {loading ? (
            <div className="text-center py-10 text-zinc-600 text-xs">Loading orders...</div>
          ) : error ? (
            <div className="text-center py-10 text-red-500 text-xs">{error}</div>
          ) : orders.length === 0 ? (
            <div className="text-center py-10 text-zinc-600 text-xs">No orders found.</div>
          ) : (
            orders.map((order) => (
              <div key={order.id} className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-zinc-200 text-sm">{order.shopify_order_name}</span>
                  <span className="text-xs font-medium text-emerald-400">৳{Number(order.total_price).toLocaleString()}</span>
                </div>
                
                <div className="flex flex-col gap-1.5 mt-1">
                  <div className="flex items-center gap-2 text-xs text-zinc-500">
                    <Calendar size={12} /> 
                    {new Date(order.shopify_created_at).toLocaleDateString("en-BD", { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                  
                  <div className="flex items-center gap-2 text-xs text-zinc-500 truncate">
                    <MapPin size={12} className="shrink-0" />
                    <span className="truncate">{order.shipping_address?.address1 || "No address"}</span>
                  </div>
                </div>

                <div className="mt-2 pt-2 border-t border-zinc-800 flex items-center justify-between">
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 capitalize">
                    {order.internal_status}
                  </span>
                  
                  {order.dispatches?.[0] && (
                    <span className="text-[10px] flex items-center gap-1 text-indigo-400">
                      <Truck size={10} />
                      {order.dispatches[0].pathao_order_status || "Dispatched"}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
