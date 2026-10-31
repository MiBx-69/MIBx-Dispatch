"use client";

import { useState, useEffect, useMemo } from "react";
import {
  RotateCcw,
  X,
  CheckCircle2,
  AlertTriangle,
  Package,
  ArrowLeft,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  calculateOrderReturnPreview,
  type ReturnLineItemSelection,
} from "@/lib/return-calculator";

export const STANDARD_RETURN_REASONS = [
  "Customer refused",
  "Size issue",
  "Product quality issue",
  "Wrong product",
  "Delayed delivery",
  "Customer unavailable",
  "Duplicate order",
  "Damaged in transit",
  "Wrong address",
  "Other",
];

interface ReturnModalProps {
  orders: any[];
  initialMode?: "partial" | "full";
  onClose: () => void;
  onSuccess: () => void;
}

export function ReturnModal({
  orders,
  initialMode,
  onClose,
  onSuccess,
}: ReturnModalProps) {
  const isBulk = orders.length > 1;
  const singleOrder = !isBulk ? orders[0] : null;

  const [reason, setReason] = useState(STANDARD_RETURN_REASONS[0]);
  const [returnType, setReturnType] = useState<"full" | "partial">(
    isBulk ? "full" : initialMode || "partial"
  );
  const [refundShipping, setRefundShipping] = useState(false);
  const [deliveryFee, setDeliveryFee] = useState("0");
  const [isPaidReturn, setIsPaidReturn] = useState(false);
  const [notes, setNotes] = useState("");
  const [syncToShopify, setSyncToShopify] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [existingReturns, setExistingReturns] = useState<any[]>([]);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [returnedItems, setReturnedItems] = useState<Record<string, number>>({});
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [settings, setSettings] = useState<any>(null);

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data } = await supabase
        .from("app_settings")
        .select("delivery_charge_inside_dhaka, delivery_charge_outside_dhaka")
        .single();
      if (data) {
        setSettings(data);
        const isDhaka =
          orders[0]?.recipient_city === 1 ||
          orders[0]?.shipping_address?.city?.toLowerCase().includes("dhaka");
        const defaultFee = isDhaka
          ? data.delivery_charge_inside_dhaka || 60
          : data.delivery_charge_outside_dhaka || 120;
        setDeliveryFee(String(defaultFee));
      }
    }
    init();
  }, [orders]);

  // Fetch existing returns for single order so already-returned quantities are known
  useEffect(() => {
    if (!singleOrder?.id) return;
    let active = true;
    async function loadOrderReturnHistory() {
      setLoadingExisting(true);
      try {
        const res = await fetch(`/api/returns?orderId=${singleOrder.id}`);
        if (res.ok) {
          const data = await res.json();
          if (active && Array.isArray(data.returns)) {
            setExistingReturns(data.returns);
          }
        }
      } catch {
        // Ignore preview fetch error
      } finally {
        if (active) setLoadingExisting(false);
      }
    }
    loadOrderReturnHistory();
    return () => {
      active = false;
    };
  }, [singleOrder?.id]);

  useEffect(() => {
    if (isPaidReturn) {
      setDeliveryFee("0");
    } else if (settings) {
      const isDhaka =
        orders[0]?.recipient_city === 1 ||
        orders[0]?.shipping_address?.city?.toLowerCase().includes("dhaka");
      const defaultFee = isDhaka
        ? settings.delivery_charge_inside_dhaka || 60
        : settings.delivery_charge_outside_dhaka || 120;
      setDeliveryFee(String(defaultFee));
    }
  }, [isPaidReturn, settings, orders]);

  // Live return calculation preview for single order
  const livePreview = useMemo(() => {
    if (!singleOrder) return null;
    const selections: ReturnLineItemSelection[] = Object.entries(returnedItems)
      .filter(([, q]) => q > 0)
      .map(([key, quantity]) => ({ key, quantity }));

    return calculateOrderReturnPreview({
      order: singleOrder,
      existingReturns,
      mode: returnType,
      selections,
      refundShipping,
    });
  }, [singleOrder, existingReturns, returnType, returnedItems, refundShipping]);

  const handleItemQuantityChange = (itemKey: string, qty: number) => {
    setReturnedItems((prev) => ({ ...prev, [itemKey]: qty }));
    setShowConfirmation(false);
  };

  const handleProceedToConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isBulk && livePreview && !livePreview.valid) {
      toast.error(livePreview.error || "Please select valid product quantities to return.");
      return;
    }
    setShowConfirmation(true);
  };

  const handleFinalSubmit = async () => {
    setIsSubmitting(true);
    try {
      const selections: ReturnLineItemSelection[] = Object.entries(returnedItems)
        .filter(([, q]) => q > 0)
        .map(([key, quantity]) => ({ key, quantity }));

      const payload: any = {
        orderIds: orders.map((o) => o.id),
        return_reason: reason,
        return_type: returnType,
        is_paid_return: isPaidReturn,
        return_delivery_fee: deliveryFee ? Number(deliveryFee) : 0,
        refund_shipping: refundShipping,
        sync_to_shopify: syncToShopify,
        notes: notes || null,
        selections: returnType === "partial" ? selections : undefined,
      };

      const res = await fetch("/api/returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to process return");
      }

      if (data.processed > 0) {
        const firstResult = data.results?.[0];
        if (firstResult?.shopifySynced === false) {
          toast.warning(
            `Return saved in MiBx Dispatch, but Shopify sync failed: ${
              firstResult.shopifyError || "You can retry sync from the Returns page."
            }`
          );
        } else {
          toast.success(
            `${
              firstResult?.returnType === "partial" ? "Partial Return" : "Full Return"
            } processed & synchronized with Shopify!`
          );
        }
      }
      if (data.failed > 0) {
        toast.error(`${data.failed} order(s) could not be returned`, {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center border ${
                returnType === "partial"
                  ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                  : "bg-rose-500/10 border-rose-500/30 text-rose-400"
              }`}
            >
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">
                {showConfirmation
                  ? `Confirm ${
                      livePreview?.returnType === "full" ? "Full Return" : "Partial Return"
                    }`
                  : `Process ${returnType === "partial" ? "Partial Return" : "Full Return"}`}
              </h3>
              <p className="text-xs text-zinc-400">
                Synchronized directly with Shopify Order, Return & Refund records
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 transition-colors p-1"
          >
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-5">
          {/* Selected Order Banner */}
          <div className="bg-zinc-950/90 border border-zinc-800/80 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-[11px] uppercase tracking-wider text-zinc-500 font-semibold">
                {isBulk ? `${orders.length} Selected Orders` : "Shopify Order"}
              </span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {orders.map((o, i) => (
                  <span
                    key={i}
                    className="text-xs bg-zinc-900 border border-zinc-800 text-zinc-200 px-2.5 py-1 rounded-lg font-mono font-semibold"
                  >
                    {o.shopify_order_name || o.id} — ৳
                    {Number(o.original_total_price ?? o.total_price ?? 0).toLocaleString()}
                  </span>
                ))}
              </div>
            </div>
            {singleOrder && (
              <div className="text-right">
                <span className="text-[11px] text-zinc-500 block">Customer</span>
                <span className="text-xs font-medium text-zinc-200">
                  {singleOrder.customer_name || "Guest"} (
                  {singleOrder.customer_phone || "No Phone"})
                </span>
              </div>
            )}
          </div>

          {!showConfirmation ? (
            <form onSubmit={handleProceedToConfirm} className="space-y-4">
              {/* Return Type Selector */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                  1. Select Return Type
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    disabled={isBulk}
                    onClick={() => {
                      setReturnType("partial");
                      setShowConfirmation(false);
                    }}
                    className={`p-3 rounded-xl text-left transition-all border ${
                      returnType === "partial"
                        ? "bg-amber-500/15 text-amber-300 border-amber-500/40 ring-1 ring-amber-500/30"
                        : isBulk
                          ? "bg-zinc-900/50 text-zinc-600 border-zinc-800 cursor-not-allowed"
                          : "bg-zinc-950 text-zinc-400 border-zinc-800 hover:border-zinc-700"
                    }`}
                  >
                    <div className="font-bold text-sm text-white flex items-center justify-between">
                      <span>Partial Return</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300">
                        Some Items
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-400 mt-1">
                      Customer returns selected products/quantities and keeps the rest.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setReturnType("full");
                      setShowConfirmation(false);
                    }}
                    className={`p-3 rounded-xl text-left transition-all border ${
                      returnType === "full"
                        ? "bg-rose-500/15 text-rose-300 border-rose-500/40 ring-1 ring-rose-500/30"
                        : "bg-zinc-950 text-zinc-400 border-zinc-800 hover:border-zinc-700"
                    }`}
                  >
                    <div className="font-bold text-sm text-white flex items-center justify-between">
                      <span>Full Return</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300">
                        Entire Order
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-400 mt-1">
                      Customer returns all remaining unreturned products in the order.
                    </p>
                  </button>
                </div>
              </div>

              {/* Product & Quantity Selection (for single order) */}
              {!isBulk && livePreview && (
                <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
                      <Package className="w-3.5 h-3.5 text-indigo-400" />
                      {returnType === "partial"
                        ? "2. Select Products & Quantities to Return"
                        : "2. Products Included in Full Return"}
                    </span>
                    {loadingExisting && (
                      <span className="text-[11px] text-zinc-500 flex items-center gap-1">
                        <RefreshCw className="w-3 h-3 animate-spin" /> Checking history...
                      </span>
                    )}
                  </div>

                  {livePreview.previouslyReturnedQuantity > 0 && (
                    <div className="text-xs bg-amber-500/10 border border-amber-500/20 text-amber-300 px-3 py-2 rounded-lg">
                      Note: {livePreview.previouslyReturnedQuantity} unit(s) (৳
                      {livePreview.previouslyRefundedAmount.toLocaleString()}) were already
                      returned previously. Only unreturned quantities can be selected.
                    </div>
                  )}

                  <div className="divide-y divide-zinc-800/70">
                    {livePreview.normalizedLineItems.map((li) => {
                      const maxQty = li.unreturnedQuantity;
                      const currentQty =
                        returnType === "full"
                          ? maxQty
                          : Math.min(maxQty, returnedItems[li.key] || 0);

                      return (
                        <div
                          key={li.key}
                          className="py-2.5 first:pt-1 last:pb-1 flex items-center justify-between gap-3"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-zinc-100 truncate">
                              {li.title}
                              {li.variantTitle ? ` (${li.variantTitle})` : ""}
                            </p>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400 mt-0.5">
                              {li.sku && <span className="font-mono">SKU: {li.sku}</span>}
                              <span>
                                Unit: ৳{li.effectiveUnitPrice.toLocaleString()}
                                {li.discountPerUnit > 0 && (
                                  <span className="text-emerald-400 ml-1">
                                    (-৳{li.discountPerUnit.toFixed(0)} disc)
                                  </span>
                                )}
                              </span>
                              <span>Ordered: {li.originalQuantity}</span>
                              {li.alreadyReturnedQuantity > 0 && (
                                <span className="text-amber-400">
                                  Already Returned: {li.alreadyReturnedQuantity}
                                </span>
                              )}
                              <span className="text-zinc-300 font-medium">
                                Eligible: {maxQty}
                              </span>
                            </div>
                          </div>

                          {returnType === "partial" ? (
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() =>
                                  handleItemQuantityChange(
                                    li.key,
                                    Math.max(0, currentQty - 1)
                                  )
                                }
                                disabled={currentQty <= 0}
                                className="w-8 h-8 rounded-lg bg-zinc-800 text-zinc-200 flex items-center justify-center hover:bg-zinc-700 disabled:opacity-40 font-bold"
                              >
                                -
                              </button>
                              <span className="w-8 text-center text-sm font-bold text-white">
                                {currentQty}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  handleItemQuantityChange(
                                    li.key,
                                    Math.min(maxQty, currentQty + 1)
                                  )
                                }
                                disabled={currentQty >= maxQty}
                                className="w-8 h-8 rounded-lg bg-zinc-800 text-zinc-200 flex items-center justify-center hover:bg-zinc-700 disabled:opacity-40 font-bold"
                              >
                                +
                              </button>
                            </div>
                          ) : (
                            <div className="text-right shrink-0">
                              <span className="text-xs px-2.5 py-1 rounded-lg bg-rose-500/15 text-rose-300 font-semibold">
                                Returning {maxQty} / {li.originalQuantity}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Live Automatic Calculation Summary */}
                  <div className="pt-3 border-t border-zinc-800 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="bg-zinc-900/90 border border-zinc-800/80 rounded-lg p-2.5">
                      <span className="text-[10px] uppercase text-zinc-500 block">
                        Original Order
                      </span>
                      <span className="text-sm font-bold text-zinc-200">
                        ৳{livePreview.originalOrderAmount.toLocaleString()}
                      </span>
                    </div>
                    <div className="bg-zinc-900/90 border border-zinc-800/80 rounded-lg p-2.5">
                      <span className="text-[10px] uppercase text-zinc-500 block">
                        Returning Now
                      </span>
                      <span className="text-sm font-bold text-amber-400">
                        {livePreview.returnedQuantityNow} pcs (৳
                        {livePreview.returnedSubtotal.toLocaleString()})
                      </span>
                    </div>
                    <div className="bg-zinc-900/90 border border-zinc-800/80 rounded-lg p-2.5">
                      <span className="text-[10px] uppercase text-zinc-500 block">
                        Shopify Refund
                      </span>
                      <span className="text-sm font-bold text-rose-400">
                        ৳{livePreview.calculatedRefundAmount.toLocaleString()}
                      </span>
                    </div>
                    <div className="bg-zinc-900/90 border border-zinc-800/80 rounded-lg p-2.5">
                      <span className="text-[10px] uppercase text-zinc-500 block">
                        Remaining Kept
                      </span>
                      <span className="text-sm font-bold text-emerald-400">
                        {livePreview.remainingQuantityAfter} pcs (৳
                        {livePreview.updatedOrderFinancialAmount.toLocaleString()})
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Return Reason & Options */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                    Return Reason *
                  </label>
                  <select
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-zinc-100 text-sm focus:outline-none focus:border-rose-500"
                  >
                    {STANDARD_RETURN_REASONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                    Notes (Optional)
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Optional note synced to Shopify..."
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-zinc-100 text-sm focus:outline-none focus:border-rose-500 placeholder:text-zinc-600"
                  />
                </div>
              </div>

              {/* Shipping Refund & Shopify Sync Toggles */}
              <div className="flex flex-wrap items-center justify-between gap-4 bg-zinc-950 border border-zinc-800/80 rounded-xl p-3.5">
                {!isBulk && Number(singleOrder?.shipping_charge || 0) > 0 && (
                  <label className="inline-flex items-center gap-2.5 cursor-pointer text-xs text-zinc-300">
                    <input
                      type="checkbox"
                      checked={refundShipping}
                      onChange={(e) => setRefundShipping(e.target.checked)}
                      className="rounded border-zinc-700 bg-zinc-900 text-rose-500 focus:ring-rose-500"
                    />
                    <span>
                      Include Shipping Charge Refund (৳
                      {Number(singleOrder.shipping_charge).toLocaleString()})
                    </span>
                  </label>
                )}

                <label className="inline-flex items-center gap-2.5 cursor-pointer text-xs text-zinc-200 font-medium">
                  <input
                    type="checkbox"
                    checked={syncToShopify}
                    onChange={(e) => setSyncToShopify(e.target.checked)}
                    className="rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500"
                  />
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    Synchronize Return & Refund with Shopify
                  </span>
                </label>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl border border-zinc-800 text-zinc-400 hover:text-zinc-200 text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!isBulk && livePreview ? !livePreview.valid : false}
                  className="px-5 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold flex items-center gap-2 transition-all"
                >
                  <RotateCcw className="w-4 h-4" />
                  Review & Confirm Return
                </button>
              </div>
            </form>
          ) : (
            /* Final Confirmation View */
            <div className="space-y-4">
              <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                  <div>
                    <span className="text-xs text-zinc-400 block">
                      Final Return Classification
                    </span>
                    <span
                      className={`inline-flex items-center gap-1.5 mt-1 px-3 py-1 rounded-full text-xs font-bold ${
                        livePreview?.orderOverallReturnStatus === "full" || isBulk
                          ? "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                          : "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                      }`}
                    >
                      {livePreview?.orderOverallReturnStatus === "full" || isBulk
                        ? "FULL RETURN"
                        : "PARTIAL RETURN"}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-zinc-400 block">Reason</span>
                    <span className="text-sm font-semibold text-zinc-200">
                      {reason}
                    </span>
                  </div>
                </div>

                {!isBulk && livePreview && (
                  <>
                    {/* Returned Products */}
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-rose-400 mb-2">
                        Returned Products & Quantities ({livePreview.returnedQuantityNow} pcs)
                      </h4>
                      <div className="space-y-1.5">
                        {livePreview.returnedItems.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between text-xs bg-zinc-900/80 px-3 py-2 rounded-lg"
                          >
                            <span className="text-zinc-200 font-medium">
                              {item.name} {item.sku ? `(${item.sku})` : ""}
                            </span>
                            <span className="text-rose-300 font-mono font-semibold">
                              {item.quantity} × ৳{item.price.toLocaleString()} = ৳
                              {item.line_refund_total.toLocaleString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Remaining Products Kept by Customer */}
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-emerald-400 mb-2">
                        Remaining Products Kept ({livePreview.remainingQuantityAfter} pcs)
                      </h4>
                      {livePreview.remainingQuantityAfter === 0 ? (
                        <p className="text-xs text-zinc-400 bg-zinc-900/60 px-3 py-2 rounded-lg">
                          0 remaining products — entire order is returned (Full Return).
                        </p>
                      ) : (
                        <div className="space-y-1.5">
                          {livePreview.remainingItems
                            .filter((ri) => ri.remaining_quantity > 0)
                            .map((ri) => (
                              <div
                                key={ri.id}
                                className="flex items-center justify-between text-xs bg-zinc-900/80 px-3 py-2 rounded-lg"
                              >
                                <span className="text-zinc-200 font-medium">
                                  {ri.name} {ri.sku ? `(${ri.sku})` : ""}
                                </span>
                                <span className="text-emerald-300 font-mono font-semibold">
                                  Keeping {ri.remaining_quantity} of {ri.original_quantity}
                                </span>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>

                    {/* Financial Breakdown */}
                    <div className="border-t border-zinc-800 pt-3 space-y-1.5 text-sm">
                      <div className="flex justify-between text-zinc-400 text-xs">
                        <span>Original Order Amount:</span>
                        <span className="font-mono text-zinc-200">
                          ৳{livePreview.originalOrderAmount.toLocaleString()}
                        </span>
                      </div>
                      {livePreview.previouslyRefundedAmount > 0 && (
                        <div className="flex justify-between text-zinc-400 text-xs">
                          <span>Previously Refunded:</span>
                          <span className="font-mono text-amber-400">
                            -৳{livePreview.previouslyRefundedAmount.toLocaleString()}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between text-zinc-300 font-semibold">
                        <span>Calculated Refund Amount (This Return):</span>
                        <span className="font-mono text-rose-400">
                          ৳{livePreview.calculatedRefundAmount.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between text-zinc-200 font-bold pt-1 border-t border-zinc-800/70">
                        <span>Updated Shopify Order Net Amount:</span>
                        <span className="font-mono text-emerald-400">
                          ৳{livePreview.updatedOrderFinancialAmount.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="flex items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowConfirmation(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2.5 rounded-xl border border-zinc-800 text-zinc-300 hover:bg-zinc-800 text-sm font-medium flex items-center gap-1.5"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to Edit
                </button>

                <button
                  type="button"
                  onClick={handleFinalSubmit}
                  disabled={isSubmitting}
                  className="px-6 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 disabled:opacity-60 text-white text-sm font-bold flex items-center gap-2 shadow-lg shadow-rose-500/20"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Synchronizing with Shopify...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Confirm & Sync{" "}
                      {livePreview?.orderOverallReturnStatus === "full" || isBulk
                        ? "Full Return"
                        : "Partial Return"}
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
