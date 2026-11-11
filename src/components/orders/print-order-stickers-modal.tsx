"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { toast } from "sonner";
import {
  X,
  Printer,
  Settings2,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Sliders,
  Check,
  AlertCircle,
  FileText,
  Tag,
  Crosshair,
  Edit3,
} from "lucide-react";
import type { OrderStickerData, OrderStickerConfig } from "@/types/order-sticker";
import { DEFAULT_75X100_CONFIG } from "@/types/order-sticker";
import { OrderStickerThermalCard } from "./order-sticker-thermal-card";
import {
  loadOrderStickerConfig,
  saveOrderStickerConfig,
  resetOrderStickerConfig,
  setCustomDiscountReason,
} from "@/lib/order-sticker-config";
import {
  printOrderStickersViaIframe,
  printTestCalibrationSticker,
} from "@/lib/order-sticker-printer";

interface PrintOrderStickersModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderIds: string[];
  initialStoreName?: string | null;
}

export function PrintOrderStickersModal({
  isOpen,
  onClose,
  orderIds,
  initialStoreName,
}: PrintOrderStickersModalProps) {
  const [config, setConfig] = useState<OrderStickerConfig>(DEFAULT_75X100_CONFIG);
  const [showSettings, setShowSettings] = useState(false);
  const [viewMode, setViewMode] = useState<"single" | "all">("single");

  // Data fetching and batch states
  const [stickers, setStickers] = useState<OrderStickerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isTestPrinting, setIsTestPrinting] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [storeName, setStoreName] = useState<string>(initialStoreName || "UNIVERSES");

  // Inline custom discount editing
  const [editingDiscountId, setEditingDiscountId] = useState<string | null>(null);
  const [discountReasonInput, setDiscountReasonInput] = useState("");

  // Load saved configuration on mount
  useEffect(() => {
    const saved = loadOrderStickerConfig();
    setConfig(saved);
  }, []);

  // Fetch stickers data
  const fetchStickers = useCallback(
    async (idsToFetch: string[], appendOrReplace: "replace" | "merge" = "replace") => {
      if (idsToFetch.length === 0) return;

      if (appendOrReplace === "replace") {
        setLoading(true);
      } else {
        setIsRetrying(true);
      }

      try {
        const savedConfig = loadOrderStickerConfig();
        const res = await fetch("/api/orders/stickers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderIds: idsToFetch,
            customDiscountReasons: savedConfig.customDiscountReasons || {},
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to retrieve order details from Shopify");
        }

        if (data.storeName) {
          setStoreName(data.storeName);
        }

        const newStickers: OrderStickerData[] = data.stickers || [];

        if (appendOrReplace === "replace") {
          setStickers(newStickers);
          setCurrentIndex(0);
        } else {
          setStickers((prev) => {
            const map = new Map<string, OrderStickerData>();
            for (const s of prev) map.set(s.orderId, s);
            for (const s of newStickers) map.set(s.orderId, s);
            return idsToFetch.map((id) => map.get(id)).filter(Boolean) as OrderStickerData[];
          });
        }

        if (data.failedCount > 0) {
          toast.warning(`${data.failedCount} order(s) could not be verified from Shopify`);
        } else if (appendOrReplace === "merge") {
          toast.success("Successfully retried failed orders");
        }
      } catch (err: any) {
        console.error("[PrintOrderStickersModal] Error fetching stickers:", err);
        toast.error(err.message || "Failed to load order sticker data");
      } finally {
        setLoading(false);
        setIsRetrying(false);
      }
    },
    []
  );

  useEffect(() => {
    if (isOpen && orderIds.length > 0) {
      fetchStickers(orderIds, "replace");
    } else {
      setStickers([]);
      setCurrentIndex(0);
    }
  }, [isOpen, orderIds, fetchStickers]);

  const validStickers = useMemo(() => stickers.filter((s) => s.isValid), [stickers]);
  const failedCount = orderIds.length - validStickers.length;
  const currentSticker = stickers[currentIndex] || stickers[0] || null;

  // Handle retry for failed orders only
  const handleRetryFailed = () => {
    const validIds = new Set(validStickers.map((s) => s.orderId));
    const failedIds = orderIds.filter((id) => !validIds.has(id));
    if (failedIds.length === 0) return;
    fetchStickers(failedIds, "merge");
  };

  const updateConfig = (updates: Partial<OrderStickerConfig>) => {
    const updated: OrderStickerConfig = {
      ...config,
      ...updates,
    };
    setConfig(updated);
    saveOrderStickerConfig(updated);
  };

  // Save custom discount reason for current order
  const handleSaveCustomDiscountReason = (orderId: string) => {
    const updatedConfig = setCustomDiscountReason(orderId, discountReasonInput.trim());
    setConfig(updatedConfig);
    // Update active sticker in state
    setStickers((prev) =>
      prev.map((s) => {
        if (s.orderId === orderId) {
          return {
            ...s,
            financials: {
              ...s.financials,
              discountReason: discountReasonInput.trim() || s.financials.discountReason,
            },
          };
        }
        return s;
      })
    );
    setEditingDiscountId(null);
    toast.success("Updated custom discount reason for sticker");
  };

  // Test Print Calibration
  const handleTestPrint = async () => {
    setIsTestPrinting(true);
    try {
      const ok = await printTestCalibrationSticker(config);
      if (ok) {
        toast.success("Submitted 75×100mm test calibration sticker to Windows printer driver");
      }
    } catch (e: any) {
      toast.error(e.message || "Test print failed");
    } finally {
      setIsTestPrinting(false);
    }
  };

  // Print All Valid Stickers
  const handlePrintAll = async () => {
    if (validStickers.length === 0) {
      toast.error("No verified stickers ready to print");
      return;
    }
    setIsPrinting(true);
    try {
      const success = await printOrderStickersViaIframe(validStickers, config);
      if (success) {
        toast.success(`Submitted ${validStickers.length} sticker(s) to GP-3120TU Windows print queue`);
      }
    } catch (err: any) {
      toast.error(err.message || "Print submission failed");
    } finally {
      setIsPrinting(false);
    }
  };

  // Print Current Sticker Only
  const handlePrintCurrent = async () => {
    if (!currentSticker) return;
    setIsPrinting(true);
    try {
      const success = await printOrderStickersViaIframe([currentSticker], config);
      if (success) {
        toast.success(`Submitted sticker ${currentSticker.orderNumber} to GP-3120TU print queue`);
      }
    } catch (err: any) {
      toast.error(err.message || "Print submission failed");
    } finally {
      setIsPrinting(false);
    }
  };

  // Dedicated Tab Fallback
  const handleOpenDedicatedTab = () => {
    const validIds = validStickers.map((s) => s.orderId).join(",");
    window.open(`/print/order-stickers?ids=${validIds}`, "_blank");
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" onClick={onClose} />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-5xl bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh] text-zinc-100 z-10">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800 bg-zinc-900/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-zinc-100">
                  Print Order Stickers (75×100mm)
                </h2>
                <span className="text-[11px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full">
                  {orderIds.length} {orderIds.length === 1 ? "Order" : "Orders"}
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Direct Thermal Self-Adhesive Die-Cut Labels (75mm × 100mm)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`p-2 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-colors ${
                showSettings
                  ? "bg-amber-600 text-white border-amber-500"
                  : "bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white"
              }`}
              title="Sticker & Printer Configuration"
            >
              <Settings2 size={16} />
              <span className="hidden sm:inline">Settings</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 border border-transparent hover:border-zinc-800 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Status / Counters Bar */}
        <div className="px-5 py-2.5 bg-zinc-900/40 border-b border-zinc-800/80 flex flex-wrap items-center justify-between gap-3 shrink-0 text-xs">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="text-zinc-400">Selected:</span>
              <span className="font-bold text-zinc-100">{orderIds.length}</span>
            </div>
            <div className="flex items-center gap-1.5 text-emerald-400">
              <CheckCircle2 size={13} />
              <span>Ready for Print:</span>
              <span className="font-bold">{validStickers.length}</span>
            </div>
            {failedCount > 0 && (
              <div className="flex items-center gap-1.5 text-rose-400">
                <AlertCircle size={13} />
                <span>Failed:</span>
                <span className="font-bold">{failedCount}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {failedCount > 0 && (
              <button
                onClick={handleRetryFailed}
                disabled={isRetrying || loading}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/15 text-rose-300 border border-rose-500/30 hover:bg-rose-500/25 transition-colors disabled:opacity-50 font-medium"
              >
                <RefreshCw size={12} className={isRetrying ? "animate-spin" : ""} />
                Retry Failed ({failedCount})
              </button>
            )}

            {/* View Mode Toggle */}
            <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode("single")}
                className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
                  viewMode === "single"
                    ? "bg-zinc-800 text-white shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Single Preview
              </button>
              <button
                onClick={() => setViewMode("all")}
                className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
                  viewMode === "all"
                    ? "bg-zinc-800 text-white shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Grid ({validStickers.length})
              </button>
            </div>
          </div>
        </div>

        {/* Settings Drawer (Collapsible) */}
        {showSettings && (
          <div className="p-4 bg-zinc-900/95 border-b border-zinc-800 text-xs space-y-4 animate-in slide-in-from-top duration-150 shrink-0">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
              <div className="flex items-center gap-2 font-semibold text-zinc-200">
                <Sliders size={14} className="text-amber-400" />
                <span>75×100mm Thermal Printer Settings (Gprinter GP-3120TU)</span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleTestPrint}
                  disabled={isTestPrinting}
                  className="px-2.5 py-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 font-semibold flex items-center gap-1 transition-colors"
                >
                  <Crosshair size={12} />
                  {isTestPrinting ? "Printing..." : "Run Test Alignment Print"}
                </button>
                <button
                  onClick={() => {
                    const reset = resetOrderStickerConfig();
                    setConfig(reset);
                    toast.success("Reset to default 75×100mm settings");
                  }}
                  className="text-amber-400 hover:text-amber-300 underline"
                >
                  Reset Defaults
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Preset Lock */}
              <div className="space-y-1.5">
                <label className="text-zinc-400 font-medium">Physical Dimensions</label>
                <div className="p-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-300 font-mono text-[11px] flex justify-between">
                  <span>75mm × 100mm</span>
                  <span className="text-amber-400 font-bold">Portrait (203 DPI)</span>
                </div>
              </div>

              {/* Store Name Header */}
              <div className="space-y-1.5">
                <label className="text-zinc-400 font-medium">Store Header Name</label>
                <input
                  type="text"
                  placeholder="UNIVERSES"
                  value={config.storeNameOverride || ""}
                  onChange={(e) => updateConfig({ storeNameOverride: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1 text-zinc-200 placeholder-zinc-600"
                />
              </div>

              {/* Alignment Offsets */}
              <div className="space-y-1.5">
                <label className="text-zinc-400 font-medium">Alignment Offsets (mm)</label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] text-zinc-500 block mb-0.5">Top (mm)</span>
                    <input
                      type="number"
                      step="0.5"
                      min="-10"
                      max="10"
                      value={config.topOffsetMm || 0}
                      onChange={(e) => updateConfig({ topOffsetMm: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-zinc-200 text-xs"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-500 block mb-0.5">Left (mm)</span>
                    <input
                      type="number"
                      step="0.5"
                      min="-10"
                      max="10"
                      value={config.leftOffsetMm || 0}
                      onChange={(e) => updateConfig({ leftOffsetMm: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-zinc-200 text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Toggles */}
              <div className="space-y-2 pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-zinc-300">
                  <input
                    type="checkbox"
                    checked={config.showSku}
                    onChange={(e) => updateConfig({ showSku: e.target.checked })}
                    className="rounded bg-zinc-950 border-zinc-800 text-amber-500"
                  />
                  <span>Show Product SKU</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-zinc-300">
                  <input
                    type="checkbox"
                    checked={config.showAltPhone}
                    onChange={(e) => updateConfig({ showAltPhone: e.target.checked })}
                    className="rounded bg-zinc-950 border-zinc-800 text-amber-500"
                  />
                  <span>Show Alternative Phone</span>
                </label>
              </div>
            </div>

            {/* Driver Note */}
            <div className="p-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-[10px] text-zinc-400 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div>
                <span className="font-semibold text-zinc-300 mr-1.5">Printable Area Configuration:</span>
                <span>Premium full-label layout (~70.6×96mm active zone). Horizontal margins: 2.2mm, Vertical: 2.0mm. Adjust offsets if physical roller shifts paper.</span>
              </div>
            </div>
          </div>
        )}

        {/* Body Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col items-center justify-center min-h-[380px] bg-zinc-950">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
              <RefreshCw className="w-8 h-8 text-amber-400 animate-spin" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-zinc-200">
                  Retrieving Order Line Items &amp; Verified Balances...
                </p>
                <p className="text-xs text-zinc-500">
                  Validating products, variants, advance payments, and COD amounts from Shopify
                </p>
              </div>
            </div>
          ) : stickers.length === 0 ? (
            <div className="text-center py-12 space-y-2">
              <AlertCircle className="w-8 h-8 text-zinc-500 mx-auto" />
              <p className="text-sm font-semibold text-zinc-400">No order stickers to display</p>
            </div>
          ) : viewMode === "single" && currentSticker ? (
            /* Single Sticker Preview */
            <div className="flex flex-col items-center w-full max-w-lg space-y-4">
              <div className="relative p-6 bg-zinc-900/60 border border-zinc-800/80 rounded-2xl flex flex-col items-center justify-center shadow-inner">
                {/* Physical Dimension Tag */}
                <div className="absolute top-2 left-3 text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                  Physical 75mm × 100mm Preview
                </div>

                <div className="pt-3">
                  <OrderStickerThermalCard sticker={currentSticker} config={config} />
                </div>

                {/* Adaptive Density Alert for Multi-Item Orders */}
                {currentSticker.items.length > 4 && (
                  <div className="mt-2 text-[11px] font-semibold text-amber-300 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-lg flex items-center gap-1.5 max-w-sm">
                    <AlertTriangle size={13} className="shrink-0 text-amber-400" />
                    <span>Order has {currentSticker.items.length} items. Adaptive high-density layout enabled so every item prints legibly.</span>
                  </div>
                )}

                {/* Custom Discount Reason Editor */}
                {currentSticker.financials.productDiscount > 0 && (
                  <div className="mt-3 w-full border-t border-zinc-800 pt-2 text-xs flex items-center justify-between gap-2">
                    {editingDiscountId === currentSticker.orderId ? (
                      <div className="flex items-center gap-1.5 w-full">
                        <input
                          type="text"
                          value={discountReasonInput}
                          onChange={(e) => setDiscountReasonInput(e.target.value)}
                          placeholder="e.g. VIP Customer, Promo Code..."
                          className="bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-100 flex-1"
                        />
                        <button
                          onClick={() => handleSaveCustomDiscountReason(currentSticker.orderId)}
                          className="px-2 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-semibold"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingDiscountId(null)}
                          className="px-2 py-1 bg-zinc-800 text-zinc-400 rounded text-xs"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between w-full text-[11px] text-zinc-400">
                        <span className="truncate">
                          Discount Reason:{" "}
                          <strong className="text-zinc-200">
                            {currentSticker.financials.discountReason || "None specified"}
                          </strong>
                        </span>
                        <button
                          onClick={() => {
                            setDiscountReasonInput(currentSticker.financials.discountReason || "");
                            setEditingDiscountId(currentSticker.orderId);
                          }}
                          className="text-amber-400 hover:text-amber-300 flex items-center gap-1 font-semibold ml-2 shrink-0"
                        >
                          <Edit3 size={11} /> Edit Reason
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Navigation Carousel */}
              {stickers.length > 1 && (
                <div className="flex items-center justify-between w-full px-2">
                  <button
                    onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                    disabled={currentIndex === 0}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 hover:text-white hover:bg-zinc-800 disabled:opacity-40"
                  >
                    <ChevronLeft size={16} /> Previous
                  </button>

                  <span className="text-xs font-semibold text-zinc-400">
                    Sticker {currentIndex + 1} of {stickers.length} ({currentSticker.orderNumber})
                  </span>

                  <button
                    onClick={() => setCurrentIndex((prev) => Math.min(stickers.length - 1, prev + 1))}
                    disabled={currentIndex === stickers.length - 1}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 hover:text-white hover:bg-zinc-800 disabled:opacity-40"
                  >
                    Next <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* All Stickers Grid View */
            <div className="w-full">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 p-2 justify-items-center">
                {stickers.map((stk, idx) => (
                  <div
                    key={stk.orderId}
                    onClick={() => {
                      setCurrentIndex(idx);
                      setViewMode("single");
                    }}
                    className={`cursor-pointer p-2 rounded-xl border transition-all ${
                      currentIndex === idx
                        ? "border-amber-500 bg-amber-500/10 ring-1 ring-amber-500"
                        : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 hover:bg-zinc-900"
                    }`}
                  >
                    <OrderStickerThermalCard sticker={stk} config={config} />
                    <div className="mt-1.5 flex items-center justify-between text-[10px] text-zinc-400 px-0.5">
                      <span className="font-bold text-zinc-200">{stk.orderNumber}</span>
                      <span className="text-emerald-400 flex items-center gap-0.5">
                        <Check size={10} /> Verified
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 border-t border-zinc-800 bg-zinc-900/70 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 w-full sm:w-auto text-xs text-zinc-400">
            <button
              onClick={handleOpenDedicatedTab}
              className="flex items-center gap-1.5 text-zinc-400 hover:text-zinc-200 underline underline-offset-2"
              title="Open full-screen printable document in a new tab"
            >
              <ExternalLink size={13} />
              Open dedicated print tab
            </button>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 transition-colors"
            >
              Cancel
            </button>

            {stickers.length > 1 && currentSticker && (
              <button
                onClick={handlePrintCurrent}
                disabled={isPrinting || loading}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-zinc-200 hover:text-white bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                <Printer size={14} />
                Print Sticker ({currentSticker.orderNumber})
              </button>
            )}

            <button
              onClick={handlePrintAll}
              disabled={isPrinting || loading || validStickers.length === 0}
              className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-amber-600 hover:bg-amber-500 transition-colors shadow-lg shadow-amber-600/25 flex items-center gap-2 disabled:opacity-50"
            >
              {isPrinting ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  Submitting to Driver...
                </>
              ) : (
                <>
                  <Printer size={15} />
                  Print Order Stickers ({validStickers.length})
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
