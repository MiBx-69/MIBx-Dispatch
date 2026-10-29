"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  PackageMinus,
  Boxes,
  Tag,
  Hash,
  User,
  FileText,
  Calendar,
  AlertTriangle,
  Search,
  Loader2,
  ArrowLeft,
  X,
  ShieldAlert,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import type { ProductStockSummary } from "@/types/inventory";

const STOCK_OUT_REASONS = [
  "Online Order",
  "Showroom Sale",
  "Stock Transfer",
  "Damaged Product",
  "Missing Stock",
  "Sample / Photography",
  "Other",
];

interface StockOutFormProps {
  initialProductId?: string;
  initialProductName?: string;
  currentUserFullName?: string;
}

export function StockOutForm({
  initialProductId,
  initialProductName,
  currentUserFullName,
}: StockOutFormProps) {
  const router = useRouter();

  // Selected product
  const [selectedProduct, setSelectedProduct] = useState<ProductStockSummary | null>(null);
  const [productSearch, setProductSearch] = useState(initialProductName || "");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<ProductStockSummary[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);

  // Form Fields
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("Online Order");
  const [referenceId, setReferenceId] = useState("");
  const [givenTo, setGivenTo] = useState("");
  const [transactionDate, setTransactionDate] = useState(() => {
    return new Date().toISOString().slice(0, 10);
  });
  const [notes, setNotes] = useState("");

  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load initial product if ID provided
  useEffect(() => {
    if (initialProductId) {
      fetch(`/api/inventory/products/${initialProductId}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.product) {
            setSelectedProduct(data.product);
            setProductSearch(data.product.product_name);
          }
        })
        .catch(() => {});
    }
  }, [initialProductId]);

  // Autocomplete search handler
  useEffect(() => {
    if (selectedProduct && productSearch === selectedProduct.product_name) {
      return;
    }

    if (!productSearch.trim()) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/inventory/products?mode=autocomplete&q=${encodeURIComponent(productSearch.trim())}`);
        const data = await res.json();
        setSearchResults(data.products || []);
        setShowDropdown(true);
      } catch (err) {
        console.error(err);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [productSearch, selectedProduct]);

  // Close dropdown when clicked outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelectProduct = (prod: ProductStockSummary) => {
    setSelectedProduct(prod);
    setProductSearch(prod.product_name);
    setShowDropdown(false);
  };

  const availableStock = selectedProduct?.current_stock || 0;
  const parsedQty = parseInt(quantity, 10);
  const isExceedingStock = selectedProduct !== null && !isNaN(parsedQty) && parsedQty > availableStock;
  const isOutOfStock = selectedProduct !== null && availableStock <= 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedProduct) {
      toast.error("Please select an existing product from the list");
      return;
    }

    if (isNaN(parsedQty) || parsedQty <= 0) {
      toast.error("Quantity must be a positive number");
      return;
    }

    if (parsedQty > availableStock) {
      toast.error(`Cannot stock out ${parsedQty} units. Only ${availableStock} pcs currently available.`);
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        product_id: selectedProduct.id,
        quantity: parsedQty,
        stock_out_reason: reason,
        reference_id: referenceId.trim() || undefined,
        given_to: givenTo.trim() || undefined,
        transaction_date: transactionDate ? new Date(transactionDate).toISOString() : undefined,
        notes: notes.trim() || undefined,
        idempotency_key: idempotencyKey,
      };

      const res = await fetch("/api/inventory/stock-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to record stock out");
      }

      toast.success(`Deducted ${parsedQty} units of ${selectedProduct.product_name}!`, {
        description: `Remaining Stock: ${data.product?.current_stock} pcs. TXN: ${data.transaction?.transaction_number}`,
      });

      setIdempotencyKey(crypto.randomUUID());
      router.push("/inventory");
    } catch (err: any) {
      toast.error(err.message || "Failed to record Stock Out");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/inventory"
            className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white transition-colors"
            title="Back to Inventory Overview"
          >
            <ArrowLeft size={16} />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
              <PackageMinus className="text-rose-400" size={22} />
              Stock Out — Outgoing Product Entry
            </h1>
            <p className="text-xs text-zinc-400 mt-0.5">
              Record outgoing stock for online orders, showroom sales, samples, or transfers
            </p>
          </div>
        </div>
      </div>

      {/* Form Card */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl">
        <form onSubmit={handleSubmit} className="space-y-6">
          
          {/* Section 1: Product Selection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-zinc-200 uppercase tracking-wide flex items-center gap-1.5">
                <Boxes size={14} className="text-indigo-400" />
                Select Product <span className="text-rose-400">*</span>
              </label>

              {selectedProduct && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedProduct(null);
                    setProductSearch("");
                  }}
                  className="text-xs text-zinc-400 hover:text-zinc-200 flex items-center gap-1"
                >
                  <X size={12} /> Change Product
                </button>
              )}
            </div>

            {/* Product Search & Dropdown Container */}
            <div className="relative" ref={dropdownRef}>
              <div className="relative">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Search existing product to stock out (by Name, SKU, Style)..."
                  value={productSearch}
                  onChange={(e) => {
                    setProductSearch(e.target.value);
                    if (selectedProduct && e.target.value !== selectedProduct.product_name) {
                      setSelectedProduct(null);
                    }
                  }}
                  onFocus={() => {
                    if (searchResults.length > 0) setShowDropdown(true);
                  }}
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-zinc-950 border border-zinc-700/80 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-hidden focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
                  required
                />
                {isSearching && (
                  <Loader2 size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 animate-spin" />
                )}
              </div>

              {/* Autocomplete Dropdown */}
              {showDropdown && (
                <div className="absolute left-0 right-0 top-full mt-1.5 z-30 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden max-h-60 overflow-y-auto divide-y divide-zinc-800">
                  {searchResults.length === 0 ? (
                    <div className="p-4 text-center text-xs text-zinc-500">
                      No matching products found.
                    </div>
                  ) : (
                    searchResults.map((p) => (
                      <div
                        key={p.id}
                        onClick={() => handleSelectProduct(p)}
                        className="p-3 hover:bg-zinc-800 cursor-pointer transition-colors flex items-center justify-between"
                      >
                        <div className="min-w-0 pr-3">
                          <p className="text-xs font-semibold text-zinc-100 truncate">{p.product_name}</p>
                          <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-400 mt-0.5">
                            {p.sku && <span>SKU: {p.sku}</span>}
                            {p.style_code && <span>Style: {p.style_code}</span>}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                            (p.current_stock || 0) <= 0
                              ? "text-rose-400 bg-rose-500/10 border border-rose-500/20"
                              : "text-emerald-400 bg-emerald-500/10 border border-emerald-500/20"
                          }`}>
                            {p.current_stock || 0} available
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Selected Product Stock Card */}
            {selectedProduct && (
              <div className={`p-4 rounded-xl border transition-all ${
                isOutOfStock
                  ? "bg-rose-950/20 border-rose-500/30 text-rose-300"
                  : "bg-zinc-950/60 border-zinc-800"
              }`}>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wide">
                      Selected Item
                    </span>
                    <h4 className="text-sm font-bold text-zinc-100 mt-0.5">
                      {selectedProduct.product_name}
                    </h4>
                    <div className="flex items-center gap-3 text-xs font-mono text-zinc-400 mt-1">
                      {selectedProduct.sku && <span>SKU: {selectedProduct.sku}</span>}
                      {selectedProduct.style_code && <span>Style: {selectedProduct.style_code}</span>}
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-[11px] font-medium text-zinc-400 block">Current Available</span>
                    <span className={`text-2xl font-bold font-mono ${
                      isOutOfStock ? "text-rose-400" : "text-emerald-400"
                    }`}>
                      {availableStock}
                      <span className="text-xs font-normal text-zinc-400 ml-1">pcs</span>
                    </span>
                  </div>
                </div>

                {isOutOfStock && (
                  <div className="mt-3 pt-3 border-t border-rose-500/20 flex items-center gap-2 text-xs text-rose-400">
                    <AlertTriangle size={15} />
                    <span>This product currently has 0 available units. You cannot record stock out until stock is received.</span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="border-t border-zinc-800/80 my-4" />

          {/* Section 2: Outgoing Details */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-zinc-200 uppercase tracking-wide">
              Outgoing Details
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Quantity */}
              <div>
                <label className="text-xs text-zinc-300 font-medium flex items-center gap-1 mb-1.5">
                  Quantity to Remove <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    max={selectedProduct ? availableStock : undefined}
                    placeholder="Enter units (e.g. 5)"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    disabled={isOutOfStock}
                    className={`w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border text-base font-bold font-mono focus:outline-hidden ${
                      isExceedingStock
                        ? "border-rose-500 text-rose-400 focus:border-rose-500"
                        : "border-zinc-700 text-rose-400 focus:border-rose-500"
                    }`}
                    required
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-medium text-zinc-500">
                    pcs
                  </span>
                </div>

                {/* Exceeding warning */}
                {isExceedingStock && (
                  <p className="text-xs text-rose-400 mt-1.5 flex items-center gap-1">
                    <AlertCircle size={13} />
                    Requested ({parsedQty}) exceeds available stock ({availableStock}).
                  </p>
                )}
              </div>

              {/* Stock Out Reason */}
              <div>
                <label className="text-xs text-zinc-300 font-medium mb-1.5 block">
                  Stock Out Reason <span className="text-rose-400">*</span>
                </label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:outline-hidden focus:border-rose-500"
                  required
                >
                  {STOCK_OUT_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Reference ID & Given To */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-zinc-400 font-medium flex items-center gap-1 mb-1.5">
                  <FileText size={13} /> Shopify Order ID / Reference (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. #UR-1088"
                  value={referenceId}
                  onChange={(e) => setReferenceId(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-hidden focus:border-rose-500"
                />
              </div>

              <div>
                <label className="text-xs text-zinc-400 font-medium flex items-center gap-1 mb-1.5">
                  <User size={13} /> Given To / Customer / Staff (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Rahim, Customer Name, Courier..."
                  value={givenTo}
                  onChange={(e) => setGivenTo(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-hidden focus:border-rose-500"
                />
              </div>
            </div>

            {/* Transaction Date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-zinc-400 font-medium flex items-center gap-1 mb-1.5">
                  <Calendar size={13} /> Transaction Date
                </label>
                <input
                  type="date"
                  value={transactionDate}
                  onChange={(e) => setTransactionDate(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 focus:outline-hidden focus:border-rose-500"
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="text-xs text-zinc-400 font-medium mb-1.5 block">
                Notes (Optional)
              </label>
              <textarea
                placeholder="Dispatched via Pathao, gifted sample, etc..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-hidden focus:border-rose-500"
              />
            </div>
          </div>

          {/* Submit */}
          <div className="pt-2 flex items-center justify-between">
            <Link
              href="/inventory"
              className="px-4 py-2 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              Cancel
            </Link>

            <button
              type="submit"
              disabled={isSubmitting || isExceedingStock || isOutOfStock || !selectedProduct}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-rose-600 hover:bg-rose-500 shadow-md shadow-rose-950 transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
            >
              {isSubmitting ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <PackageMinus size={16} />
              )}
              <span>Record Stock Out</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

