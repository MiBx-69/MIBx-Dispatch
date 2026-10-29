"use client";

import { useEffect, useState } from "react";
import {
  X,
  Boxes,
  ArrowDownLeft,
  ArrowUpRight,
  Clock,
  Tag,
  Hash,
  Copy,
  Check,
  PackagePlus,
  PackageMinus,
  Loader2,
  Calendar,
  User,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import type { ProductStockSummary, InventoryTransaction } from "@/types/inventory";

interface ProductDetailsDrawerProps {
  productId: string | null;
  onClose: () => void;
  onStockIn?: (product: ProductStockSummary) => void;
  onStockOut?: (product: ProductStockSummary) => void;
  onSelectTransaction?: (transaction: InventoryTransaction) => void;
}

export function ProductDetailsDrawer({
  productId,
  onClose,
  onStockIn,
  onStockOut,
  onSelectTransaction,
}: ProductDetailsDrawerProps) {
  const [loading, setLoading] = useState(false);
  const [product, setProduct] = useState<ProductStockSummary | null>(null);
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    if (!productId) {
      setProduct(null);
      setTransactions([]);
      return;
    }

    let isMounted = true;
    setLoading(true);

    fetch(`/api/inventory/products/${productId}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load product details");
        return res.json();
      })
      .then((data) => {
        if (isMounted) {
          setProduct(data.product);
          setTransactions(data.transactions || []);
        }
      })
      .catch((err) => {
        toast.error(err.message || "Could not load product details");
        onClose();
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [productId, onClose]);

  if (!productId) return null;

  const copyToClipboard = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    toast.success(`Copied ${fieldName} to clipboard`);
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-xs transition-opacity duration-200"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-2xl bg-zinc-900 border-l border-zinc-800 shadow-2xl flex flex-col h-full animate-in slide-in-from-right duration-200">
          
          {/* Drawer Header */}
          <div className="px-6 py-5 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/90 sticky top-0 z-10">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0 text-indigo-400">
                <Boxes size={20} />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-bold text-zinc-100 truncate">
                  {product?.product_name || "Product Ledger"}
                </h2>
                <p className="text-xs text-zinc-400 flex items-center gap-2 mt-0.5">
                  <span>Stock Ledger & Audit History</span>
                  {product?.status === "archived" && (
                    <span className="px-1.5 py-0.2 rounded text-[10px] bg-zinc-800 text-zinc-400 border border-zinc-700">
                      Archived
                    </span>
                  )}
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors"
              title="Close drawer"
            >
              <X size={20} />
            </button>
          </div>

          {/* Drawer Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 text-zinc-400 gap-3">
                <Loader2 size={30} className="animate-spin text-indigo-400" />
                <p className="text-sm">Loading complete stock history...</p>
              </div>
            ) : product ? (
              <>
                {/* Meta details & copy pills */}
                <div className="flex flex-wrap items-center gap-2">
                  {product.sku ? (
                    <button
                      onClick={() => copyToClipboard(product.sku!, "SKU")}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors"
                      title="Click to copy SKU"
                    >
                      <Tag size={12} className="text-zinc-400" />
                      SKU: {product.sku}
                      {copiedField === "SKU" ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} className="text-zinc-500" />}
                    </button>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-xs text-zinc-500 bg-zinc-800/40 border border-zinc-800">
                      No SKU
                    </span>
                  )}

                  {product.style_code ? (
                    <button
                      onClick={() => copyToClipboard(product.style_code!, "Style Code")}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors"
                      title="Click to copy Style Code"
                    >
                      <Hash size={12} className="text-zinc-400" />
                      Style: {product.style_code}
                      {copiedField === "Style Code" ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} className="text-zinc-500" />}
                    </button>
                  ) : null}

                  {product.last_transaction_date && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs text-zinc-400 bg-zinc-800/50 border border-zinc-800 ml-auto">
                      <Clock size={12} />
                      Last activity: {new Date(product.last_transaction_date).toLocaleDateString()}
                    </span>
                  )}
                </div>

                {/* Stock Stats Row */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-3.5">
                    <p className="text-[11px] font-medium text-emerald-400 flex items-center gap-1">
                      <ArrowDownLeft size={13} /> Total Stock In
                    </p>
                    <p className="text-xl font-bold text-zinc-100 mt-1">
                      +{product.total_stock_in || 0}
                    </p>
                  </div>

                  <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-3.5">
                    <p className="text-[11px] font-medium text-rose-400 flex items-center gap-1">
                      <ArrowUpRight size={13} /> Total Stock Out
                    </p>
                    <p className="text-xl font-bold text-zinc-100 mt-1">
                      -{product.total_stock_out || 0}
                    </p>
                  </div>

                  <div className="bg-indigo-950/30 border border-indigo-500/30 rounded-xl p-3.5 shadow-sm">
                    <p className="text-[11px] font-medium text-indigo-300 flex items-center gap-1">
                      <Boxes size={13} /> Available Stock
                    </p>
                    <p className="text-2xl font-bold text-white mt-1">
                      {product.current_stock || 0}
                      <span className="text-xs font-normal text-zinc-400 ml-1">pcs</span>
                    </p>
                  </div>
                </div>

                {/* Quick actions for this product */}
                <div className="flex items-center gap-2 pt-1">
                  {onStockIn && (
                    <button
                      onClick={() => onStockIn(product)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 transition-all active:scale-98"
                    >
                      <PackagePlus size={14} />
                      Stock In for This Item
                    </button>
                  )}
                  {onStockOut && (
                    <button
                      onClick={() => onStockOut(product)}
                      disabled={(product.current_stock || 0) <= 0}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 transition-all active:scale-98 disabled:opacity-40 disabled:pointer-events-none"
                    >
                      <PackageMinus size={14} />
                      Stock Out for This Item
                    </button>
                  )}
                </div>

                {/* Ledger Table */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
                      Chronological Stock History ({transactions.length})
                    </h3>
                  </div>

                  {transactions.length === 0 ? (
                    <div className="text-center py-12 border border-dashed border-zinc-800 rounded-xl bg-zinc-950/30 text-zinc-500 text-xs">
                      No stock movements recorded yet for this product.
                    </div>
                  ) : (
                    <div className="border border-zinc-800 rounded-xl overflow-hidden bg-zinc-950/40 divide-y divide-zinc-800/80">
                      {transactions.map((tx) => {
                        const isStockIn = tx.transaction_type === "STOCK_IN" || tx.transaction_type === "ADJUSTMENT_IN";
                        const isCorrection = tx.transaction_type.startsWith("ADJUSTMENT_");
                        const dateStr = new Date(tx.transaction_date).toLocaleDateString("en-BD", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        });
                        const timeStr = new Date(tx.transaction_date).toLocaleTimeString("en-BD", {
                          hour: "2-digit",
                          minute: "2-digit",
                        });

                        return (
                          <div
                            key={tx.id}
                            onClick={() => onSelectTransaction?.(tx)}
                            className="p-3.5 hover:bg-zinc-800/40 transition-colors flex items-start justify-between gap-3 cursor-pointer group"
                          >
                            <div className="space-y-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                    isStockIn
                                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                      : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                                  }`}
                                >
                                  {isStockIn ? "+" : "-"}
                                  {tx.quantity} pcs
                                </span>

                                <span className="text-xs font-mono text-zinc-400 group-hover:text-indigo-300 transition-colors">
                                  {tx.transaction_number}
                                </span>

                                {isCorrection && (
                                  <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1 py-0.2 rounded font-medium">
                                    Adjustment
                                  </span>
                                )}
                              </div>

                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400">
                                {tx.reference_id && (
                                  <span className="text-zinc-300 font-medium">
                                    Ref: {tx.reference_id}
                                  </span>
                                )}

                                {tx.source_category_snapshot || tx.inventory_source_categories?.name ? (
                                  <span>
                                    Source: {tx.source_category_snapshot || tx.inventory_source_categories?.name}
                                  </span>
                                ) : null}

                                {tx.stock_out_reason && (
                                  <span>Reason: {tx.stock_out_reason}</span>
                                )}

                                {tx.profiles?.full_name && (
                                  <span className="flex items-center gap-1 text-zinc-500">
                                    <User size={11} /> {tx.profiles.full_name}
                                  </span>
                                )}
                              </div>

                              {tx.notes && (
                                <p className="text-[11px] text-zinc-500 italic truncate max-w-md">
                                  &ldquo;{tx.notes}&rdquo;
                                </p>
                              )}
                            </div>

                            <div className="text-right shrink-0">
                              <p className="text-xs text-zinc-300 font-medium">{dateStr}</p>
                              <p className="text-[10px] text-zinc-500">{timeStr}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </div>

          {/* Drawer Footer */}
          <div className="px-6 py-4 border-t border-zinc-800 bg-zinc-900/90 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

