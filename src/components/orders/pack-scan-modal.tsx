"use client";

import { useState, useEffect, useRef } from "react";
import {
  X,
  Search,
  ScanBarcode,
  CheckCircle2,
  Circle,
  Package,
  AlertTriangle,
  Loader2,
  Truck,
  Printer,
  User,
  Phone,
  MapPin,
  Clock,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import type { Order } from "@/types/database";

interface PackScanModalProps {
  open: boolean;
  onClose: () => void;
  onOpenDispatch?: (order: Order) => void;
}

interface PackVerificationInfo {
  verified_at: string;
  packed_by: string;
  verified_items: string[];
}

export function PackScanModal({ open, onClose, onOpenDispatch }: PackScanModalProps) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState<Order | null>(null);
  const [verification, setVerification] = useState<PackVerificationInfo | null>(null);
  const [checkedItems, setCheckedItems] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [scanFeedback, setScanFeedback] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
      setQuery("");
      setOrder(null);
      setVerification(null);
      setCheckedItems({});
      setScanFeedback(null);
    }
  }, [open]);

  // Handle hardware barcode scanner rapid input
  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanQuery = query.trim();
    if (!cleanQuery) return;

    setLoading(true);
    setScanFeedback(null);
    try {
      const res = await fetch(`/api/orders/pack-verify?query=${encodeURIComponent(cleanQuery)}`);
      const data = await res.json();

      if (!res.ok || !data.order) {
        toast.error(data.error || `No order found matching "${cleanQuery}"`);
        setOrder(null);
        setVerification(null);
        return;
      }

      setOrder(data.order);
      setVerification(data.packingVerification || null);

      // Initialize checked items from prior verification if any
      const initialChecked: Record<string, number> = {};
      const lineItems = (data.order.line_items as any[]) || [];

      if (data.packingVerification?.verified_items?.length) {
        lineItems.forEach((item, idx) => {
          const key = String(item.id || item.variant_id || idx);
          initialChecked[key] = Number(item.quantity || 1);
        });
      }
      setCheckedItems(initialChecked);
      setScanFeedback(`Order ${data.order.shopify_order_name || ""} loaded`);
    } catch (err: any) {
      toast.error(err.message || "Failed to search order");
    } finally {
      setLoading(false);
    }
  };

  const lineItems = (order?.line_items as any[]) || [];
  const totalItemsRequired = lineItems.reduce((acc, item) => acc + (Number(item.quantity) || 1), 0);
  const totalItemsChecked = Object.values(checkedItems).reduce((acc, count) => acc + count, 0);
  const isFullyPacked = totalItemsRequired > 0 && totalItemsChecked >= totalItemsRequired;

  const toggleItemChecked = (itemKey: string, requiredQty: number) => {
    setCheckedItems((prev) => {
      const current = prev[itemKey] || 0;
      const next = current >= requiredQty ? 0 : requiredQty;
      return { ...prev, [itemKey]: next };
    });
  };

  const markAllChecked = () => {
    const updated: Record<string, number> = {};
    lineItems.forEach((item, idx) => {
      const key = String(item.id || item.variant_id || idx);
      updated[key] = Number(item.quantity || 1);
    });
    setCheckedItems(updated);
  };

  const handleSaveVerification = async () => {
    if (!order) return;
    setSaving(true);
    try {
      const verifiedList = lineItems.map((item, idx) => ({
        id: item.id || null,
        title: item.title,
        sku: item.sku || null,
        variant_title: item.variant_title || null,
        quantity: item.quantity || 1,
        verified_quantity: checkedItems[String(item.id || item.variant_id || idx)] || 0,
      }));

      const res = await fetch("/api/orders/pack-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: order.id,
          verified_items: verifiedList,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to record packing");

      toast.success(data.message || "Packing verified successfully!");
      setVerification({
        verified_at: data.verified_at,
        packed_by: data.packed_by,
        verified_items: verifiedList.map((i) => i.title),
      });

      // Update local order internal_status
      setOrder((prev) =>
        prev
          ? {
              ...prev,
              internal_status: prev.internal_status === "pending" ? "preparing" : prev.internal_status,
              shopify_tags: Array.from(new Set([...(prev.shopify_tags || []), "Packing Verified"])),
            }
          : prev
      );
    } catch (err: any) {
      toast.error(err.message || "Error saving packing verification");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800/80 bg-zinc-900/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <ScanBarcode className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
                Scan & Pack Verification
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                  Warehouse
                </span>
              </h2>
              <p className="text-xs text-zinc-400">
                Scan barcode, order #, consignment, or phone to verify items
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-4 sm:p-5 border-b border-zinc-800/60 bg-zinc-900/20">
          <form onSubmit={handleSearch} className="relative">
            <ScanBarcode className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400" />
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Scan barcode or type #2158, consignment ID, phone..."
              className="w-full pl-10 pr-24 py-2.5 bg-zinc-900 border border-zinc-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl text-sm text-zinc-100 placeholder:text-zinc-500 transition-all font-mono"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
              <button
                type="submit"
                disabled={loading || !query.trim()}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium flex items-center gap-1 transition-colors"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                <span>Find</span>
              </button>
            </div>
          </form>
          {scanFeedback && (
            <p className="text-xs text-emerald-400 font-medium mt-2 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" /> {scanFeedback}
            </p>
          )}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {!order ? (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-3 text-zinc-500">
              <div className="w-16 h-16 rounded-2xl bg-zinc-900/80 border border-zinc-800 flex items-center justify-center text-zinc-600">
                <ScanBarcode className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-sm font-medium text-zinc-300">Ready to Scan</h3>
                <p className="text-xs text-zinc-500 max-w-sm mt-1">
                  Point your physical USB or Bluetooth scanner at the order barcode, or enter the order reference above.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Order Overview Header Card */}
              <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-bold text-zinc-100">{order.shopify_order_name}</span>
                    <span
                      className={`text-xs px-2.5 py-0.5 rounded-full font-medium border ${
                        order.internal_status === "dispatched"
                          ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
                          : order.internal_status === "preparing"
                          ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                          : "bg-zinc-800 text-zinc-300 border-zinc-700"
                      }`}
                    >
                      {order.internal_status}
                    </span>
                    {order.financial_status && (
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          order.financial_status === "paid"
                            ? "bg-emerald-500/10 text-emerald-400"
                            : "bg-yellow-500/10 text-yellow-400"
                        }`}
                      >
                        {order.financial_status}
                      </span>
                    )}
                  </div>
                  <div className="text-sm font-bold text-zinc-100">
                    COD: ৳{order.financial_status === "paid" ? 0 : order.cod_amount || order.total_price || 0}
                  </div>
                </div>

                {/* Customer Details Strip */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-zinc-400 pt-2 border-t border-zinc-800/50">
                  <div className="flex items-center gap-1.5 truncate">
                    <User className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                    <span className="text-zinc-200 font-medium truncate">{order.customer_name || "Guest"}</span>
                  </div>
                  <div className="flex items-center gap-1.5 truncate">
                    <Phone className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                    <span className="text-zinc-200 font-medium">{order.customer_phone || "No phone"}</span>
                  </div>
                  <div className="flex items-center gap-1.5 truncate">
                    <MapPin className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                    <span className="truncate">
                      {(order.shipping_address as any)?.city || (order.shipping_address as any)?.address1 || "No address"}
                    </span>
                  </div>
                </div>

                {/* Pathao Consignment If Dispatched */}
                {order.pathao_consignment_id && (
                  <div className="bg-indigo-950/30 border border-indigo-500/20 rounded-lg p-2.5 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <Truck className="w-4 h-4 text-indigo-400" />
                      <span className="text-zinc-300">
                        Consignment:{" "}
                        <strong className="text-indigo-300 font-mono">{order.pathao_consignment_id}</strong>
                      </span>
                    </div>
                    {order.pathao_tracking_url && (
                      <a
                        href={order.pathao_tracking_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-indigo-400 hover:text-indigo-300 underline font-medium"
                      >
                        Track Parcel
                      </a>
                    )}
                  </div>
                )}

                {/* Packing Verification Status */}
                {verification ? (
                  <div className="bg-emerald-950/30 border border-emerald-500/20 rounded-lg p-2.5 flex items-center justify-between text-xs text-emerald-400">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>
                        Verified packed by <strong>{verification.packed_by}</strong>
                      </span>
                    </div>
                    <span className="text-emerald-500/80 font-mono text-[11px]">
                      {new Date(verification.verified_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                ) : (
                  <div className="bg-amber-950/20 border border-amber-500/20 rounded-lg p-2.5 flex items-center gap-1.5 text-xs text-amber-300">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Packing pending verification for this order. Check off all line items below.</span>
                  </div>
                )}
              </div>

              {/* Line Items Checklist */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5 text-indigo-400" />
                    Line Items ({totalItemsChecked} / {totalItemsRequired} Verified)
                  </h4>
                  <button
                    type="button"
                    onClick={markAllChecked}
                    className="text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
                  >
                    Check All Items
                  </button>
                </div>

                <div className="space-y-2">
                  {lineItems.map((item, idx) => {
                    const key = String(item.id || item.variant_id || idx);
                    const qty = Number(item.quantity || 1);
                    const isChecked = (checkedItems[key] || 0) >= qty;

                    return (
                      <div
                        key={key}
                        onClick={() => toggleItemChecked(key, qty)}
                        className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                          isChecked
                            ? "bg-emerald-950/20 border-emerald-500/30 text-zinc-100"
                            : "bg-zinc-900/40 border-zinc-800 hover:border-zinc-700 text-zinc-300"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <button
                            type="button"
                            className="shrink-0 text-zinc-400"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleItemChecked(key, qty);
                            }}
                          >
                            {isChecked ? (
                              <CheckCircle2 className="w-5 h-5 text-emerald-400 fill-emerald-500/20" />
                            ) : (
                              <Circle className="w-5 h-5 text-zinc-600 hover:text-zinc-400" />
                            )}
                          </button>
                          <div className="min-w-0">
                            <p className={`text-sm font-medium truncate ${isChecked ? "text-emerald-200" : "text-zinc-100"}`}>
                              {item.title}
                            </p>
                            <div className="flex items-center gap-2 text-xs text-zinc-400 mt-0.5">
                              {item.variant_title && (
                                <span className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-300 font-mono text-[11px]">
                                  {item.variant_title}
                                </span>
                              )}
                              {item.sku && (
                                <span className="font-mono text-zinc-500 text-[11px]">SKU: {item.sku}</span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="text-right shrink-0 pl-3">
                          <div className="text-sm font-bold text-zinc-200">Qty: {qty}</div>
                          <div className="text-[11px] text-zinc-500">৳{item.price || 0}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {order && (
          <div className="p-4 sm:p-5 border-t border-zinc-800/80 bg-zinc-900/50 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-zinc-400">
              {isFullyPacked ? (
                <span className="text-emerald-400 font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" /> Ready for sealing & dispatch
                </span>
              ) : (
                <span>Verify all items to mark packing complete</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="px-3 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/60 rounded-xl text-xs font-medium text-zinc-300 flex items-center gap-1.5 transition-colors"
              >
                <Printer className="w-3.5 h-3.5 text-zinc-400" />
                <span className="hidden sm:inline">Print Slip</span>
              </button>

              <button
                type="button"
                onClick={handleSaveVerification}
                disabled={saving || !isFullyPacked}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-lg shadow-emerald-900/30"
              >
                {saving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                )}
                <span>Verify Packed</span>
              </button>

              {!order.pathao_consignment_id && onOpenDispatch && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenDispatch(order);
                  }}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-lg shadow-indigo-900/30"
                >
                  <Truck className="w-3.5 h-3.5" />
                  <span>Dispatch Now</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
