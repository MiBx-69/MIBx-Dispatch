"use client";

import { useState, useTransition as reactTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  RotateCcw, Package, Search, TrendingDown, Truck, CheckCircle, XCircle,
  AlertCircle, Eye, ChevronDown, Clock, ArrowRight, Upload
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Return } from "@/types/database";

const STATUS_STYLES: Record<string, { label: string; class: string; icon: any }> = {
  pending_verification: { label: "Needs Admin Attention", class: "bg-amber-500/15 text-amber-400 border-amber-500/25", icon: AlertCircle },
  in_transit: { label: "In Transit", class: "bg-amber-500/15 text-amber-400 border-amber-500/20", icon: Truck },
  received: { label: "Received", class: "bg-blue-500/15 text-blue-400 border-blue-500/20", icon: Package },
  inspected: { label: "Inspected", class: "bg-indigo-500/15 text-indigo-400 border-indigo-500/20", icon: Eye },
  restocked: { label: "Restocked", class: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20", icon: CheckCircle },
  damaged: { label: "Damaged", class: "bg-red-500/15 text-red-400 border-red-500/20", icon: XCircle },
};

interface ReturnsClientProps {
  returns: any[];
  count: number;
  totalReturns: number;
  totalReturnValue: number;
  totalReturnFees: number;
  pendingReturns: number;
  processedReturns: number;
  needsAttentionCount?: number;
  currentFilter?: string;
  currentSearch?: string;
  page?: number;
  pageSize?: number;
}

export function ReturnsClient({
  returns: initialReturns,
  count,
  totalReturns,
  totalReturnValue,
  totalReturnFees,
  pendingReturns,
  processedReturns,
  needsAttentionCount = 0,
  currentFilter = "all",
  currentSearch = "",
  page = 1,
  pageSize = 25,
}: ReturnsClientProps) {
  const router = useRouter();
  const [returns, setReturns] = useState(initialReturns);
  const [filter, setFilter] = useState<string>(currentFilter);
  const [searchQuery, setSearchQuery] = useState(currentSearch);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [verificationRefundAmounts, setVerificationRefundAmounts] = useState<Record<string, string>>({});
  
  const [isPending, startTransition] = reactTransition();

  // Bulk state
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  const [isLoadingAllIds, setIsLoadingAllIds] = useState(false);
  const [bulkInputModalOpen, setBulkInputModalOpen] = useState(false);
  const [bulkInputText, setBulkInputText] = useState("");
  const [bulkStatus, setBulkStatus] = useState("received");
  const [bulkReturnClassification, setBulkReturnClassification] = useState<"normal" | "paid">("normal");
  const [bulkDeliveryFee, setBulkDeliveryFee] = useState<string>("60");
  
  // Bulk preview state
  const [previewData, setPreviewData] = useState<{ matched: any[], unmatched: string[] } | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);

  // Sync state if server data changes
  useEffect(() => {
    setReturns(initialReturns);
  }, [initialReturns]);

  // Load default shipping fee setting
  useEffect(() => {
    async function loadSettings() {
      try {
        const supabase = createClient();
        const { data } = await supabase.from("app_settings").select("delivery_charge_inside_dhaka").single();
        if (data?.delivery_charge_inside_dhaka) {
          setBulkDeliveryFee(String(data.delivery_charge_inside_dhaka));
        }
      } catch (e) {
        // Fallback to default
      }
    }
    loadSettings();
  }, []);

  // Debounced search & filter sync
  useEffect(() => {
    const handler = setTimeout(() => {
      if (searchQuery !== currentSearch || filter !== currentFilter) {
        startTransition(() => {
          const params = new URLSearchParams(window.location.search);
          if (searchQuery) params.set("search", searchQuery);
          else params.delete("search");
          
          if (filter && filter !== "all") params.set("filter", filter);
          else params.delete("filter");
          
          params.delete("page"); 
          router.push(`/returns?${params.toString()}`);
        });
      }
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery, filter, currentSearch, currentFilter, router]);

  const handlePageChange = (newPage: number) => {
    startTransition(() => {
      const params = new URLSearchParams(window.location.search);
      params.set("page", newPage.toString());
      router.push(`/returns?${params.toString()}`);
    });
  };

  const handlePageSizeChange = (newSize: string) => {
    startTransition(() => {
      const params = new URLSearchParams(window.location.search);
      params.set("pageSize", newSize);
      params.delete("page");
      router.push(`/returns?${params.toString()}`);
    });
  };

  const filteredReturns = returns;

  const updateReturnStatus = async (returnId: string, newStatus: string) => {
    setUpdatingId(returnId);
    try {
      const res = await fetch(`/api/returns/${returnId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update");
      }

      setReturns(prev => prev.map(r => r.id === returnId ? { ...r, status: newStatus } : r));
      toast.success(`Return status updated to ${STATUS_STYLES[newStatus]?.label || newStatus}`);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUpdatingId(null);
    }
  };

  const verifyPartialReturn = async (returnId: string) => {
    const amount = verificationRefundAmounts[returnId] || "";
    if (!amount || isNaN(Number(amount))) {
      toast.error("Please enter a valid refund deduction amount");
      return;
    }
    setUpdatingId(returnId);
    try {
      const res = await fetch(`/api/returns/${returnId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          status: "received", 
          is_verified: true,
          refund_amount: Number(amount)
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to verify return");
      }

      setReturns(prev => prev.map(r => r.id === returnId ? { 
        ...r, 
        status: "received",
        is_verified: true,
        refund_amount: Number(amount)
      } : r));
      toast.success("Partial return verified and order total updated");
      setVerificationRefundAmounts(prev => { const next = { ...prev }; delete next[returnId]; return next; });
      router.refresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUpdatingId(null);
    }
  };

  const undoReturn = async (returnId: string) => {
    if (!confirm("Mark this order as Not Delivered & Not Returned? It will remove the return record and move the order back to Dispatched/Old status.")) return;
    setUpdatingId(returnId);
    try {
      const res = await fetch(`/api/returns/${returnId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to mark as Not Delivered / Not Returned");

      setReturns(prev => prev.filter(r => r.id !== returnId));
      toast.success("Order marked as Not Delivered & Not Returned");
      router.refresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUpdatingId(null);
    }
  };

  const markSelectedAsNotDeliveredNotReturned = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Mark ${selected.size} order(s) as Not Delivered & Not Returned? This will remove the return records and move the orders back to Dispatched/Old status.`)) {
      return;
    }
    setIsBulkUpdating(true);
    try {
      const res = await fetch("/api/returns/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnIds: Array.from(selected) })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update orders");

      setReturns(prev => prev.filter(r => !selected.has(r.id)));
      toast.success(`Marked ${data.processed} order(s) as Not Delivered & Not Returned`);
      setSelected(new Set());
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to update orders");
    } finally {
      setIsBulkUpdating(false);
    }
  };

  const getNextStatus = (current: string): string | null => {
    const flow: Record<string, string> = {
      pending_verification: "received",
      in_transit: "received",
      received: "inspected",
    };
    return flow[current] || null;
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const selectAll = async (forceSelectAll = false) => {
    // If some or all are selected and not forced to select all, deselect all
    if (selected.size > 0 && !forceSelectAll) {
      setSelected(new Set());
      return;
    }

    // If count is within current page
    if (count <= filteredReturns.length && !forceSelectAll) {
      if (selected.size === filteredReturns.length) {
        setSelected(new Set());
      } else {
        setSelected(new Set(filteredReturns.map(r => r.id)));
      }
      return;
    }

    // Unlimited selection: fetch ALL matching IDs across all pages
    setIsLoadingAllIds(true);
    try {
      const params = new URLSearchParams();
      if (filter && filter !== "all") params.set("filter", filter);
      if (searchQuery) params.set("search", searchQuery);

      const res = await fetch(`/api/returns/ids?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to select all returns");

      setSelected(new Set(data.ids));
      toast.success(`Selected all ${data.total} returns across all pages`);
    } catch (err: any) {
      toast.error(err.message || "Failed to select all returns");
      setSelected(new Set(filteredReturns.map(r => r.id)));
    } finally {
      setIsLoadingAllIds(false);
    }
  };

  const selectCurrentPageOnly = () => {
    setSelected(new Set(filteredReturns.map(r => r.id)));
    toast.info(`Selected ${filteredReturns.length} returns on this page`);
  };

  const bulkUpdateStatus = async () => {
    if (selected.size === 0) return;
    if (bulkStatus === "cancel_return" || bulkStatus === "not_delivered_not_returned") {
      await markSelectedAsNotDeliveredNotReturned();
      return;
    }
    setIsBulkUpdating(true);
    try {

      const payload: any = {
        returnIds: Array.from(selected),
        status: bulkStatus
      };
      if (bulkStatus === "mark_paid") {
        payload.is_paid_return = true;
      } else if (bulkStatus === "mark_normal") {
        payload.is_paid_return = false;
      }

      const res = await fetch("/api/returns/bulk-status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error("Failed to bulk update");
      
      setReturns(prev => prev.map(r => {
        if (!selected.has(r.id)) return r;
        if (bulkStatus === "mark_paid") {
          return { ...r, is_paid_return: true, return_delivery_fee: 0 };
        }
        if (bulkStatus === "mark_normal") {
          return { ...r, is_paid_return: false };
        }
        return { ...r, status: bulkStatus };
      }));

      const actionLabel = bulkStatus === "mark_paid"
        ? "Paid Return"
        : bulkStatus === "mark_normal"
        ? "Normal Return"
        : (STATUS_STYLES[bulkStatus]?.label || bulkStatus);

      toast.success(`Bulk updated ${selected.size} returns to ${actionLabel}`);
      setSelected(new Set());
      router.refresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsBulkUpdating(false);
    }
  };

  const previewBulkInput = async () => {
    const identifiers = bulkInputText.split(/[\n,]+/).map(s => s.replace(/["']/g, '').trim()).filter(Boolean);
    if (identifiers.length === 0) return;
    
    setIsPreviewing(true);
    try {
      const res = await fetch("/api/returns/bulk-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifiers })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setPreviewData(data);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsPreviewing(false);
    }
  };

  const confirmBulkInput = async () => {
    if (!previewData || previewData.matched.length === 0) return;
    const readyOrders = previewData.matched.filter(m => !m.has_existing_return);
    if (readyOrders.length === 0) {
      toast.error("No valid unreturned orders to process.");
      return;
    }
    const identifiers = readyOrders.map(m => m.shopify_order_name);
    
    setIsBulkUpdating(true);
    try {
      const isPaid = bulkReturnClassification === "paid";
      const fee = isPaid ? 0 : (Number(bulkDeliveryFee) || 0);

      const res = await fetch("/api/returns/bulk-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifiers,
          is_paid_return: isPaid,
          return_delivery_fee: fee
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      
      toast.success(`Successfully processed ${data.processed} returns (${isPaid ? "Paid Return" : "Normal Return"}). ${data.failed > 0 ? `${data.failed} failed.` : ''}`);
      setBulkInputModalOpen(false);
      setBulkInputText("");
      setPreviewData(null);
      router.refresh();
      setTimeout(() => window.location.reload(), 1000);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsBulkUpdating(false);
    }
  };


  const statCards = [
    { label: "Total Returns", value: totalReturns, icon: RotateCcw, color: "text-rose-400", bg: "bg-rose-500/10", border: "border-rose-500/20", filterKey: "all" },
    { label: "Return Value", value: `৳${Number(totalReturnValue).toLocaleString()}`, icon: TrendingDown, color: "text-rose-400", bg: "bg-rose-500/10", border: "border-rose-500/20", isText: true },
    { label: "Return Fees", value: `৳${Number(totalReturnFees).toLocaleString()}`, icon: Truck, color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20", isText: true },
    { label: "Needs Attention", value: needsAttentionCount, icon: AlertCircle, color: "text-amber-400", bg: "bg-amber-500/15", border: "border-amber-500/35", filterKey: "pending_verification" },
    { label: "In Pipeline", value: pendingReturns, icon: Clock, color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20" },
    { label: "Processed", value: processedReturns, icon: CheckCircle, color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
  ];

  return (
    <>
      <div className="space-y-6 animate-fade-in pb-20">
        {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <RotateCcw className="w-6 h-6 text-rose-400" />
            Returns Management
          </h1>
          <p className="text-sm text-zinc-500 mt-1">Track and manage returned orders</p>
        </div>
        <button
          onClick={() => setBulkInputModalOpen(true)}
          className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-4 py-2 rounded-xl text-sm font-medium transition-colors border border-zinc-700 shrink-0"
        >
          <Upload className="w-4 h-4" />
          Bulk Input Returns
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3">
        {statCards.map((stat) => (
          <div
            key={stat.label}
            onClick={() => stat.filterKey && setFilter(stat.filterKey)}
            className={`${stat.bg} border ${stat.border} rounded-2xl p-3.5 flex flex-col justify-center ${stat.filterKey ? "cursor-pointer hover:opacity-90 transition-opacity" : ""}`}
          >
            <p className={`text-[11px] font-medium ${stat.color} opacity-80 uppercase tracking-wider`}>{stat.label}</p>
            <p className={`text-lg sm:text-xl font-bold ${stat.color} mt-1 flex items-center gap-1.5`}>
              <stat.icon className="w-3.5 h-3.5 shrink-0" />
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <div className="flex items-center gap-2">
          <button 
            onClick={() => selectAll()} 
            disabled={isLoadingAllIds}
            className="px-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-sm font-medium text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors whitespace-nowrap flex items-center gap-2 disabled:opacity-50"
          >
            {isLoadingAllIds ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                Selecting all {count}...
              </>
            ) : selected.size > 0 ? (
              `Deselect All (${selected.size})`
            ) : (
              `Select All (${count})`
            )}
          </button>

          {count > filteredReturns.length && selected.size === 0 && (
            <button
              onClick={selectCurrentPageOnly}
              className="px-3 py-2.5 bg-zinc-900/60 border border-zinc-800/80 rounded-xl text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors whitespace-nowrap"
              title="Select only the returns shown on this page"
            >
              Select Page ({filteredReturns.length})
            </button>
          )}
        </div>

        {selected.size > 0 && (
          <button
            onClick={markSelectedAsNotDeliveredNotReturned}
            disabled={isBulkUpdating}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 whitespace-nowrap shadow-sm"
            title="Mark selected orders as Not Delivered & Not Returned"
          >
            <RotateCcw size={15} />
            Not Delivered / Not Returned ({selected.size})
          </button>
        )}

        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by order, customer, phone, consignment..."
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700"
          />
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-zinc-700"
        >
          <option value="all">All Statuses</option>
          <option value="pending_verification">⚠️ Needs Admin Attention ({needsAttentionCount})</option>
          <option value="in_transit">In Transit</option>
          <option value="received">Received</option>
          <option value="inspected">Inspected</option>
          <option value="restocked">Restocked</option>
          <option value="damaged">Damaged</option>
        </select>
      </div>

      {/* Admin Attention Section for Partial Returns */}
      {needsAttentionCount > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-3">
            <span className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">
              <AlertCircle size={18} />
            </span>
            <div>
              <p className="font-bold text-amber-200 text-xs sm:text-sm flex items-center gap-2">
                {needsAttentionCount} Partial Return{needsAttentionCount > 1 ? "s" : ""} Awaiting Admin Attention & Approval
              </p>
              <p className="text-amber-300/80 text-[11px] sm:text-xs mt-0.5">
                These orders have partial return/refund entries from Shopify. They are held here so you can verify returned items before applying revenue deductions.
              </p>
            </div>
          </div>

          <button
            onClick={() => setFilter(filter === "pending_verification" ? "all" : "pending_verification")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all shadow-sm whitespace-nowrap flex items-center gap-1.5 shrink-0 ${
              filter === "pending_verification"
                ? "bg-amber-500 text-zinc-950 font-bold"
                : "bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30"
            }`}
          >
            <AlertCircle size={13} />
            {filter === "pending_verification" ? "Showing Needs Attention" : "View Attention Section"}
          </button>
        </div>
      )}

      {/* Helper Banner when only page was selected and more exist */}
      {selected.size === filteredReturns.length && count > filteredReturns.length && (
        <div className="bg-indigo-500/10 border border-indigo-500/25 rounded-xl px-4 py-2.5 flex items-center justify-between text-xs text-indigo-300 animate-in fade-in">
          <span>All <strong>{filteredReturns.length}</strong> returns on this page are selected.</span>
          <button
            onClick={() => selectAll(true)}
            disabled={isLoadingAllIds}
            className="underline hover:text-white font-semibold ml-2 disabled:opacity-50"
          >
            {isLoadingAllIds ? "Selecting..." : `Select all ${count} returns matching current filters`}
          </button>
        </div>
      )}

      {/* Status Pipeline Indicator */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
        <div className="flex items-center justify-center gap-2 text-xs font-medium flex-wrap">
          {["pending_verification", "in_transit", "received", "inspected"].map((s, i) => {
            const style = STATUS_STYLES[s];
            return (
              <div key={s} className="flex items-center gap-2">
                <span className={`px-3 py-1.5 rounded-lg border ${style.class}`}>{style.label}</span>
                {i < 2 && <ArrowRight className="w-3 h-3 text-zinc-600" />}
              </div>
            );
          })}
          <ArrowRight className="w-3 h-3 text-zinc-600" />
          <div className="flex items-center gap-1">
            <span className={`px-3 py-1.5 rounded-lg border ${STATUS_STYLES.restocked.class}`}>Restocked</span>
            <span className="text-zinc-600">/</span>
            <span className={`px-3 py-1.5 rounded-lg border ${STATUS_STYLES.damaged.class}`}>Damaged</span>
          </div>
        </div>
      </div>

      {/* Returns List */}
      {filteredReturns.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-10 text-center">
          <RotateCcw className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
          <p className="text-zinc-400 font-medium">No returns found</p>
          <p className="text-zinc-600 text-sm mt-1">Returns will appear here when orders are marked as returned.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredReturns.map((ret) => {
            const order = ret.orders;
            const statusInfo = STATUS_STYLES[ret.status] || STATUS_STYLES.received;
            const StatusIcon = statusInfo.icon;
            const isExpanded = expandedId === ret.id;
            const nextStatus = getNextStatus(ret.status);
            const lineItems = (order?.line_items as any[]) || [];
            const returnedItems = (ret.returned_items as any[]) || [];
            const returnDate = ret.returned_at ? new Date(ret.returned_at) : null;

            return (
              <div
                key={ret.id}
                className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden transition-all hover:border-zinc-700"
              >
                {/* Main Row */}
                <div
                  className="p-4 flex items-center gap-4 cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : ret.id)}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(ret.id)}
                    onChange={() => toggleSelect(ret.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-zinc-900 shrink-0"
                  />
                  
                  {/* Status Icon */}
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${statusInfo.class} border`}>
                    <StatusIcon size={18} />
                  </div>

                  {/* Order Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-zinc-100">{order?.shopify_order_name || "Unknown"}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${statusInfo.class}`}>
                        {statusInfo.label}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                        ret.return_source === 'pathao_webhook'
                          ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                          : 'bg-violet-500/10 text-violet-400 border border-violet-500/20'
                      }`}>
                        {ret.return_source === 'pathao_webhook' ? 'Pathao' : 'Manual'}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                        ret.return_type === 'partial'
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                      }`}>
                        {ret.return_type === 'partial' ? 'Partial' : 'Full'}
                      </span>
                      {ret.is_paid_return ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          Paid Return
                        </span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
                          Normal Return
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {order?.customer_name} • {ret.return_reason || "No reason"} • {returnDate ? returnDate.toLocaleDateString() : ""}
                    </p>
                  </div>

                  {/* Amount */}
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-rose-400">
                      ৳{Number(
                        ret.return_type === 'partial'
                          ? (ret.refund_amount || (Array.isArray(ret.returned_items) && ret.returned_items.length > 0 && ret.returned_items.reduce((s: number, i: any) => s + (Number(i.price || 0) * Number(i.quantity || 1)), 0)) || ret.order_total || 0)
                          : (ret.order_total || order?.total_price || 0)
                      ).toLocaleString()}
                    </p>
                    {ret.is_paid_return ? (
                      <p className="text-[10px] text-emerald-400 font-medium">Paid (৳0 loss)</p>
                    ) : Number(ret.return_delivery_fee) > 0 ? (
                      <p className="text-[10px] text-amber-400/80">+৳{Number(ret.return_delivery_fee).toLocaleString()} fee</p>
                    ) : (
                      <p className="text-[10px] text-zinc-500">Normal</p>
                    )}
                  </div>

                  <ChevronDown className={`w-4 h-4 text-zinc-500 shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="border-t border-zinc-800 bg-zinc-950/50 p-4 space-y-3">
                    {/* Details Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                      <div>
                        <p className="text-zinc-500 mb-0.5">Return Type</p>
                        <p className="text-zinc-200 font-medium capitalize">{ret.return_type}</p>
                      </div>
                      <div>
                        <p className="text-zinc-500 mb-0.5">Classification</p>
                        <p className={`font-medium ${ret.is_paid_return ? "text-emerald-400" : "text-rose-400"}`}>
                          {ret.is_paid_return ? "Paid Return (No Loss)" : `Normal Return (Fee: ৳${Number(ret.return_delivery_fee || 0).toLocaleString()})`}
                        </p>
                      </div>
                      <div>
                        <p className="text-zinc-500 mb-0.5">Consignment</p>
                        <p className="text-zinc-200 font-medium font-mono">{ret.consignment_id || "—"}</p>
                      </div>
                      <div>
                        <p className="text-zinc-500 mb-0.5">Return Date</p>
                        <p className="text-zinc-200 font-medium">{returnDate?.toLocaleString() || "—"}</p>
                      </div>
                      <div>
                        <p className="text-zinc-500 mb-0.5">Processed At</p>
                        <p className="text-zinc-200 font-medium">{ret.processed_at ? new Date(ret.processed_at).toLocaleString() : "Pending"}</p>
                      </div>
                    </div>

                    {/* Line Items */}
                    {lineItems.length > 0 && !returnedItems.length && (
                      <div>
                        <p className="text-xs text-zinc-500 mb-1.5">Items</p>
                        <div className="flex flex-wrap gap-1.5">
                          {lineItems.map((item: any, i: number) => (
                            <span key={i} className="text-[11px] bg-zinc-800 text-zinc-300 px-2 py-1 rounded-lg">
                              {item.quantity}× {item.title || item.name}
                              {item.variant_title && <span className="text-zinc-500"> ({item.variant_title})</span>}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Returned Items for Partial */}
                    {returnedItems.length > 0 && (
                      <div className="bg-zinc-950 border border-amber-500/20 rounded-xl p-3">
                        <p className="text-xs font-medium text-amber-400/80 mb-2 flex items-center gap-1.5">
                          <Package size={14} /> Returned Items
                        </p>
                        <div className="space-y-1">
                          {returnedItems.map((item: any, i: number) => (
                            <div key={i} className="flex items-center justify-between text-sm">
                              <span className="text-zinc-300">{item.name}</span>
                              <span className="text-zinc-400 font-medium bg-zinc-900 px-2 py-0.5 rounded-lg">{item.quantity} returned</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Notes */}
                    {ret.notes && (
                      <div>
                        <p className="text-xs text-zinc-500 mb-1">Notes</p>
                        <p className="text-xs text-zinc-300 bg-zinc-800/50 p-2 rounded-lg">{ret.notes}</p>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-2 border-t border-zinc-800 flex-wrap">
                      
                      {/* Verification UI */}
                      {ret.status === "pending_verification" && !ret.is_verified && (
                        <div className="w-full bg-fuchsia-500/10 border border-fuchsia-500/20 p-3 rounded-xl mb-2 flex flex-col sm:flex-row gap-3 items-end">
                          <div className="flex-1 w-full">
                            <label className="block text-xs font-medium text-fuchsia-400/80 mb-1.5">Refund Deduction (BDT) *</label>
                            <input
                              type="number"
                              value={verificationRefundAmounts[ret.id] || ""}
                              onChange={(e) => setVerificationRefundAmounts(prev => ({ ...prev, [ret.id]: e.target.value }))}
                              placeholder="Amount to deduct from order total"
                              className="w-full bg-zinc-950 border border-fuchsia-500/30 rounded-lg px-3 py-2 text-zinc-100 text-sm focus:outline-none focus:border-fuchsia-500"
                            />
                            <p className="text-[10px] text-zinc-500 mt-1">This amount will be subtracted from the order's total revenue.</p>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); verifyPartialReturn(ret.id); }}
                            disabled={updatingId === ret.id || !(verificationRefundAmounts[ret.id])}
                            className="w-full sm:w-auto flex items-center justify-center gap-1.5 bg-fuchsia-500 hover:bg-fuchsia-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                          >
                            <CheckCircle size={16} /> Verify & Approve
                          </button>
                        </div>
                      )}

                      {/* Next status button */}
                      {nextStatus && ret.status !== "pending_verification" && (
                        <button
                          onClick={(e) => { e.stopPropagation(); updateReturnStatus(ret.id, nextStatus); }}
                          disabled={updatingId === ret.id}
                          className="flex items-center gap-1.5 bg-indigo-500/15 text-indigo-400 hover:bg-indigo-500/25 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border border-indigo-500/20 disabled:opacity-50"
                        >
                          <ArrowRight size={14} />
                          Move to {STATUS_STYLES[nextStatus]?.label}
                        </button>
                      )}

                      {/* Final status buttons (only shown after inspected) */}
                      {ret.status === "inspected" && (
                        <>
                          <button
                            onClick={(e) => { e.stopPropagation(); updateReturnStatus(ret.id, "restocked"); }}
                            disabled={updatingId === ret.id}
                            className="flex items-center gap-1.5 bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border border-emerald-500/20 disabled:opacity-50"
                          >
                            <CheckCircle size={14} /> Restocked
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); updateReturnStatus(ret.id, "damaged"); }}
                            disabled={updatingId === ret.id}
                            className="flex items-center gap-1.5 bg-red-500/15 text-red-400 hover:bg-red-500/25 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border border-red-500/20 disabled:opacity-50"
                          >
                            <XCircle size={14} /> Damaged
                          </button>
                        </>
                      )}

                      {/* Undo return */}
                      {/* Not Delivered / Not Returned */}
                      <button
                        onClick={(e) => { e.stopPropagation(); undoReturn(ret.id); }}
                        disabled={updatingId === ret.id}
                        className="ml-auto flex items-center gap-1.5 text-rose-300 hover:text-rose-200 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                        title="Mark this order as Not Delivered & Not Returned"
                      >
                        <RotateCcw size={14} /> Not Delivered / Not Returned
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      
      {/* Pagination Controls */}
      {count > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 border-t border-zinc-800">
          <p className="text-sm text-zinc-400">
            Showing <span className="font-medium text-zinc-200">{Math.min((page - 1) * pageSize + 1, count)}</span> to <span className="font-medium text-zinc-200">{Math.min(page * pageSize, count)}</span> of <span className="font-medium text-zinc-200">{count}</span> results
          </p>
          <div className="flex items-center gap-2 flex-wrap justify-center">
            {count > pageSize && (
              <>
                <button
                  onClick={() => handlePageChange(page - 1)}
                  disabled={page === 1 || isPending}
                  className="px-3 py-1.5 text-sm font-medium text-zinc-300 bg-zinc-900 border border-zinc-700 rounded-lg hover:bg-zinc-800 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Previous
                </button>
                <div className="text-sm font-medium text-zinc-400">
                  Page {page} of {Math.ceil(count / pageSize) || 1}
                </div>
                <button
                  onClick={() => handlePageChange(page + 1)}
                  disabled={page >= Math.ceil(count / pageSize) || isPending}
                  className="px-3 py-1.5 text-sm font-medium text-zinc-300 bg-zinc-900 border border-zinc-700 rounded-lg hover:bg-zinc-800 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </>
            )}

            <div className="flex items-center gap-1 sm:ml-2 sm:pl-2 border-t sm:border-t-0 sm:border-l border-zinc-800 pt-2 sm:pt-0 text-xs text-zinc-400">
              <span className="text-zinc-500 mr-1">Show:</span>
              {[25, 50, 100].map((size) => (
                <button
                  key={size}
                  onClick={() => handlePageSizeChange(size.toString())}
                  className={`px-2 py-1 rounded text-xs transition-colors ${
                    pageSize === size ? "bg-indigo-600 text-white font-bold" : "hover:bg-zinc-800 text-zinc-400"
                  }`}
                >
                  {size}
                </button>
              ))}
              <button
                onClick={() => handlePageSizeChange("all")}
                className={`px-2 py-1 rounded text-xs transition-colors ${
                  pageSize >= 5000 ? "bg-indigo-600 text-white font-bold" : "hover:bg-zinc-800 text-zinc-400"
                }`}
                title="Show all returns on one page"
              >
                All ({count})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>

    {/* Fixed Bulk Action Bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-zinc-900 border border-zinc-800 p-3 rounded-2xl shadow-2xl flex flex-wrap items-center gap-3 z-50 animate-slide-up max-w-[95vw]">
          <div className="flex items-center gap-2 px-2">
            <div className="bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded-md text-xs font-bold">
              {selected.size}
            </div>
            <span className="text-sm text-zinc-300 font-medium">selected</span>
          </div>
          
          <div className="h-6 w-px bg-zinc-800 hidden sm:block"></div>
          
          <select
            value={bulkStatus}
            onChange={(e) => setBulkStatus(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm text-zinc-300 focus:outline-none focus:border-zinc-700"
          >
            <optgroup label="Status Actions">
              <option value="received">Mark as Received</option>
              <option value="inspected">Mark as Inspected</option>
              <option value="restocked">Mark as Restocked</option>
              <option value="damaged">Mark as Damaged</option>
            </optgroup>
            <optgroup label="Classification">
              <option value="mark_paid">Mark as Paid Return</option>
              <option value="mark_normal">Mark as Normal Return</option>
            </optgroup>
            <optgroup label="Revert">
              <option value="not_delivered_not_returned">Not Delivered / Not Returned</option>
              <option value="cancel_return">Cancel Return (Move to Old Status)</option>
            </optgroup>
          </select>
          
          <button
            onClick={bulkUpdateStatus}
            disabled={isBulkUpdating}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {isBulkUpdating ? "Updating..." : "Apply"}
          </button>

          <div className="h-6 w-px bg-zinc-800 hidden sm:block"></div>

          {/* Dedicated CTA Button for Not Delivered / Not Returned */}
          <button
            onClick={markSelectedAsNotDeliveredNotReturned}
            disabled={isBulkUpdating}
            className="flex items-center gap-1.5 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 whitespace-nowrap shadow-sm"
            title="Mark selected orders as Not Delivered & Not Returned"
          >
            <RotateCcw size={14} />
            Not Delivered / Not Returned
          </button>
          
          <button
            onClick={() => setSelected(new Set())}
            className="text-zinc-500 hover:text-zinc-300 p-1 transition-colors ml-1"
            title="Deselect All"
          >
            <XCircle className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Bulk Input Modal */}
      {bulkInputModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between shrink-0">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Upload className="w-5 h-5 text-indigo-400" />
                Bulk Input Returns {previewData && " - Preview"}
              </h2>
              <button 
                onClick={() => { setBulkInputModalOpen(false); setPreviewData(null); }} 
                className="text-zinc-500 hover:text-white transition-colors"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-4 overflow-y-auto space-y-4">
              {!previewData ? (
                <div className="space-y-4">
                  {/* Return Classification Option */}
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                      Return Classification
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setBulkReturnClassification("normal");
                          if (!bulkDeliveryFee) setBulkDeliveryFee("60");
                        }}
                        className={`flex flex-col p-3 rounded-xl border text-left transition-all ${
                          bulkReturnClassification === "normal"
                            ? "bg-rose-500/10 border-rose-500/40 text-rose-300 ring-1 ring-rose-500/30"
                            : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                        }`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <div className="flex items-center gap-2 font-semibold text-sm text-rose-300">
                            <RotateCcw className="w-4 h-4 text-rose-400" />
                            Normal Return
                          </div>
                          {bulkReturnClassification === "normal" && (
                            <span className="w-2 h-2 rounded-full bg-rose-400"></span>
                          )}
                        </div>
                        <span className="text-xs text-zinc-500 mt-1">
                          Standard courier return with return delivery fee
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setBulkReturnClassification("paid")}
                        className={`flex flex-col p-3 rounded-xl border text-left transition-all ${
                          bulkReturnClassification === "paid"
                            ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-300 ring-1 ring-emerald-500/30"
                            : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                        }`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <div className="flex items-center gap-2 font-semibold text-sm text-emerald-300">
                            <CheckCircle className="w-4 h-4 text-emerald-400" />
                            Paid Return
                          </div>
                          {bulkReturnClassification === "paid" && (
                            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                          )}
                        </div>
                        <span className="text-xs text-zinc-500 mt-1">
                          Customer paid return (৳0 delivery fee loss)
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Return Delivery Fee (only for Normal Return) */}
                  {bulkReturnClassification === "normal" && (
                    <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 space-y-1.5 animate-in fade-in duration-150">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium text-zinc-300">
                          Return Delivery Fee per Order (BDT)
                        </label>
                        <span className="text-[11px] text-zinc-500">Store loss deduction</span>
                      </div>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={bulkDeliveryFee}
                        onChange={(e) => setBulkDeliveryFee(e.target.value)}
                        placeholder="e.g. 60"
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-rose-500/50 placeholder:text-zinc-600"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-2">
                      Paste Consignment IDs or Order Names
                    </label>
                    <textarea
                      value={bulkInputText}
                      onChange={(e) => setBulkInputText(e.target.value)}
                      placeholder="e.g. 1399&#10;1400&#10;P12345678"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500 h-48 font-mono placeholder:text-zinc-700"
                    />
                    <p className="text-xs text-zinc-500 mt-2">
                      Paste one identifier per line. The system will find the matching orders and mark them as returned.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Classification Selector in Preview */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-zinc-950 border border-zinc-800 rounded-xl">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-400">Classifying as:</span>
                      {bulkReturnClassification === "paid" ? (
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5">
                          <CheckCircle className="w-3.5 h-3.5" />
                          Paid Return (৳0 Fee)
                        </span>
                      ) : (
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center gap-1.5">
                          <RotateCcw className="w-3.5 h-3.5" />
                          Normal Return (৳{bulkDeliveryFee || "0"} Fee)
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 p-1 rounded-lg">
                      <button
                        type="button"
                        onClick={() => setBulkReturnClassification("normal")}
                        className={`text-xs px-2.5 py-1 rounded-md font-medium transition-all ${
                          bulkReturnClassification === "normal"
                            ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                            : "text-zinc-400 hover:text-zinc-200"
                        }`}
                      >
                        Normal
                      </button>
                      <button
                        type="button"
                        onClick={() => setBulkReturnClassification("paid")}
                        className={`text-xs px-2.5 py-1 rounded-md font-medium transition-all ${
                          bulkReturnClassification === "paid"
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                            : "text-zinc-400 hover:text-zinc-200"
                        }`}
                      >
                        Paid
                      </button>
                    </div>
                  </div>

                  {/* Matched Orders */}
                  <div>
                    <h3 className="text-sm font-semibold text-emerald-400 mb-2 flex items-center gap-2">
                      <CheckCircle className="w-4 h-4" />
                      Matched Orders ({previewData.matched.length})
                    </h3>
                    {previewData.matched.length > 0 ? (
                      <div className="bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden divide-y divide-zinc-800">
                        {previewData.matched.map((order: any) => (
                          <div key={order.id} className="p-3 flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium text-zinc-200">{order.shopify_order_name}</p>
                              <p className="text-xs text-zinc-500">{order.customer_name}</p>
                            </div>
                            <div className="text-right">
                              {order.has_existing_return ? (
                                <span className="text-xs font-medium bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded border border-amber-500/20">
                                  Already Returned
                                </span>
                              ) : (
                                <span className="text-xs font-medium bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20">
                                  Ready
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-zinc-500 italic">No valid orders found to process.</p>
                    )}
                  </div>
                  
                  {/* Unmatched Identifiers */}
                  {previewData.unmatched.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-rose-400 mb-2 flex items-center gap-2">
                        <XCircle className="w-4 h-4" />
                        Unmatched Identifiers ({previewData.unmatched.length})
                      </h3>
                      <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 flex flex-wrap gap-2">
                        {previewData.unmatched.map((id: string, i: number) => (
                          <span key={i} className="text-xs bg-rose-500/10 text-rose-400 border border-rose-500/20 px-2 py-1 rounded">
                            {id}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            
            <div className="p-4 border-t border-zinc-800 flex justify-end gap-3 bg-zinc-950/50 shrink-0">
              <button
                onClick={() => {
                  if (previewData) {
                    setPreviewData(null);
                  } else {
                    setBulkInputModalOpen(false);
                  }
                }}
                className="px-4 py-2 rounded-xl text-sm font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                {previewData ? "Back" : "Cancel"}
              </button>
              
              {!previewData ? (
                <button
                  onClick={previewBulkInput}
                  disabled={isPreviewing || !bulkInputText.trim()}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 transition-colors disabled:opacity-50"
                >
                  {isPreviewing ? "Analyzing..." : "Review Matches"}
                </button>
              ) : (
                <button
                  onClick={confirmBulkInput}
                  disabled={isBulkUpdating || previewData.matched.filter((m: any) => !m.has_existing_return).length === 0}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 transition-colors disabled:opacity-50"
                >
                  {isBulkUpdating
                    ? "Processing..."
                    : `Confirm ${previewData.matched.filter((m: any) => !m.has_existing_return).length} ${
                        bulkReturnClassification === "paid" ? "Paid" : "Normal"
                      } Returns`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
