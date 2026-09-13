"use client";

import { useState } from "react";
import { CheckCircle2, X, PackageCheck, AlertCircle, Minus, Plus } from "lucide-react";
import { toast } from "sonner";

const RETURN_REASONS = [
  "Customer Kept Partial Items",
  "Customer Refused Part of Order",
  "Damaged in Transit",
  "Wrong Item Sent",
  "Customer Changed Mind",
  "Other",
];

interface DeliverModalProps {
  orders: any[];
  onClose: () => void;
  onSuccess: () => void;
}

export function DeliverModal({ orders, onClose, onSuccess }: DeliverModalProps) {
  const [deliveryType, setDeliveryType] = useState<"full" | "partial">("full");
  const [notes, setNotes] = useState("");
  const [returnReason, setReturnReason] = useState(RETURN_REASONS[0]);
  const [customReturnValue, setCustomReturnValue] = useState("");
  const [returnedQuantities, setReturnedQuantities] = useState<Record<string, number>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isBulk = orders.length > 1;
  const singleOrder = orders[0];
  const lineItems: any[] = singleOrder?.line_items || [];

  const handleQuantityChange = (key: string, delta: number, max: number) => {
    setReturnedQuantities(prev => {
      const current = prev[key] || 0;
      const next = Math.max(0, Math.min(max, current + delta));
      return { ...prev, [key]: next };
    });
  };

  // Calculate total returned value
  const calculatedReturnedValue = lineItems.length > 0
    ? lineItems.reduce((sum, item, idx) => {
        const key = String(item.id || item.variant_id || idx);
        const qty = returnedQuantities[key] || 0;
        return sum + (Number(item.price || 0) * qty);
      }, 0)
    : Number(customReturnValue) || 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const payload: any = {
        orderIds: orders.map(o => o.id),
        delivery_type: deliveryType,
        notes: notes || null,
      };

      if (deliveryType === "partial") {
        if (lineItems.length > 0) {
          const itemsList = lineItems
            .map((item, idx) => {
              const key = String(item.id || item.variant_id || idx);
              const qty = returnedQuantities[key] || 0;
              return {
                id: key,
                name: item.name || item.title || "Item",
                variant_title: item.variant_title || null,
                price: Number(item.price || 0),
                quantity: qty,
              };
            })
            .filter(i => i.quantity > 0);

          if (itemsList.length === 0 && (!customReturnValue || Number(customReturnValue) <= 0)) {
            toast.error("Please specify at least one returned item or a return value for partial delivery");
            setIsSubmitting(false);
            return;
          }

          payload.returned_items = itemsList;
          payload.returned_items_value = calculatedReturnedValue;
        } else {
          const val = Number(customReturnValue);
          if (isNaN(val) || val <= 0) {
            toast.error("Please enter a valid returned item value");
            setIsSubmitting(false);
            return;
          }
          payload.returned_items_value = val;
        }

        payload.return_reason = returnReason;
      }

      const res = await fetch("/api/deliveries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to process delivery");
      }

      if (data.processed > 0) {
        if (deliveryType === "partial") {
          toast.success(`Order marked as Partial Delivery with Shopify auto-sync!`);
        } else {
          toast.success(`${data.processed} order(s) marked as delivered`);
        }
      }
      if (data.failed > 0) {
        toast.warning(`${data.failed} order(s) could not be delivered`, {
          description: data.errors?.[0]?.error || "Some orders failed to update",
        });
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-zinc-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 text-emerald-400">
            {deliveryType === "partial" ? <PackageCheck size={20} className="text-teal-400" /> : <CheckCircle2 size={20} />}
            <h3 className="font-semibold text-zinc-100">
              {isBulk
                ? `Deliver ${orders.length} Orders`
                : deliveryType === "partial"
                ? `Partial Delivery - ${singleOrder?.shopify_order_name}`
                : "Mark Order as Delivered"}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 transition-colors p-1 rounded-lg hover:bg-zinc-800"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Mode Switcher for Single Orders */}
          {!isBulk && (
            <div className="grid grid-cols-2 p-1 bg-zinc-950 border border-zinc-800 rounded-xl gap-1">
              <button
                type="button"
                onClick={() => setDeliveryType("full")}
                className={`py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                  deliveryType === "full"
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <CheckCircle2 size={14} /> Full Delivery
              </button>
              <button
                type="button"
                onClick={() => setDeliveryType("partial")}
                className={`py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                  deliveryType === "partial"
                    ? "bg-teal-500/20 text-teal-300 border border-teal-500/30"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <PackageCheck size={14} /> Partial Delivery
              </button>
            </div>
          )}

          {/* Banner Info */}
          {deliveryType === "full" ? (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-xs text-emerald-300">
              {isBulk ? (
                <span>Marking <strong>{orders.length}</strong> orders as fully delivered. Updates ERP status and syncs delivery with Shopify.</span>
              ) : (
                <span>Marking order <strong>{singleOrder?.shopify_order_name}</strong> as fully delivered. Updates ERP status and syncs delivery with Shopify.</span>
              )}
            </div>
          ) : (
            <div className="bg-teal-500/10 border border-teal-500/20 rounded-xl p-3 text-xs text-teal-300">
              <span>Customer accepted partial items. Returned items will be added to the returns pipeline, and the order will be tagged with <strong>Partial Delivery</strong> on Shopify automatically.</span>
            </div>
          )}

          {/* Partial Delivery Specific UI */}
          {deliveryType === "partial" && !isBulk && (
            <div className="space-y-3 pt-1">
              <div className="space-y-2">
                <label className="block text-xs font-medium text-zinc-300">
                  Select Items Returned / Rejected by Customer:
                </label>

                {lineItems.length > 0 ? (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {lineItems.map((item, idx) => {
                      const key = String(item.id || item.variant_id || idx);
                      const maxQty = item.quantity || 1;
                      const returnedQty = returnedQuantities[key] || 0;

                      return (
                        <div
                          key={key}
                          className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-950/60 border border-zinc-800 text-xs"
                        >
                          <div className="flex-1 min-w-0 pr-3">
                            <p className="font-medium text-zinc-200 truncate">{item.title || item.name}</p>
                            {item.variant_title && (
                              <p className="text-[11px] text-zinc-500 truncate">{item.variant_title}</p>
                            )}
                            <p className="text-[11px] text-teal-400 mt-0.5">৳{Number(item.price || 0).toLocaleString()} each</p>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[11px] text-zinc-500 mr-1">Return:</span>
                            <button
                              type="button"
                              onClick={() => handleQuantityChange(key, -1, maxQty)}
                              disabled={returnedQty <= 0}
                              className="w-6 h-6 rounded-md bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 text-zinc-200 flex items-center justify-center transition-colors"
                            >
                              <Minus size={12} />
                            </button>
                            <span className="w-5 text-center font-bold text-zinc-100">{returnedQty}</span>
                            <button
                              type="button"
                              onClick={() => handleQuantityChange(key, 1, maxQty)}
                              disabled={returnedQty >= maxQty}
                              className="w-6 h-6 rounded-md bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 text-zinc-200 flex items-center justify-center transition-colors"
                            >
                              <Plus size={12} />
                            </button>
                            <span className="text-[10px] text-zinc-600 ml-0.5">/ {maxQty}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">Returned Items Value (৳)</label>
                    <input
                      type="number"
                      value={customReturnValue}
                      onChange={(e) => setCustomReturnValue(e.target.value)}
                      placeholder="e.g. 1200"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-zinc-100 text-sm focus:outline-none focus:border-teal-500"
                    />
                  </div>
                )}

                {calculatedReturnedValue > 0 && (
                  <div className="flex justify-between items-center bg-teal-500/10 border border-teal-500/20 px-3 py-2 rounded-xl text-xs">
                    <span className="text-teal-300 font-medium">Returned Value Deduction:</span>
                    <span className="text-teal-200 font-bold">৳{calculatedReturnedValue.toLocaleString()}</span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Return Reason</label>
                <select
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100 text-xs focus:outline-none focus:border-teal-500"
                >
                  {RETURN_REASONS.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Notes (Optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Any additional notes about this delivery..."
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-zinc-100 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all placeholder:text-zinc-600 resize-none"
            />
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className={`w-full py-2.5 rounded-xl text-white font-semibold flex items-center justify-center gap-2 transition-all shrink-0 ${
              deliveryType === "partial"
                ? "bg-teal-600 hover:bg-teal-500 shadow-lg shadow-teal-500/20"
                : "bg-emerald-500 hover:bg-emerald-600 shadow-lg shadow-emerald-500/20"
            } ${isSubmitting ? "opacity-70 cursor-not-allowed" : ""}`}
          >
            {isSubmitting ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : deliveryType === "partial" ? (
              <>
                <PackageCheck size={18} />
                Confirm Partial Delivery
              </>
            ) : (
              <>
                <CheckCircle2 size={18} />
                {`Confirm Full Delivery${isBulk ? ` (${orders.length})` : ""}`}
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
