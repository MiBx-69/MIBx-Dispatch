"use client";

import { useState } from "react";
import {
  X,
  FileText,
  Boxes,
  ArrowDownLeft,
  ArrowUpRight,
  User,
  Calendar,
  AlertTriangle,
  RotateCcw,
  Check,
  Copy,
  Loader2,
  ShieldAlert,
  Hash,
  Tag,
} from "lucide-react";
import { toast } from "sonner";
import type { InventoryTransaction } from "@/types/inventory";

interface TransactionDetailsModalProps {
  transaction: InventoryTransaction | null;
  onClose: () => void;
  userRole?: string;
  onCorrectionSuccess?: () => void;
}

export function TransactionDetailsModal({
  transaction,
  onClose,
  userRole = "staff",
  onCorrectionSuccess,
}: TransactionDetailsModalProps) {
  const [showCorrectionForm, setShowCorrectionForm] = useState(false);
  const [correctionReason, setCorrectionReason] = useState("");
  const [correctionAction, setCorrectionAction] = useState<"reverse" | "adjust">("reverse");
  const [newQuantity, setNewQuantity] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!transaction) return null;

  const isStockIn = transaction.transaction_type === "STOCK_IN" || transaction.transaction_type === "ADJUSTMENT_IN";
  const isAdjustment = transaction.transaction_type.startsWith("ADJUSTMENT_");
  const hasCorrections = (transaction.corrections && transaction.corrections.length > 0);
  const isAdmin = userRole === "admin";

  const copyTxNumber = () => {
    navigator.clipboard.writeText(transaction.transaction_number);
    setCopied(true);
    toast.success("Transaction ID copied");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCorrect = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!correctionReason.trim()) {
      toast.error("Please enter a valid reason for the correction");
      return;
    }

    if (correctionAction === "adjust") {
      const q = parseInt(newQuantity, 10);
      if (isNaN(q) || q < 0) {
        toast.error("Please enter a valid adjusted quantity");
        return;
      }
      if (q === transaction.quantity) {
        toast.error("The new quantity cannot be the same as the current quantity");
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/inventory/transactions/${transaction.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: correctionAction,
          reason: correctionReason.trim(),
          new_quantity: correctionAction === "adjust" ? parseInt(newQuantity, 10) : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to correct transaction");

      toast.success("Transaction correction completed successfully", {
        description: data.message,
      });

      setShowCorrectionForm(false);
      onCorrectionSuccess?.();
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to submit correction");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/75 backdrop-blur-xs" onClick={onClose} />

      {/* Modal Dialog */}
      <div className="relative bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/90">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              isStockIn ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
            }`}>
              {isStockIn ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                <span>{isStockIn ? "Stock In Transaction" : "Stock Out Transaction"}</span>
                {isAdjustment && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    Adjustment
                  </span>
                )}
              </h3>
              <p className="text-[11px] font-mono text-zinc-400">
                {transaction.transaction_number}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-zinc-100 rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Main Quantity Banner */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800">
            <div>
              <p className="text-xs text-zinc-400">Quantity Transacted</p>
              <p className={`text-2xl font-bold mt-0.5 ${isStockIn ? "text-emerald-400" : "text-rose-400"}`}>
                {isStockIn ? "+" : "-"}{transaction.quantity} <span className="text-xs font-normal text-zinc-400">pcs</span>
              </p>
            </div>

            <button
              onClick={copyTxNumber}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors"
              title="Copy Transaction Number"
            >
              {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
              Copy TXN ID
            </button>
          </div>

          {/* Product details */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Product Information</p>
            <div className="p-3 rounded-xl bg-zinc-950/40 border border-zinc-800 space-y-1.5">
              <p className="text-sm font-semibold text-zinc-100">
                {transaction.inventory_products?.product_name || "Unknown Product"}
              </p>
              <div className="flex flex-wrap gap-2 text-xs font-mono text-zinc-400">
                {transaction.inventory_products?.sku && (
                  <span className="flex items-center gap-1 bg-zinc-800/80 px-2 py-0.5 rounded border border-zinc-700/50">
                    <Tag size={11} /> SKU: {transaction.inventory_products.sku}
                  </span>
                )}
                {transaction.inventory_products?.style_code && (
                  <span className="flex items-center gap-1 bg-zinc-800/80 px-2 py-0.5 rounded border border-zinc-700/50">
                    <Hash size={11} /> Style: {transaction.inventory_products.style_code}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Transaction Metadata Grid */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-zinc-950/40 border border-zinc-800 space-y-1">
              <span className="text-zinc-500 font-medium">Date & Time</span>
              <p className="text-zinc-200 font-medium">
                {new Date(transaction.transaction_date).toLocaleDateString("en-BD", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}{" "}
                at{" "}
                {new Date(transaction.transaction_date).toLocaleTimeString("en-BD", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>

            <div className="p-3 rounded-xl bg-zinc-950/40 border border-zinc-800 space-y-1">
              <span className="text-zinc-500 font-medium">Logged By</span>
              <p className="text-zinc-200 font-medium flex items-center gap-1">
                <User size={12} className="text-indigo-400" />
                {transaction.profiles?.full_name || "Staff Member"}
              </p>
            </div>

            {transaction.reference_id && (
              <div className="p-3 rounded-xl bg-zinc-950/40 border border-zinc-800 space-y-1">
                <span className="text-zinc-500 font-medium">Reference / Order ID</span>
                <p className="text-zinc-200 font-mono font-medium truncate">
                  {transaction.reference_id}
                </p>
              </div>
            )}

            {(transaction.source_category_snapshot || transaction.inventory_source_categories?.name) && (
              <div className="p-3 rounded-xl bg-zinc-950/40 border border-zinc-800 space-y-1">
                <span className="text-zinc-500 font-medium">Source Category</span>
                <p className="text-zinc-200 font-medium truncate">
                  {transaction.source_category_snapshot || transaction.inventory_source_categories?.name}
                </p>
              </div>
            )}

            {transaction.stock_out_reason && (
              <div className="p-3 rounded-xl bg-zinc-950/40 border border-zinc-800 space-y-1">
                <span className="text-zinc-500 font-medium">Stock Out Reason</span>
                <p className="text-zinc-200 font-medium truncate">
                  {transaction.stock_out_reason}
                </p>
              </div>
            )}

            {(transaction.brought_by || transaction.received_by) && (
              <div className="p-3 rounded-xl bg-zinc-950/40 border border-zinc-800 space-y-1">
                <span className="text-zinc-500 font-medium">
                  {transaction.brought_by ? "Brought By" : "Given To / Received By"}
                </span>
                <p className="text-zinc-200 font-medium truncate">
                  {transaction.brought_by || transaction.received_by}
                </p>
              </div>
            )}

            {transaction.unit_cost !== null && transaction.unit_cost !== undefined && (
              <div className="p-3 rounded-xl bg-zinc-950/40 border border-zinc-800 space-y-1">
                <span className="text-zinc-500 font-medium">Purchase Unit Cost</span>
                <p className="text-zinc-200 font-mono font-medium">
                  ৳{Number(transaction.unit_cost).toFixed(2)}
                </p>
              </div>
            )}

            {transaction.total_cost !== null && transaction.total_cost !== undefined && (
              <div className="p-3 rounded-xl bg-zinc-950/40 border border-zinc-800 space-y-1">
                <span className="text-zinc-500 font-medium">Total Purchase Cost</span>
                <p className="text-zinc-200 font-mono font-medium text-emerald-400">
                  ৳{Number(transaction.total_cost).toFixed(2)}
                </p>
              </div>
            )}
          </div>

          {/* Notes */}
          {transaction.notes && (
            <div className="p-3 rounded-xl bg-zinc-950/40 border border-zinc-800 space-y-1">
              <span className="text-xs text-zinc-500 font-medium">Notes</span>
              <p className="text-xs text-zinc-300 italic">
                &ldquo;{transaction.notes}&rdquo;
              </p>
            </div>
          )}

          {/* Existing Correction Details Alert */}
          {hasCorrections && (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-2">
              <div className="flex items-center gap-2 text-amber-400 text-xs font-semibold">
                <AlertTriangle size={15} />
                <span>This transaction has been corrected</span>
              </div>
              {transaction.corrections?.map((c) => (
                <div key={c.id} className="text-xs text-zinc-300 space-y-0.5 pt-1 border-t border-amber-500/20">
                  <p><span className="text-zinc-500">Reason:</span> {c.reason}</p>
                  <p className="text-[11px] text-zinc-400">
                    Corrected by {c.profiles?.full_name || "Admin"} on {new Date(c.created_at).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Admin Correction Section */}
          {isAdmin && !hasCorrections && !showCorrectionForm && (
            <div className="pt-2">
              <button
                onClick={() => setShowCorrectionForm(true)}
                className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-medium text-amber-400 bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/25 transition-all"
              >
                <RotateCcw size={14} />
                Correct / Reverse this Transaction (Admin)
              </button>
            </div>
          )}

          {/* Correction Form */}
          {showCorrectionForm && (
            <form onSubmit={handleCorrect} className="p-4 rounded-xl bg-zinc-950 border border-amber-500/30 space-y-3 animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                  <ShieldAlert size={14} /> Correct Transaction Ledger
                </p>
                <button
                  type="button"
                  onClick={() => setShowCorrectionForm(false)}
                  className="text-xs text-zinc-500 hover:text-zinc-300"
                >
                  Cancel
                </button>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] text-zinc-400">Action</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCorrectionAction("reverse")}
                    className={`py-1.5 px-3 rounded-lg text-xs font-medium border text-center transition-all ${
                      correctionAction === "reverse"
                        ? "bg-amber-500/20 border-amber-500/40 text-amber-300"
                        : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    Full Reversal
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCorrectionAction("adjust");
                      setNewQuantity(String(transaction.quantity));
                    }}
                    className={`py-1.5 px-3 rounded-lg text-xs font-medium border text-center transition-all ${
                      correctionAction === "adjust"
                        ? "bg-amber-500/20 border-amber-500/40 text-amber-300"
                        : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    Adjust Quantity
                  </button>
                </div>
              </div>

              {correctionAction === "adjust" && (
                <div className="space-y-1">
                  <label className="text-[11px] text-zinc-400">
                    Corrected Quantity (Originally {transaction.quantity})
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={newQuantity}
                    onChange={(e) => setNewQuantity(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-100 text-xs focus:outline-hidden focus:border-amber-500"
                    required
                  />
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[11px] text-zinc-400">
                  Reason for Correction <span className="text-rose-400">*</span>
                </label>
                <textarea
                  value={correctionReason}
                  onChange={(e) => setCorrectionReason(e.target.value)}
                  placeholder="Explain why this transaction is being reversed or adjusted..."
                  rows={2}
                  className="w-full px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-100 text-xs focus:outline-hidden focus:border-amber-500"
                  required
                />
              </div>

              <div className="pt-1 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCorrectionForm(false)}
                  className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-amber-600 hover:bg-amber-500 disabled:opacity-50 flex items-center gap-1.5 transition-colors"
                >
                  {isSubmitting ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                  Confirm Correction
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-zinc-800 bg-zinc-900/90 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

