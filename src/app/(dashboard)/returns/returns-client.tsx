"use client";

import { useState, useTransition as reactTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  RotateCcw, Package, Search, TrendingDown, Truck, CheckCircle, XCircle,
  AlertCircle, Eye, ChevronDown, Clock, ArrowRight, Upload
} from "lucide-react";
import type { Return } from "@/types/database";

const STATUS_STYLES: Record<string, { label: string; class: string; icon: any }> = {
  pending_verification: { label: "Pending Verification", class: "bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/20", icon: AlertCircle },
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
  const [bulkInputModalOpen, setBulkInputModalOpen] = useState(false);
  const [bulkInputText, setBulkInputText] = useState("");
  const [bulkStatus, setBulkStatus] = useState("received");
  
  // Bulk preview state
  const [previewData, setPreviewData] = useState<{ matched: any[], unmatched: string[] } | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);

  // Sync state if server data changes
  useEffect(() => {
    setReturns(initialReturns);
  }, [initialReturns]);

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
    if (!confirm("Are you sure you want to undo this return? The order will be set back to 'dispatched'.")) return;
    setUpdatingId(returnId);
    try {
      const res = await fetch(`/api/returns/${returnId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to undo return");

      setReturns(prev => prev.filter(r => r.id !== returnId));
      toast.success("Return undone successfully");
      router.refresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUpdatingId(null);
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

  const selectAll = () => {
    if (selected.size === filteredReturns.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredReturns.map(r => r.id)));
    }
  };

  const bulkUpdateStatus = async () => {
    if (selected.size === 0) return;
    setIsBulkUpdating(true);
    try {
      const res = await fetch("/api/returns/bulk-status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          returnIds: Array.from(selected),
          status: bulkStatus
        })
      });
      if (!res.ok) throw new Error("Failed to bulk update");
      
      setReturns(prev => prev.map(r => selected.has(r.id) ? { ...r, status: bulkStatus } : r));
      toast.success(`Bulk updated ${selected.size} returns to ${STATUS_STYLES[bulkStatus]?.label || bulkStatus}`);
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
    const identifiers = previewData.matched.map(m => m.shopify_order_name);
    
    setIsBulkUpdating(true);
    try {
      const res = await fetch("/api/returns/bulk-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifiers })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      
      toast.success(`Successfully processed ${data.processed} returns. ${data.failed > 0 ? `${data.failed} failed.` : ''}`);
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
    { label: "Total Returns", value: totalReturns, icon: RotateCcw, color: "text-rose-400", bg: "bg-rose-500/10", border: "border-rose-500/20" },
    { label: "Return Value", value: `৳${Number(totalReturnValue).toLocaleString()}`, icon: TrendingDown, color: "text-rose-400", bg: "bg-rose-500/10", border: "border-rose-500/20", isText: true },
    { label: "Return Fees", value: `৳${Number(totalReturnFees).toLocaleString()}`, icon: Truck, color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20", isText: true },
    { label: "Pending", value: pendingReturns, icon: Clock, color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20" },
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
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {statCards.map((stat) => (
          <div key={stat.label} className={`${stat.bg} border ${stat.border} rounded-2xl p-4 flex flex-col justify-center`}>
            <p className={`text-xs font-medium ${stat.color} opacity-80 uppercase tracking-wider`}>{stat.label}</p>
            <p className={`text-xl sm:text-2xl font-bold ${stat.color} mt-1 flex items-center gap-2`}>
              <stat.icon className="w-4 h-4 shrink-0" />
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <button 
          onClick={selectAll} 
          className="px-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-sm font-medium text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors whitespace-nowrap"
        >
          {selected.size > 0 ? "Deselect All" : "Select All"}
        </button>
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
          <option value="pending_verification">Pending Verification</option>
          <option value="in_transit">In Transit</option>
          <option value="received">Received</option>
          <option value="inspected">Inspected</option>
          <option value="restocked">Restocked</option>
          <option value="damaged">Damaged</option>
        </select>
      </div>

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
                    </div>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {order?.customer_name} • {ret.return_reason || "No reason"} • {returnDate ? returnDate.toLocaleDateString() : ""}
                    </p>
                  </div>

                  {/* Amount */}
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-rose-400">৳{Number(ret.order_total || order?.total_price || 0).toLocaleString()}</p>
                    {Number(ret.return_delivery_fee) > 0 && (
                      <p className="text-[10px] text-amber-400/80">+৳{Number(ret.return_delivery_fee).toLocaleString()} fee</p>
                    )}
                  </div>

                  <ChevronDown className={`w-4 h-4 text-zinc-500 shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="border-t border-zinc-800 bg-zinc-950/50 p-4 space-y-3">
                    {/* Details Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div>
                        <p className="text-zinc-500 mb-0.5">Return Type</p>
                        <p className="text-zinc-200 font-medium capitalize">{ret.return_type}</p>
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
                      <button
                        onClick={(e) => { e.stopPropagation(); undoReturn(ret.id); }}
                        disabled={updatingId === ret.id}
                        className="ml-auto flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                      >
                        <RotateCcw size={14} /> Undo Return
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
      {count > pageSize && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 border-t border-zinc-800">
          <p className="text-sm text-zinc-400">
            Showing <span className="font-medium text-zinc-200">{Math.min((page - 1) * pageSize + 1, count)}</span> to <span className="font-medium text-zinc-200">{Math.min(page * pageSize, count)}</span> of <span className="font-medium text-zinc-200">{count}</span> results
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePageChange(page - 1)}
              disabled={page === 1 || isPending}
              className="px-3 py-1.5 text-sm font-medium text-zinc-300 bg-zinc-900 border border-zinc-700 rounded-lg hover:bg-zinc-800 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <div className="text-sm font-medium text-zinc-400">
              Page {page} of {Math.ceil(count / pageSize)}
            </div>
            <button
              onClick={() => handlePageChange(page + 1)}
              disabled={page >= Math.ceil(count / pageSize) || isPending}
              className="px-3 py-1.5 text-sm font-medium text-zinc-300 bg-zinc-900 border border-zinc-700 rounded-lg hover:bg-zinc-800 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>

    {/* Fixed Bulk Action Bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-zinc-900 border border-zinc-800 p-3 rounded-2xl shadow-2xl flex items-center gap-4 z-50 animate-slide-up">
          <div className="flex items-center gap-2 px-2">
            <div className="bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded-md text-xs font-bold">
              {selected.size}
            </div>
            <span className="text-sm text-zinc-300 font-medium">selected</span>
          </div>
          
          <div className="h-6 w-px bg-zinc-800"></div>
          
          <select
            value={bulkStatus}
            onChange={(e) => setBulkStatus(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm text-zinc-300 focus:outline-none focus:border-zinc-700"
          >
            <option value="received">Mark as Received</option>
            <option value="inspected">Mark as Inspected</option>
            <option value="restocked">Mark as Restocked</option>
            <option value="damaged">Mark as Damaged</option>
          </select>
          
          <button
            onClick={bulkUpdateStatus}
            disabled={isBulkUpdating}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {isBulkUpdating ? "Updating..." : "Apply"}
          </button>
          
          <button
            onClick={() => setSelected(new Set())}
            className="text-zinc-500 hover:text-zinc-300 p-1 transition-colors ml-1"
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
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-2">
                    Paste Consignment IDs or Order Names
                  </label>
                  <textarea
                    value={bulkInputText}
                    onChange={(e) => setBulkInputText(e.target.value)}
                    placeholder="e.g. 1399&#10;1400&#10;P12345678"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500 h-64 font-mono placeholder:text-zinc-700"
                  />
                  <p className="text-xs text-zinc-500 mt-2">
                    Paste one identifier per line. The system will find the matching orders and mark them as returned.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
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
                  {isBulkUpdating ? "Processing..." : `Confirm ${previewData.matched.filter((m: any) => !m.has_existing_return).length} Returns`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
