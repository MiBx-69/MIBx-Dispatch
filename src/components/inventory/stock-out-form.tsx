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
  Sparkles,
  Check,
  CheckCircle2,
  PackagePlus,
  BookOpen,
  Tags,
} from "lucide-react";
import { toast } from "sonner";
import type { ProductStockSummary } from "@/types/inventory";

const STOCK_OUT_REASONS = [
  "Online Order",
  "Showroom Sale",
  "Stock Transfer",
  "Office Use / Available in Office",
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

  // Mode: Catalog Product vs Custom / Office Product
  const [isCustomProduct, setIsCustomProduct] = useState(false);
  const [customProductName, setCustomProductName] = useState("");
  const [customSku, setCustomSku] = useState("");
  const [customStyleCode, setCustomStyleCode] = useState("");

  // Selected catalog product
  const [selectedProduct, setSelectedProduct] = useState<ProductStockSummary | null>(null);
  const [productSearch, setProductSearch] = useState(initialProductName || "");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<ProductStockSummary[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);

  // If existing product has 0 or low stock, allow office stock bypass
  const [allowOfficeStock, setAllowOfficeStock] = useState(true);

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
            setIsCustomProduct(false);
          }
        })
        .catch(() => {});
    }
  }, [initialProductId]);

  // Autocomplete search handler
  useEffect(() => {
    if (isCustomProduct) return;

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
  }, [productSearch, selectedProduct, isCustomProduct]);

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
    setIsCustomProduct(false);
  };

  const handleSwitchToCustom = (name?: string) => {
    setIsCustomProduct(true);
    setSelectedProduct(null);
    setShowDropdown(false);
    if (name) {
      setCustomProductName(name);
    } else if (productSearch) {
      setCustomProductName(productSearch);
    }
  };

  const availableStock = selectedProduct?.current_stock || 0;
  const parsedQty = parseInt(quantity, 10);
  const isExceedingStock = !isCustomProduct && selectedProduct !== null && !isNaN(parsedQty) && parsedQty > availableStock;
  const isOutOfStock = !isCustomProduct && selectedProduct !== null && availableStock <= 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isCustomProduct) {
      if (!customProductName.trim()) {
        toast.error("Please enter a custom product name");
        return;
      }
    } else {
      if (!selectedProduct) {
        toast.error("Please select a catalog product or switch to Custom Product mode");
        return;
      }
    }

    if (isNaN(parsedQty) || parsedQty <= 0) {
      toast.error("Quantity must be a positive number greater than 0");
      return;
    }

    if (!isCustomProduct && parsedQty > availableStock && !allowOfficeStock) {
      toast.error(`Cannot stock out ${parsedQty} units. Only ${availableStock} pcs in ledger. Enable 'Available in office' to proceed.`);
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        product_id: isCustomProduct ? undefined : selectedProduct?.id,
        product_name: isCustomProduct ? customProductName.trim() : undefined,
        sku: isCustomProduct ? customSku.trim() || undefined : undefined,
        style_code: isCustomProduct ? customStyleCode.trim() || undefined : undefined,
        is_custom_product: isCustomProduct,
        allow_office_stock: isCustomProduct || allowOfficeStock,
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

      const displayName = isCustomProduct ? customProductName.trim() : selectedProduct?.product_name;
      toast.success(`Stock Out of ${parsedQty} units recorded successfully!`, {
        description: `Product: "${displayName}" • TXN: ${data.transaction?.transaction_number}`,
      });

      setIdempotencyKey(crypto.randomUUID());
      router.push("/inventory/history");
    } catch (err: any) {
      toast.error(err.message || "Failed to record Stock Out");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Top Module Sub-Navigation Bar */}
      <div className="flex flex-wrap items-center gap-1.5 p-1 bg-zinc-900 border border-zinc-800 rounded-2xl w-fit shadow-xs">
        <Link
          href="/inventory"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
        >
          <Boxes size={14} />
          Stock Overview
        </Link>
        <Link
          href="/inventory/history"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
        >
          <BookOpen size={14} />
          Stock Ledger Book
        </Link>
        <Link
          href="/inventory/stock-in"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 transition-colors"
        >
          <PackagePlus size={14} />
          + Stock In Entry
        </Link>
        <Link
          href="/inventory/stock-out"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-rose-600/20 text-rose-300 border border-rose-500/30 shadow-xs"
        >
          <PackageMinus size={14} className="text-rose-400" />
          - Stock Out Entry
        </Link>
        <Link
          href="/inventory/categories"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
        >
          <Tags size={14} />
          Categories
        </Link>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/inventory"
            className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white transition-colors"
            title="Back to Stock Ledger Overview"
          >
            <ArrowLeft size={16} />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
              <PackageMinus className="text-rose-400" size={22} />
              Stock Out — Outgoing Product Entry
            </h1>
            <p className="text-xs text-zinc-400 mt-0.5">
              Record outgoing stock for customer orders, showroom sales, office use, or custom physical items
            </p>
          </div>
        </div>
      </div>

      {/* Form Card */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Section 1: Mode Switcher & Product Selection */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <label className="text-xs font-bold text-zinc-200 uppercase tracking-wide flex items-center gap-1.5">
                <Boxes size={14} className="text-indigo-400" />
                Select Product or Enter Custom Name <span className="text-rose-400">*</span>
              </label>

              {/* Mode Toggle Pills */}
              <div className="flex items-center gap-1 p-1 bg-zinc-950 border border-zinc-800 rounded-xl w-fit">
                <button
                  type="button"
                  onClick={() => {
                    setIsCustomProduct(false);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                    !isCustomProduct
                      ? "bg-zinc-800 text-zinc-100 border border-zinc-700 shadow-xs"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  <Boxes size={13} />
                  Catalog Product
                </button>
                <button
                  type="button"
                  onClick={() => handleSwitchToCustom()}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                    isCustomProduct
                      ? "bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 shadow-xs"
                      : "text-zinc-400 hover:text-indigo-300"
                  }`}
                >
                  <Sparkles size={13} className="text-indigo-400" />
                  Custom / Office Product
                </button>
              </div>
            </div>

            {/* Mode A: Catalog Product Search */}
            {!isCustomProduct ? (
              <div className="space-y-3">
                <div ref={dropdownRef} className="relative">
                  <div className="relative">
                    <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                    <input
                      type="text"
                      placeholder="Search existing product to stock out (by Name, SKU, Style)..."
                      value={productSearch}
                      onChange={(e) => {
                        setProductSearch(e.target.value);
                        if (selectedProduct) setSelectedProduct(null);
                      }}
                      onFocus={() => {
                        if (searchResults.length > 0) setShowDropdown(true);
                      }}
                      className="w-full pl-10 pr-10 py-3 rounded-xl bg-zinc-950 border border-zinc-700/80 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />

                    {isSearching ? (
                      <Loader2 size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin text-zinc-500" />
                    ) : selectedProduct ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedProduct(null);
                          setProductSearch("");
                        }}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                      >
                        <X size={15} />
                      </button>
                    ) : null}
                  </div>

                  {/* Autocomplete Dropdown */}
                  {showDropdown && (
                    <div className="absolute left-0 right-0 mt-2 bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl z-30 max-h-72 overflow-y-auto divide-y divide-zinc-800/60">
                      {searchResults.length > 0 ? (
                        <>
                          <div className="p-2 text-[10px] text-zinc-500 font-semibold uppercase tracking-wider bg-zinc-900/50">
                            Select Catalog Product
                          </div>
                          {searchResults.map((prod) => (
                            <button
                              key={prod.id}
                              type="button"
                              onClick={() => handleSelectProduct(prod)}
                              className="w-full p-3 text-left hover:bg-zinc-800/60 flex items-center justify-between gap-3 transition-colors"
                            >
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-zinc-200 truncate">
                                  {prod.product_name}
                                </p>
                                <div className="flex items-center gap-2 text-xs font-mono text-zinc-400 mt-0.5">
                                  {prod.sku && <span>SKU: {prod.sku}</span>}
                                  {prod.style_code && <span>Style: {prod.style_code}</span>}
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <span
                                  className={`inline-block px-2 py-0.5 rounded text-xs font-mono font-bold ${
                                    prod.current_stock > 0
                                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                      : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                                  }`}
                                >
                                  {prod.current_stock} in stock
                                </span>
                              </div>
                            </button>
                          ))}
                        </>
                      ) : (
                        <div className="p-4 text-center text-xs text-zinc-500">
                          No existing catalog products found matching &ldquo;{productSearch}&rdquo;.
                        </div>
                      )}

                      {/* Quick Custom Switch in Dropdown */}
                      <div className="p-2.5 bg-indigo-950/20 border-t border-zinc-800 flex items-center justify-between">
                        <span className="text-xs text-indigo-300">Item physically available in office?</span>
                        <button
                          type="button"
                          onClick={() => handleSwitchToCustom(productSearch)}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors flex items-center gap-1 shadow-xs"
                        >
                          <Sparkles size={12} />
                          Stock out as Custom Product &rarr;
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Selected Product Card */}
                {selectedProduct && (
                  <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 animate-in fade-in duration-150">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-zinc-100">{selectedProduct.product_name}</p>
                        <span className="text-[10px] uppercase font-bold bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded border border-zinc-700">
                          Catalog Product
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-zinc-400 mt-1">
                        {selectedProduct.sku && (
                          <span className="flex items-center gap-1 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                            <Tag size={11} /> {selectedProduct.sku}
                          </span>
                        )}
                        {selectedProduct.style_code && (
                          <span className="flex items-center gap-1 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                            <Hash size={11} /> {selectedProduct.style_code}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="text-[11px] text-zinc-400">Ledger Stock</p>
                      <p
                        className={`text-lg font-bold font-mono ${
                          availableStock > 0 ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {availableStock} pcs
                      </p>
                    </div>
                  </div>
                )}

                {/* Office Stock Checkbox if stock is low or 0 */}
                {selectedProduct && (isExceedingStock || isOutOfStock) && (
                  <div className="p-3.5 rounded-xl bg-amber-950/20 border border-amber-500/30 text-xs space-y-2">
                    <div className="flex items-center gap-2 text-amber-400 font-semibold">
                      <AlertTriangle size={15} />
                      <span>Ledger balance is lower than requested quantity</span>
                    </div>
                    <p className="text-zinc-400 text-[11px]">
                      The system shows <strong>{availableStock} pcs</strong> in the ledger book. If you physically have these units available in your office, check the box below to record the stock out.
                    </p>
                    <label className="flex items-center gap-2 pt-1 cursor-pointer select-none text-zinc-200 font-medium">
                      <input
                        type="checkbox"
                        checked={allowOfficeStock}
                        onChange={(e) => setAllowOfficeStock(e.target.checked)}
                        className="w-4 h-4 rounded bg-zinc-900 border-zinc-700 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span>Item is physically available in office (Auto-credit office stock for this voucher)</span>
                    </label>
                  </div>
                )}
              </div>
            ) : (
              /* Mode B: Custom / Office Product Name */
              <div className="space-y-4 p-4 rounded-xl bg-indigo-950/10 border border-indigo-500/30 animate-in fade-in duration-150">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles size={14} className="text-indigo-400" />
                    Custom Office Stock Out Details
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomProduct(false);
                      setCustomProductName("");
                    }}
                    className="text-xs text-zinc-400 hover:text-zinc-200 underline"
                  >
                    Switch back to catalog
                  </button>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-[11px] text-zinc-300 font-medium block mb-1">
                      Custom Product Name <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Office Sample Shirt, Custom Polo White XL, Promo Bag..."
                      value={customProductName}
                      onChange={(e) => setCustomProductName(e.target.value)}
                      required
                      className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-700/80 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] text-zinc-400 font-medium block mb-1">
                        SKU / Barcode (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. OFF-SMPL-01"
                        value={customSku}
                        onChange={(e) => setCustomSku(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 font-mono placeholder:text-zinc-600 focus:outline-hidden focus:border-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] text-zinc-400 font-medium block mb-1">
                        Style Code (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. STYLE-2026"
                        value={customStyleCode}
                        onChange={(e) => setCustomStyleCode(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 font-mono placeholder:text-zinc-600 focus:outline-hidden focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 p-2.5 rounded-lg bg-zinc-950/80 border border-zinc-800/80 text-[11px] text-zinc-400">
                    <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                    <span>
                      This custom product is physically available in your office. It will be recorded directly into the stock ledger book without requiring prior stock-in!
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Section 2: Outgoing Details */}
          <div className="space-y-4 pt-2 border-t border-zinc-800">
            <h3 className="text-xs font-bold text-zinc-200 uppercase tracking-wide">
              Outgoing Details
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Quantity */}
              <div>
                <label className="text-xs text-zinc-300 font-medium block mb-1">
                  Quantity to Stock Out <span className="text-rose-400">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  placeholder="e.g. 5"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-700/80 text-sm font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {/* Reason */}
              <div>
                <label className="text-xs text-zinc-300 font-medium block mb-1">
                  Stock Out Reason <span className="text-rose-400">*</span>
                </label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-700/80 text-xs text-zinc-200 focus:outline-hidden focus:border-indigo-500"
                >
                  {STOCK_OUT_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              {/* Reference ID */}
              <div>
                <label className="text-xs text-zinc-300 font-medium block mb-1">
                  Reference / Order ID (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. #2164 or SHOWROOM-092"
                  value={referenceId}
                  onChange={(e) => setReferenceId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-700/80 text-xs font-mono text-zinc-200 placeholder:text-zinc-600 focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              {/* Given To / Recipient */}
              <div>
                <label className="text-xs text-zinc-300 font-medium block mb-1">
                  Given To / Customer / Staff (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Customer Name, Delivery Staff, Showroom"
                  value={givenTo}
                  onChange={(e) => setGivenTo(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-700/80 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              {/* Transaction Date */}
              <div>
                <label className="text-xs text-zinc-300 font-medium block mb-1">
                  Transaction Date
                </label>
                <input
                  type="date"
                  value={transactionDate}
                  onChange={(e) => setTransactionDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-700/80 text-xs text-zinc-200 focus:outline-hidden focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="text-xs text-zinc-300 font-medium block mb-1">
                Notes &amp; Remarks (Optional)
              </label>
              <textarea
                rows={2}
                placeholder="Additional notes about this outgoing stock..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-700/80 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-hidden focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Form Actions */}
          <div className="pt-4 border-t border-zinc-800 flex items-center justify-end gap-3">
            <Link
              href="/inventory"
              className="px-4 py-2.5 rounded-xl text-xs font-medium text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 transition-colors"
            >
              Cancel
            </Link>

            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 shadow-md shadow-rose-950 transition-all flex items-center gap-1.5 active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Recording Stock Out...
                </>
              ) : (
                <>
                  <PackageMinus size={14} />
                  Record Stock Out {parsedQty > 0 ? `(-${parsedQty} pcs)` : ""}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
