"use client";

import { useState, useTransition, useCallback, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Search, Filter, ChevronLeft, ChevronRight,
  Truck, Package, X, CheckCircle, PauseCircle, AlertCircle, Archive, ArchiveRestore, Copy, Check, MessageSquare, ShieldCheck, List
} from "lucide-react";
import { StatusBadge, ShopifyFinancialBadge, ShopifyFulfillmentBadge } from "@/components/ui/status-badge";
import { DispatchModal } from "@/components/orders/dispatch-modal";
import { BulkDispatchModal } from "@/components/orders/bulk-dispatch-modal";
import { SendSMSModal } from "@/components/orders/send-sms-modal";
import { ReportFraudModal } from "@/components/modals/report-fraud-modal";
import { FraudDetailsModal } from "@/components/modals/fraud-details-modal";
import { OrderTimelineModal } from "@/components/orders/order-timeline-modal";
import type { Order, OrderStatus } from "@/types/database";

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "preparing", label: "Preparing" },
  { value: "dispatched", label: "Dispatched" },
  { value: "delivered", label: "Delivered" },
  { value: "hold", label: "Hold" },
  { value: "cancelled", label: "Cancelled" },
  { value: "delayed", label: "Delayed" },
  { value: "returned", label: "Returned" },
  { value: "archived", label: "Removed" },
];

interface OrdersClientProps {
  orders: Order[];
  total: number;
  page: number;
  pageSize: number;
  currentStatus?: string;
  currentSearch?: string;
  pathaoStoreId?: number | null;
}

export function OrdersClient({
  orders,
  total,
  pageSize,
  currentStatus,
  currentSearch,
  pathaoStoreId,
}: OrdersClientProps) {
  const router = useRouter();
  
  // State for Infinite Scroll
  const [ordersList, setOrdersList] = useState<Order[]>(orders);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const hasMore = ordersList.length < total;
  const observerTarget = useRef<HTMLDivElement>(null);

  const [search, setSearch] = useState(currentSearch || "");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dispatchOrder, setDispatchOrder] = useState<Order | null>(null);
  const [smsOrder, setSmsOrder] = useState<Order | null>(null);
  const [fraudOrder, setFraudOrder] = useState<Order | null>(null);
  const [viewFraudOrder, setViewFraudOrder] = useState<Order | null>(null);
  const [timelineOrderId, setTimelineOrderId] = useState<string | null>(null);
  const [isCheckingFraud, setIsCheckingFraud] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Reset list when server-provided orders change (e.g., search/filter changed)
  useEffect(() => {
    setOrdersList(orders);
    setPage(1);
  }, [orders]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);

    try {
      const params = new URLSearchParams();
      if (currentStatus && currentStatus !== "all") params.set("status", currentStatus);
      if (currentSearch) params.set("search", currentSearch);
      params.set("page", (page + 1).toString());
      params.set("pageSize", pageSize.toString());

      const res = await fetch(`/api/orders?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch");

      const { data } = await res.json();
      if (data && data.length > 0) {
        setOrdersList((prev) => {
          const newOrders = data.filter((o: Order) => !prev.some((p) => p.id === o.id));
          return [...prev, ...newOrders];
        });
        setPage((p) => p + 1);
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to load more orders");
    } finally {
      setLoadingMore(false);
    }
  }, [page, loadingMore, hasMore, currentStatus, currentSearch, pageSize]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    if (observerTarget.current) observer.observe(observerTarget.current);
    return () => observer.disconnect();
  }, [loadMore]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(() => {
      const params = new URLSearchParams();
      if (currentStatus) params.set("status", currentStatus);
      if (search) params.set("search", search);
      router.push(`/orders?${params.toString()}`);
    });
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const selectAll = () => {
    if (selected.size === ordersList.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(ordersList.map((o) => o.id)));
    }
  };

  const updateSingleStatus = async (orderId: string, status: OrderStatus) => {
    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success(`Order marked as ${status}`);
      router.refresh();
      // Update local state optimistically
      setOrdersList(prev => prev.map(o => o.id === orderId ? { ...o, internal_status: status } : o));
    } catch {
      toast.error("Failed to update status");
    }
  };

  const toggleArchive = async (orderId: string, is_archived: boolean) => {
    try {
      const res = await fetch(`/api/orders/${orderId}/archive`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_archived }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success(is_archived ? "Order removed" : "Order restored");
      router.refresh();
      setOrdersList(prev => prev.filter(o => o.id !== orderId));
    } catch {
      toast.error("Failed to update archive status");
    }
  };

  const bulkUpdateStatus = async (status: OrderStatus) => {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    try {
      await Promise.all(
        ids.map((id) =>
          fetch(`/api/orders/${id}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status }),
          })
        )
      );
      toast.success(`${ids.length} orders updated to ${status}`);
      setSelected(new Set());
      router.refresh();
      setOrdersList(prev => prev.map(o => ids.includes(o.id) ? { ...o, internal_status: status } : o));
    } catch {
      toast.error("Bulk update failed");
    }
  };

  const bulkArchive = async (is_archived: boolean) => {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    try {
      await Promise.all(
        ids.map((id) =>
          fetch(`/api/orders/${id}/archive`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ is_archived }),
          })
        )
      );
      toast.success(`${ids.length} orders ${is_archived ? 'archived' : 'restored'}`);
      setSelected(new Set());
      router.refresh();
      if (is_archived) {
        setOrdersList(prev => prev.filter(o => !ids.includes(o.id)));
      }
    } catch {
      toast.error("Bulk archive failed");
    }
  };

  const manualFraudCheck = async (orderId: string) => {
    setIsCheckingFraud(true);
    const toastId = toast.loading("Checking FraudSpy...");
    try {
      const res = await fetch(`/api/orders/${orderId}/fraud-check`, {
        method: "POST",
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || "Failed to check fraud status");
      
      toast.success("Fraud check completed!", { id: toastId });
      
      const updatedOrder = {
        fraud_status: data.fraud_status, 
        fraud_score: data.fraud_score,
        fraud_data: data.data 
      };

      // Update local state with the new status/score
      setOrdersList(prev => prev.map(o => o.id === orderId ? { ...o, ...updatedOrder } : o));
      
      // Update the modal if it's currently open
      setViewFraudOrder(prev => prev?.id === orderId ? { ...prev, ...updatedOrder } as Order : prev);
      
    } catch (err: any) {
      toast.error(err.message, { id: toastId });
    } finally {
      setIsCheckingFraud(false);
    }
  };

  const [bulkDispatchModalOpen, setBulkDispatchModalOpen] = useState(false);

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Search + Filter */}
      <div className="space-y-3">
        <div className="flex gap-2">
          <form onSubmit={handleSearch} className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search orders, customers, phones..."
              className="w-full pl-9 pr-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-sm
                        text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500
                        focus:ring-1 focus:ring-indigo-500"
            />
          </form>
        </div>

        {/* Status filters */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => {
                startTransition(() => {
                  const params = new URLSearchParams();
                  if (f.value !== "all") params.set("status", f.value);
                  if (search) params.set("search", search);
                  router.push(`/orders?${params.toString()}`);
                });
              }}
              className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                ${
                  (currentStatus === f.value) || (!currentStatus && f.value === "all")
                    ? "bg-indigo-500 text-white"
                    : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                }
              `}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk Actions Floating Bar */}
      {selected.size > 0 && (
        <div className="sticky top-2 z-50 w-full 
                        bg-zinc-900/95 backdrop-blur-xl border border-zinc-700/50 rounded-2xl shadow-2xl p-3
                        flex flex-col sm:flex-row items-center justify-between gap-3 animate-in slide-in-from-top-2">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <span className="text-sm font-semibold text-zinc-100 bg-indigo-500/20 text-indigo-400 px-3 py-1.5 rounded-lg border border-indigo-500/20">
              {selected.size} selected
            </span>
            <button
              onClick={() => setSelected(new Set())}
              className="text-xs text-zinc-400 hover:text-zinc-200 underline underline-offset-2"
            >
              Clear
            </button>
          </div>
          
          <div className="flex flex-wrap items-center justify-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => setBulkDispatchModalOpen(true)}
              className="flex items-center gap-1.5 bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors shadow-lg shadow-indigo-500/20"
            >
              <Truck size={16} /> Dispatch
            </button>
            <button
              onClick={() => bulkUpdateStatus("preparing")}
              className="flex items-center gap-1.5 bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 px-4 py-2 rounded-xl text-sm font-medium transition-colors border border-amber-500/20"
            >
              <Package size={16} /> Preparing
            </button>
            <button
              onClick={() => bulkUpdateStatus("hold")}
              className="flex items-center gap-1.5 bg-orange-500/15 text-orange-400 hover:bg-orange-500/25 px-4 py-2 rounded-xl text-sm font-medium transition-colors border border-orange-500/20"
            >
              <PauseCircle size={16} /> Hold
            </button>
            
            <div className="w-px h-6 bg-zinc-700 mx-1 hidden sm:block"></div>
            
            <button
              onClick={() => bulkArchive(true)}
              className="flex items-center gap-1.5 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors border border-zinc-700"
            >
              <Archive size={16} /> Remove
            </button>
          </div>
        </div>
      )}

      {/* Order List */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {ordersList.map((order) => {
          const isSelected = selected.has(order.id);
          const lineItems = (order.line_items as any[]) || [];
          const isDispatchedOrCancelled = order.internal_status === "dispatched" || order.internal_status === "delivered" || order.internal_status === "returned" || order.internal_status === "cancelled";

          return (
            <div
              key={order.id}
              className={`bg-zinc-900 border rounded-2xl overflow-hidden transition-all duration-200
                ${isSelected ? "border-indigo-500 ring-1 ring-indigo-500" : "border-zinc-800 hover:border-zinc-700"}
              `}
            >
              {/* Header */}
              <div className="p-3.5 border-b border-zinc-800/50 bg-zinc-900/50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => toggleSelect(order.id)}
                    className={`w-5 h-5 rounded flex items-center justify-center transition-colors
                      ${isSelected ? "bg-indigo-500 text-white" : "border-2 border-zinc-700 hover:border-zinc-500"}
                    `}
                  >
                    {isSelected && <Check size={12} strokeWidth={3} />}
                  </button>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-zinc-100">{order.shopify_order_name}</h3>
                      <StatusBadge status={order.internal_status as OrderStatus} />
                    </div>
                  </div>
                </div>
                
                {/* Dispatch Button for individual order */}
                {!isDispatchedOrCancelled && !order.is_archived && (
                  <button
                    onClick={() => setDispatchOrder(order)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 transition-colors"
                  >
                    <Truck size={12} /> Dispatch
                  </button>
                )}
              </div>

              {/* Body */}
              <div className="p-3.5 flex gap-4">
                {/* Customer Info */}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-zinc-200 truncate">{order.customer_name || "Unknown Customer"}</p>
                    {order.fraud_status && order.fraud_status !== 'safe' && order.fraud_status !== 'unchecked' && (
                      <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full border ${
                        order.fraud_status === 'fraud' 
                          ? 'bg-red-500/10 text-red-400 border-red-500/20' 
                          : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                      }`}>
                        {order.fraud_status === 'fraud' ? 'High Risk' : 'Medium Risk'}
                        {order.fraud_score ? ` (${order.fraud_score})` : ''}
                      </span>
                    )}
                  </div>
                  
                  {order.customer_phone ? (
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-zinc-400 truncate">{order.customer_phone}</p>
                      <button 
                        onClick={() => {
                          navigator.clipboard.writeText(order.customer_phone!);
                          toast.success("Phone copied");
                        }}
                        className="text-zinc-600 hover:text-zinc-400 transition-colors"
                        title="Copy phone"
                      >
                        <Copy size={12} />
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-600">No phone number</p>
                  )}
                  
                  {/* Shopify Badges */}
                  <div className="flex flex-wrap gap-1 mt-2">
                    {order.financial_status && (
                      <ShopifyFinancialBadge status={order.financial_status} />
                    )}
                    {order.fulfillment_status && (
                      <ShopifyFulfillmentBadge status={order.fulfillment_status} />
                    )}
                  </div>

                  {/* Pathao consignment if dispatched */}
                  {order.pathao_consignment_id && (
                    <p className="text-xs text-indigo-400 mt-1">
                      📦 {order.pathao_consignment_id}
                      {order.pathao_delivery_status && (
                        <span className="ml-2 text-zinc-500">· {order.pathao_delivery_status}</span>
                      )}
                    </p>
                  )}
                </div>

                {/* Amount */}
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-zinc-100">৳{Number(order.total_price).toLocaleString()}</p>
                  <p className="text-[10px] text-zinc-600 mt-0.5">
                    {new Date(order.shopify_created_at || order.created_at).toLocaleDateString("en-BD", {
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                </div>
              </div>

              {/* CTA Buttons */}
              <div className="flex flex-wrap items-center gap-1.5 px-3.5 pb-3 border-t border-zinc-800/50 pt-2">
                {/* WhatsApp Confirmation */}
                {order.customer_phone && !order.is_archived && !isDispatched && (
                  <button
                    onClick={() => {
                      const d = order.customer_phone!.replace(/[^0-9]/g, '');
                      const formattedPhone = d.startsWith('880') ? d : d.startsWith('0') ? `88${d}` : `880${d}`;
                      const text = `আসসালামু আলাইকুম! আপনার ${order.shopify_order_name} অর্ডারটি পেন্ডিং আছে।\n\n${lineItems
                        .map((item: any) => `- ${item.title}${item.variant_title ? ` (${item.variant_title})` : ''} x ${item.quantity}`)
                        .join('\n')}\n\nমোট বিল: ৳${Number(order.total_price).toLocaleString()}\n\nআপনি কি অর্ডারটি কনফার্ম করতে চান?`;
                      const encodedText = encodeURIComponent(text);
                      
                      const ua = navigator.userAgent.toLowerCase();
                      const isAndroid = ua.includes('android');
                      const isIOS = /ipad|iphone|ipod/.test(ua) && !(window as any).MSStream;
                      
                      if (isAndroid) {
                        window.location.href = `intent://send/?phone=${formattedPhone}&text=${encodedText}#Intent;scheme=whatsapp;package=com.whatsapp.w4b;end`;
                      } else if (isIOS) {
                        window.location.href = `whatsapp://send?phone=${formattedPhone}&text=${encodedText}`;
                      } else {
                        window.open(`https://web.whatsapp.com/send?phone=${formattedPhone}&text=${encodedText}`, '_blank');
                      }
                    }}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg bg-green-600/15 text-green-400
                              border border-green-600/20 hover:bg-green-600/25 transition-colors mr-1"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.888-.788-1.487-1.761-1.66-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>
                    </svg>
                    WhatsApp
                  </button>
                )}

                {/* Send SMS */}
                {order.customer_phone && !order.is_archived && (
                  <button
                    onClick={() => setSmsOrder(order)}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg bg-orange-600/15 text-orange-400
                              border border-orange-600/20 hover:bg-orange-600/25 transition-colors mr-1"
                  >
                    <MessageSquare size={11} />
                    Send SMS
                  </button>
                )}

                {/* Report Fraud */}
                {order.customer_phone && !order.is_archived && (
                  <button
                    onClick={() => setFraudOrder(order)}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg bg-red-600/15 text-red-400
                              border border-red-600/20 hover:bg-red-600/25 transition-colors mr-1"
                  >
                    <AlertCircle size={11} />
                    Report Fraud
                  </button>
                )}

                {/* Manual Fraud Check */}
                {order.customer_phone && !order.is_archived && (
                  <button
                    onClick={() => setViewFraudOrder(order)}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg bg-zinc-800 text-zinc-300
                              border border-zinc-700 hover:bg-zinc-700 transition-colors mr-1"
                  >
                    <ShieldCheck size={11} />
                    Check Fraud
                  </button>
                )}

                {/* Timeline */}
                <button
                  onClick={() => setTimelineOrderId(order.id)}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg bg-indigo-600/15 text-indigo-300
                            border border-indigo-600/20 hover:bg-indigo-600/25 transition-colors mr-1"
                >
                  <List size={11} /> Timeline
                </button>

                
                {/* Status actions */}
                {order.internal_status === "pending" && !order.is_archived && (
                  <button
                    onClick={() => updateSingleStatus(order.id, "preparing")}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg bg-amber-600/15 text-amber-300
                              border border-amber-600/20 hover:bg-amber-600/25 transition-colors"
                  >
                    <Package size={11} /> Preparing
                  </button>
                )}

                {order.internal_status !== "hold" && order.internal_status !== "cancelled" && !order.is_archived && (
                  <button
                    onClick={() => updateSingleStatus(order.id, "hold")}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg bg-orange-600/15 text-orange-300
                              border border-orange-600/20 hover:bg-orange-600/25 transition-colors"
                  >
                    <PauseCircle size={11} /> Hold
                  </button>
                )}

                {order.internal_status === "hold" && !order.is_archived && (
                  <button
                    onClick={() => updateSingleStatus(order.id, "preparing")}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg bg-indigo-600/15 text-indigo-300
                              border border-indigo-600/20 hover:bg-indigo-600/25 transition-colors"
                  >
                    Resume
                  </button>
                )}

                {order.internal_status !== "cancelled" && !order.is_archived && (
                  <button
                    onClick={() => updateSingleStatus(order.id, "cancelled")}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg bg-red-600/15 text-red-400
                              border border-red-600/20 hover:bg-red-600/25 transition-colors"
                  >
                    <X size={11} /> Cancel
                  </button>
                )}

                {/* Archive toggle */}
                {!order.is_archived ? (
                  <button
                    onClick={() => toggleArchive(order.id, true)}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg bg-zinc-800 text-zinc-400
                              border border-zinc-700/50 hover:bg-zinc-700 hover:text-zinc-200 transition-colors ml-auto"
                    title="Remove from dispatch list"
                  >
                    <Archive size={11} /> Remove
                  </button>
                ) : (
                  <button
                    onClick={() => toggleArchive(order.id, false)}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg bg-emerald-600/15 text-emerald-400
                              border border-emerald-600/20 hover:bg-emerald-600/25 transition-colors ml-auto"
                  >
                    <ArchiveRestore size={11} /> Restore
                  </button>
                )}
              </div>
            </div>
          );
        })}
        
        {/* Loading Spinner */}
        {(loadingMore || isPending) && (
          <div className="col-span-full py-8 flex justify-center">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}
        
        {/* Intersection Target */}
        <div ref={observerTarget} className="h-4 w-full"></div>
        
        {!hasMore && ordersList.length > 0 && (
          <div className="col-span-full py-6 text-center">
            <p className="text-xs font-medium text-zinc-600 uppercase tracking-widest">End of results</p>
          </div>
        )}

        {ordersList.length === 0 && !isPending && (
          <div className="col-span-full py-16 text-center">
            <div className="w-16 h-16 bg-zinc-900 border border-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <Package className="w-6 h-6 text-zinc-600" />
            </div>
            <h3 className="text-zinc-200 font-semibold text-base mb-1">No orders found</h3>
            <p className="text-sm text-zinc-500">Try adjusting your filters or search query.</p>
          </div>
        )}
      </div>

      {/* Dispatch Modal */}
      {dispatchOrder && (
        <DispatchModal
          order={dispatchOrder}
          storeId={pathaoStoreId}
          onClose={() => setDispatchOrder(null)}
          onSuccess={() => {
            setDispatchOrder(null);
            router.refresh();
          }}
        />
      )}

      {/* Bulk Dispatch Modal */}
      {bulkDispatchModalOpen && (
        <BulkDispatchModal
          orderIds={Array.from(selected)}
          storeId={pathaoStoreId}
          onClose={() => setBulkDispatchModalOpen(false)}
          onSuccess={() => {
            setBulkDispatchModalOpen(false);
            setSelected(new Set());
            router.refresh();
          }}
        />
      )}

      <SendSMSModal 
        isOpen={!!smsOrder} 
        onClose={() => setSmsOrder(null)} 
        order={smsOrder} 
      />

      <ReportFraudModal
        isOpen={!!fraudOrder}
        onClose={() => setFraudOrder(null)}
        order={fraudOrder}
      />
      
      <FraudDetailsModal
        order={viewFraudOrder}
        onClose={() => setViewFraudOrder(null)}
        onCheckAgain={manualFraudCheck}
        isChecking={isCheckingFraud}
      />

      <OrderTimelineModal
        orderId={timelineOrderId}
        open={!!timelineOrderId}
        onOpenChange={(open) => !open && setTimelineOrderId(null)}
      />
    </div>
  );
}
