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
  Eye,
  FileText,
} from "lucide-react";
import type { DueSlipData, PrinterPaperConfig } from "@/types/due-slip";
import { DueSlipThermalCard } from "./due-slip-thermal-card";
import { loadPrinterConfig, savePrinterConfig, resetPrinterConfig } from "@/lib/printer-config";
import { PRINTER_PRESETS, GPRINTER_PRESET } from "@/types/due-slip";
import { printDueSlipsViaIframe } from "@/lib/due-slip-printer";

interface PrintDueSlipsModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderIds: string[]; // Order IDs to print
  initialStoreName?: string | null;
}

export function PrintDueSlipsModal({
  isOpen,
  onClose,
  orderIds,
  initialStoreName,
}: PrintDueSlipsModalProps) {
  const [config, setConfig] = useState<PrinterPaperConfig>(GPRINTER_PRESET);
  const [showSettings, setShowSettings] = useState(false);
  const [viewMode, setViewMode] = useState<"single" | "all">("single");

  // Data fetching and batch states
  const [slips, setSlips] = useState<DueSlipData[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [storeName, setStoreName] = useState<string>(initialStoreName || "STORE");

  // Load saved printer configuration on mount
  useEffect(() => {
    const saved = loadPrinterConfig();
    setConfig(saved);
  }, []);

  // Fetch slips data when modal opens or orderIds change
  const fetchDueSlips = useCallback(
    async (idsToFetch: string[], appendOrReplace: "replace" | "merge" = "replace") => {
      if (idsToFetch.length === 0) return;

      if (appendOrReplace === "replace") {
        setLoading(true);
      } else {
        setIsRetrying(true);
      }

      try {
        const res = await fetch("/api/orders/due-slips", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderIds: idsToFetch }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to retrieve due slips data from Shopify");
        }

        if (data.storeName) {
          setStoreName(data.storeName);
        }

        const newSlips: DueSlipData[] = data.slips || [];

        if (appendOrReplace === "replace") {
          setSlips(newSlips);
          setCurrentIndex(0);
        } else {
          // Merge retried slips with existing slips preserving order
          setSlips((prev) => {
            const updatedMap = new Map<string, DueSlipData>();
            for (const s of prev) updatedMap.set(s.id, s);
            for (const s of newSlips) updatedMap.set(s.id, s);
            return idsToFetch.map((id) => updatedMap.get(id)).filter(Boolean) as DueSlipData[];
          });
        }

        if (data.failedCount > 0) {
          toast.warning(`${data.failedCount} order(s) could not be retrieved from Shopify`);
        } else if (appendOrReplace === "merge") {
          toast.success("Successfully retried failed orders");
        }
      } catch (err: any) {
        console.error("[PrintDueSlipsModal] Error fetching due slips:", err);
        toast.error(err.message || "Could not retrieve order details from Shopify");
      } finally {
        setLoading(false);
        setIsRetrying(false);
      }
    },
    []
  );

  useEffect(() => {
    if (isOpen && orderIds.length > 0) {
      fetchDueSlips(orderIds, "replace");
    } else {
      setSlips([]);
      setCurrentIndex(0);
    }
  }, [isOpen, orderIds, fetchDueSlips]);

  // Derived counts
  const validSlips = useMemo(() => slips.filter((s) => s.isValid && !s.error), [slips]);
  const failedSlips = useMemo(() => slips.filter((s) => !s.isValid || !!s.error), [slips]);
  const warningSlips = useMemo(() => slips.filter((s) => s.isValid && s.warnings?.length > 0), [slips]);

  // Current preview slip
  const currentSlip = slips[currentIndex] || slips[0] || null;

  // Handle retry for failed orders only
  const handleRetryFailed = () => {
    const failedIds = failedSlips.map((s) => s.id);
    if (failedIds.length === 0) return;
    fetchDueSlips(failedIds, "merge");
  };

  // Handle setting updates
  const updateConfig = (updates: Partial<PrinterPaperConfig>) => {
    const updated: PrinterPaperConfig = {
      ...config,
      ...updates,
    };
    setConfig(updated);
    savePrinterConfig(updated);
  };

  // Handle Preset Select
  const handlePresetSelect = (preset: PrinterPaperConfig) => {
    updateConfig({
      presetName: preset.presetName,
      width: preset.width,
      height: preset.height,
      unit: preset.unit,
      fontSize: preset.fontSize,
      darkness: preset.darkness,
    });
    toast.success(`Applied ${preset.presetName} settings`);
  };

  // Print all valid slips
  const handlePrintAll = async () => {
    if (validSlips.length === 0) {
      toast.error("No valid slips ready to print");
      return;
    }
    setIsPrinting(true);
    try {
      const success = await printDueSlipsViaIframe(validSlips, config);
      if (success) {
        toast.success(`Sent ${validSlips.length} customer due slip(s) to printer`);
      }
    } catch (err: any) {
      toast.error(err.message || "Print execution failed");
    } finally {
      setIsPrinting(false);
    }
  };

  // Print current preview slip only
  const handlePrintCurrent = async () => {
    if (!currentSlip || !currentSlip.isValid) {
      toast.error("Current slip is invalid or not ready to print");
      return;
    }
    setIsPrinting(true);
    try {
      const success = await printDueSlipsViaIframe([currentSlip], config);
      if (success) {
        toast.success(`Sent slip for ${currentSlip.orderNumber} to printer`);
      }
    } catch (err: any) {
      toast.error(err.message || "Print execution failed");
    } finally {
      setIsPrinting(false);
    }
  };

  // Open standalone print page
  const handleOpenNewTab = () => {
    const validIds = validSlips.map((s) => s.id).join(",");
    const params = new URLSearchParams({
      ids: validIds,
      width: String(config.width),
      height: String(config.height),
      unit: config.unit,
    });
    window.open(`/print/due-slips?${params.toString()}`, "_blank");
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-4xl bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh] text-zinc-100 z-10">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800/80 bg-zinc-900/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-zinc-100">
                  Print Customer Due Slips
                </h2>
                <span className="text-[11px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-full">
                  {orderIds.length} {orderIds.length === 1 ? "Order" : "Orders"}
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Gprinter GP-3120TU Thermal Label ({config.width}&quot; × {config.height}&quot;)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`p-2 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-colors ${
                showSettings
                  ? "bg-indigo-600 text-white border-indigo-500"
                  : "bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white"
              }`}
              title="Printer & Paper Settings"
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

        {/* Status / Progress Summary Bar */}
        <div className="px-5 py-2.5 bg-zinc-900/30 border-b border-zinc-800/60 flex flex-wrap items-center justify-between gap-3 shrink-0 text-xs">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="text-zinc-400">Total:</span>
              <span className="font-semibold text-zinc-200">{slips.length}</span>
            </div>
            <div className="flex items-center gap-1.5 text-emerald-400">
              <CheckCircle2 size={13} />
              <span>Ready:</span>
              <span className="font-semibold">{validSlips.length}</span>
            </div>
            {warningSlips.length > 0 && (
              <div className="flex items-center gap-1.5 text-amber-400">
                <AlertTriangle size={13} />
                <span>Warnings:</span>
                <span className="font-semibold">{warningSlips.length}</span>
              </div>
            )}
            {failedSlips.length > 0 && (
              <div className="flex items-center gap-1.5 text-rose-400">
                <AlertCircle size={13} />
                <span>Failed:</span>
                <span className="font-semibold">{failedSlips.length}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {failedSlips.length > 0 && (
              <button
                onClick={handleRetryFailed}
                disabled={isRetrying || loading}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/15 text-rose-300 border border-rose-500/30 hover:bg-rose-500/25 transition-colors disabled:opacity-50"
              >
                <RefreshCw size={12} className={isRetrying ? "animate-spin" : ""} />
                Retry Failed ({failedSlips.length})
              </button>
            )}

            {/* View Mode Toggle */}
            <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode("single")}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                  viewMode === "single"
                    ? "bg-zinc-800 text-white shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Single
              </button>
              <button
                onClick={() => setViewMode("all")}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                  viewMode === "all"
                    ? "bg-zinc-800 text-white shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                All Slips ({slips.length})
              </button>
            </div>
          </div>
        </div>

        {/* Settings Drawer (Collapsible) */}
        {showSettings && (
          <div className="p-4 bg-zinc-900/90 border-b border-zinc-800 text-xs space-y-4 animate-in slide-in-from-top duration-150 shrink-0">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
              <div className="flex items-center gap-2 font-semibold text-zinc-200">
                <Sliders size={14} className="text-indigo-400" />
                <span>Thermal Printer &amp; Paper Configuration</span>
              </div>
              <button
                onClick={() => {
                  const reset = resetPrinterConfig();
                  setConfig(reset);
                  toast.success("Reset to default Gprinter GP-3120TU settings");
                }}
                className="text-indigo-400 hover:text-indigo-300 underline"
              >
                Reset to Gprinter Default
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Presets */}
              <div className="space-y-1.5">
                <label className="text-zinc-400 font-medium">Paper Preset</label>
                <select
                  value={config.presetName}
                  onChange={(e) => {
                    const preset = PRINTER_PRESETS.find((p) => p.presetName === e.target.value);
                    if (preset) handlePresetSelect(preset);
                  }}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-zinc-200 focus:outline-none focus:border-indigo-500"
                >
                  {PRINTER_PRESETS.map((p) => (
                    <option key={p.presetName} value={p.presetName}>
                      {p.presetName}
                    </option>
                  ))}
                </select>
              </div>

              {/* Dimensions */}
              <div className="space-y-1.5">
                <label className="text-zinc-400 font-medium">Dimensions ({config.unit})</label>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 w-1/2">
                    <span className="text-[10px] text-zinc-500">W:</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0.5"
                      value={config.width}
                      onChange={(e) => updateConfig({ width: parseFloat(e.target.value) || 1.49 })}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-zinc-200"
                    />
                  </div>
                  <div className="flex items-center gap-1 w-1/2">
                    <span className="text-[10px] text-zinc-500">H:</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0.5"
                      value={config.height}
                      onChange={(e) => updateConfig({ height: parseFloat(e.target.value) || 0.98 })}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-zinc-200"
                    />
                  </div>
                </div>
              </div>

              {/* Unit & Font Size */}
              <div className="space-y-1.5">
                <label className="text-zinc-400 font-medium">Unit &amp; Typography</label>
                <div className="flex items-center gap-2">
                  <select
                    value={config.unit}
                    onChange={(e) => updateConfig({ unit: e.target.value as "in" | "mm" })}
                    className="w-1/2 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-zinc-200"
                  >
                    <option value="in">Inch (in)</option>
                    <option value="mm">Millimeter (mm)</option>
                  </select>
                  <select
                    value={config.fontSize}
                    onChange={(e) => updateConfig({ fontSize: e.target.value as any })}
                    className="w-1/2 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-zinc-200"
                  >
                    <option value="compact">Compact (GP-3120TU)</option>
                    <option value="normal">Normal</option>
                    <option value="large">Large</option>
                  </select>
                </div>
              </div>

              {/* Store Name Override */}
              <div className="space-y-1.5">
                <label className="text-zinc-400 font-medium">Store Name Header</label>
                <input
                  type="text"
                  placeholder={storeName}
                  value={config.storeNameOverride || ""}
                  onChange={(e) => updateConfig({ storeNameOverride: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1 text-zinc-200 placeholder-zinc-600"
                />
              </div>
            </div>
          </div>
        )}

        {/* Body Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col items-center justify-center min-h-[320px] bg-zinc-950">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
              <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-zinc-200">
                  Retrieving Order Details from Shopify...
                </p>
                <p className="text-xs text-zinc-500">
                  Validating customer information and due balances directly from Shopify Admin
                </p>
              </div>
            </div>
          ) : slips.length === 0 ? (
            <div className="text-center py-12 space-y-2">
              <AlertCircle className="w-8 h-8 text-zinc-500 mx-auto" />
              <p className="text-sm font-semibold text-zinc-400">No orders to display</p>
            </div>
          ) : viewMode === "single" && currentSlip ? (
            /* Single Slip Preview Mode */
            <div className="flex flex-col items-center w-full max-w-md space-y-4">
              {/* Slip Card in Realistic View Container */}
              <div className="relative p-6 bg-zinc-900/60 border border-zinc-800/80 rounded-2xl flex flex-col items-center justify-center shadow-inner">
                {/* Visual Scale Tag */}
                <div className="absolute top-2 left-3 text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                  Live Thermal Preview ({config.width}&quot; × {config.height}&quot;)
                </div>

                <div className="pt-2">
                  <DueSlipThermalCard slip={currentSlip} config={config} />
                </div>

                {/* Validation Status Info */}
                <div className="mt-4 w-full flex flex-col items-center text-xs space-y-1">
                  {currentSlip.error ? (
                    <div className="text-rose-400 font-medium flex items-center gap-1">
                      <AlertCircle size={14} />
                      {currentSlip.error}
                    </div>
                  ) : currentSlip.warnings?.length > 0 ? (
                    <div className="text-amber-400 text-center font-medium flex flex-col items-center gap-0.5">
                      {currentSlip.warnings.map((w, i) => (
                        <div key={i} className="flex items-center gap-1">
                          <AlertTriangle size={12} />
                          {w}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-emerald-400 font-medium flex items-center gap-1">
                      <CheckCircle2 size={13} />
                      All order &amp; customer fields verified
                    </div>
                  )}
                </div>
              </div>

              {/* Navigation Carousel Controls */}
              {slips.length > 1 && (
                <div className="flex items-center justify-between w-full px-2">
                  <button
                    onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                    disabled={currentIndex === 0}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 hover:text-white hover:bg-zinc-800 disabled:opacity-40 disabled:hover:bg-zinc-900"
                  >
                    <ChevronLeft size={16} /> Previous
                  </button>

                  <span className="text-xs font-semibold text-zinc-400">
                    Slip {currentIndex + 1} of {slips.length} ({currentSlip.orderNumber})
                  </span>

                  <button
                    onClick={() => setCurrentIndex((prev) => Math.min(slips.length - 1, prev + 1))}
                    disabled={currentIndex === slips.length - 1}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 hover:text-white hover:bg-zinc-800 disabled:opacity-40 disabled:hover:bg-zinc-900"
                  >
                    Next <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* All Slips Grid View Mode */
            <div className="w-full">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 p-2 justify-items-center">
                {slips.map((slip, idx) => (
                  <div
                    key={slip.id}
                    onClick={() => {
                      setCurrentIndex(idx);
                      setViewMode("single");
                    }}
                    className={`cursor-pointer p-2 rounded-xl border transition-all ${
                      currentIndex === idx
                        ? "border-indigo-500 bg-indigo-500/10 ring-1 ring-indigo-500"
                        : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 hover:bg-zinc-900"
                    }`}
                  >
                    <DueSlipThermalCard slip={slip} config={config} />
                    <div className="mt-1.5 flex items-center justify-between text-[10px] text-zinc-400 px-0.5">
                      <span className="font-bold text-zinc-200">{slip.orderNumber}</span>
                      {slip.isValid ? (
                        <span className="text-emerald-400 flex items-center gap-0.5">
                          <Check size={10} /> Ready
                        </span>
                      ) : (
                        <span className="text-rose-400">Failed</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 border-t border-zinc-800/80 bg-zinc-900/60 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 w-full sm:w-auto text-xs text-zinc-400">
            <button
              onClick={handleOpenNewTab}
              className="flex items-center gap-1.5 text-zinc-400 hover:text-zinc-200 underline underline-offset-2"
              title="Open standalone printable document in new tab"
            >
              <ExternalLink size={13} />
              Open in dedicated tab
            </button>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 transition-colors"
            >
              Cancel
            </button>

            {slips.length > 1 && currentSlip && (
              <button
                onClick={handlePrintCurrent}
                disabled={isPrinting || loading || !currentSlip.isValid}
                className="px-3 py-2 rounded-xl text-xs font-semibold text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                <Printer size={14} />
                Print This Slip ({currentSlip.orderNumber})
              </button>
            )}

            <button
              onClick={handlePrintAll}
              disabled={isPrinting || loading || validSlips.length === 0}
              className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-600/25 flex items-center gap-2 disabled:opacity-50"
            >
              {isPrinting ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  Printing...
                </>
              ) : (
                <>
                  <Printer size={15} />
                  Print Due Slips ({validSlips.length})
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

