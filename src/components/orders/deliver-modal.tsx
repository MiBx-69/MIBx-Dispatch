"use client";

import { useState, useEffect } from "react";
import { CheckCircle2, X } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

const RETURN_REASONS = [
  "Customer Refused",
  "Wrong Address",
  "Customer Unreachable",
  "Damaged in Transit",
  "Wrong Item Sent",
  "Customer Changed Mind",
  "Address Not Found",
  "Payment Issue",
  "Other",
];

interface DeliverModalProps {
  orders: any[];
  onClose: () => void;
  onSuccess: () => void;
}

export function DeliverModal({ orders, onClose, onSuccess }: DeliverModalProps) {
  const [deliveryType, setDeliveryType] = useState<"full" | "partial">("full");
  const [reason, setReason] = useState(RETURN_REASONS[0]);
  const [deliveryFee, setDeliveryFee] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [returnedItems, setReturnedItems] = useState<Record<string, number>>({});
  const [isPaidReturn, setIsPaidReturn] = useState(false);
  const [settings, setSettings] = useState<any>(null);

  const isBulk = orders.length > 1;

  useEffect(() => {
    async function fetchSettings() {
      const supabase = createClient();
      const { data } = await supabase.from("app_settings").select("delivery_charge_inside_dhaka, delivery_charge_outside_dhaka").single();
      if (data) {
        setSettings(data);
        
        // Auto-populate initial fee if not paid return
        const isDhaka = orders[0]?.recipient_city === 1 || orders[0]?.shipping_address?.city?.toLowerCase().includes("dhaka");
        const defaultFee = isDhaka 
          ? (data.delivery_charge_inside_dhaka || 60) 
          : (data.delivery_charge_outside_dhaka || 120);
        setDeliveryFee(String(defaultFee));
      }
    }
    fetchSettings();
  }, [orders]);

  useEffect(() => {
    if (isPaidReturn) {
      setDeliveryFee("0");
    } else if (settings) {
      const isDhaka = orders[0]?.recipient_city === 1 || orders[0]?.shipping_address?.city?.toLowerCase().includes("dhaka");
      const defaultFee = isDhaka 
        ? (settings.delivery_charge_inside_dhaka || 60) 
        : (settings.delivery_charge_outside_dhaka || 120);
      setDeliveryFee(String(defaultFee));
    }
  }, [isPaidReturn, settings, orders]);

  // Handle item quantity change
  const handleItemQuantityChange = (itemId: string, qty: number) => {
    setReturnedItems(prev => ({ ...prev, [itemId]: qty }));
  };

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
        payload.return_reason = reason;
        payload.is_paid_return = isPaidReturn;
        payload.return_delivery_fee = deliveryFee ? Number(deliveryFee) : 0;
        
        // Format returned items
        const itemsList = Object.entries(returnedItems)
          .filter(([_, qty]) => qty > 0)
          .map(([key, quantity]) => {
            const item = orders[0]?.line_items?.find((i: any, idx: number) => 
              String(i.id) === key || String(i.variant_id) === key || String(idx) === key
            );
            return {
              id: key,
              name: item?.name || item?.title || "Unknown Item",
              variant_title: item?.variant_title || null,
              price: Number(item?.price) || 0,
              quantity
            };
          });
          
        if (itemsList.length === 0) {
          toast.error("Please select at least one item to return for a partial delivery.");
          setIsSubmitting(false);
          return;
        }
        payload.returned_items = itemsList;
        payload.returned_items_value = itemsList.reduce((sum, item) => sum + (item.price * item.quantity), 0);
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
        toast.success(`${data.processed} order(s) marked as delivered`);
      }
      if (data.failed > 0) {
        toast.warning(`${data.failed} order(s) could not be delivered`, {
          description: data.errors.map((e: any) => e.error).join(", "),
        });
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800 shrink-0">
          <h3 className="font-bold text-lg text-white flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            Mark as Delivered
          </h3>
          <button type="button" onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto">
          <div className="px-5 pt-4">
            <p className="text-xs text-zinc-500 mb-2">
              {isBulk ? `${orders.length} Orders:` : "Order:"}
            </p>
            <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
              {orders.map((o, i) => (
                <span key={i} className="text-xs bg-zinc-800 text-zinc-300 px-2 py-1 rounded-lg font-mono">
                  {o.shopify_order_name || o.id}
                </span>
              ))}
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            {/* Delivery Type */}
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Delivery Type</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDeliveryType("full")}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all border ${
                    deliveryType === "full"
                      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                      : "bg-zinc-950 text-zinc-400 border-zinc-800 hover:border-zinc-700"
                  }`}
                >
                  Full Delivery
                </button>
                <button
                  type="button"
                  onClick={() => setDeliveryType("partial")}
                  disabled={isBulk}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all border ${
                    deliveryType === "partial"
                      ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                      : isBulk 
                        ? "bg-zinc-900 text-zinc-600 border-zinc-800 cursor-not-allowed"
                        : "bg-zinc-950 text-zinc-400 border-zinc-800 hover:border-zinc-700"
                  }`}
                  title={isBulk ? "Partial delivery not available for bulk selections" : ""}
                >
                  Partial Delivery
                </button>
              </div>
            </div>

            {deliveryType === "partial" && (
              <>
                {/* Return Reason for Partial Delivery */}
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">Rejection Reason *</label>
                  <select
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-zinc-100 text-sm focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all"
                  >
                    {RETURN_REASONS.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>

                {/* Line Items for Partial Return */}
                {!isBulk && orders[0]?.line_items && (
                  <div className="bg-zinc-950 border border-amber-500/20 rounded-xl p-4 space-y-3">
                    <p className="text-xs font-medium text-amber-400/80 mb-2">Select quantities being REJECTED (returned):</p>
                    {(orders[0].line_items as any[]).map((item: any, idx: number) => {
                      const itemId = String(item.id || item.variant_id || idx);
                      const maxQty = Number(item.quantity) || 1;
                      const currentQty = returnedItems[itemId] || 0;
                      
                      return (
                        <div key={itemId} className="flex items-center justify-between gap-3 text-sm">
                          <div className="flex-1 min-w-0 pr-4">
                            <p className="text-zinc-200">{item.name || item.title}</p>
                            {item.variant_title && item.variant_title !== "Default Title" && (
                              <p className="text-xs text-zinc-400 mt-0.5">{item.variant_title}</p>
                            )}
                            <p className="text-xs text-zinc-500 mt-0.5">Ordered: {maxQty}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button 
                              type="button"
                              onClick={() => handleItemQuantityChange(itemId, Math.max(0, currentQty - 1))}
                              className="w-7 h-7 rounded-lg bg-zinc-800 text-zinc-300 flex items-center justify-center hover:bg-zinc-700 disabled:opacity-50"
                              disabled={currentQty <= 0}
                            >-</button>
                            <span className="w-6 text-center text-zinc-200 font-medium">{currentQty}</span>
                            <button 
                              type="button"
                              onClick={() => handleItemQuantityChange(itemId, Math.min(maxQty, currentQty + 1))}
                              className="w-7 h-7 rounded-lg bg-zinc-800 text-zinc-300 flex items-center justify-center hover:bg-zinc-700 disabled:opacity-50"
                              disabled={currentQty >= maxQty}
                            >+</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Return Type Details */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1.5">Paid Return (No Loss)</label>
                    <label className="relative inline-flex items-center cursor-pointer mt-1">
                      <input 
                        type="checkbox" 
                        checked={isPaidReturn}
                        onChange={(e) => setIsPaidReturn(e.target.checked)}
                        className="sr-only peer" 
                      />
                      <div className="w-9 h-5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
                    </label>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1.5">Return Delivery Fee (BDT)</label>
                    <input
                      type="number"
                      value={deliveryFee}
                      onChange={(e) => setDeliveryFee(e.target.value)}
                      disabled={isPaidReturn}
                      min="0"
                      step="any"
                      placeholder="e.g. 60"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-zinc-100 text-sm focus:outline-none focus:border-amber-500 disabled:opacity-50 transition-all placeholder:text-zinc-600"
                    />
                  </div>
                </div>
              </>
            )}

            {/* Notes */}
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Notes (Optional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Any additional notes about the delivery..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-zinc-100 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all placeholder:text-zinc-600 resize-none"
              />
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting}
              className={`w-full py-2.5 rounded-xl text-white font-semibold flex items-center justify-center gap-2 transition-all
                bg-emerald-500 hover:bg-emerald-600 ${isSubmitting ? "opacity-70 cursor-not-allowed" : ""}`}
            >
              {isSubmitting ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <CheckCircle2 size={18} />
                  {deliveryType === "partial" ? "Submit Partial Delivery" : `Confirm Delivery${isBulk ? ` (${orders.length})` : ""}`}
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
