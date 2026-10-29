"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  PackagePlus,
  Boxes,
  Tag,
  Hash,
  Layers,
  User,
  FileText,
  DollarSign,
  Calendar,
  AlertCircle,
  Check,
  Search,
  Plus,
  Loader2,
  ArrowLeft,
  X,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import type { InventorySourceCategory, ProductStockSummary } from "@/types/inventory";

interface StockInFormProps {
  categories: InventorySourceCategory[];
  initialProductId?: string;
  initialProductName?: string;
  currentUserFullName?: string;
}

export function StockInForm({
  categories,
  initialProductId,
  initialProductName,
  currentUserFullName,
}: StockInFormProps) {
  const router = useRouter();

  // Form State
  const [selectedProduct, setSelectedProduct] = useState<ProductStockSummary | null>(null);
  const [productSearch, setProductSearch] = useState(initialProductName || "");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<ProductStockSummary[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isCreatingNew, setIsCreatingNew] = useState(false);

  // Input Fields
  const [sku, setSku] = useState("");
  const [styleCode, setStyleCode] = useState("");
  const [quantity, setQuantity] = useState("");
  const [sourceCategoryId, setSourceCategoryId] = useState("");
  const [broughtBy, setBroughtBy] = useState("");
  const [receivedBy, setReceivedBy] = useState(currentUserFullName || "");
  const [referenceId, setReferenceId] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [totalCost, setTotalCost] = useState("");
  const [transactionDate, setTransactionDate] = useState(() => {
    const now = new Date();
    // format to YYYY-MM-DD
    return now.toISOString().slice(0, 10);
  });
  const [notes, setNotes] = useState("");

  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<{
    warning: string;
    existingProduct: any;
  } | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);

  // If initialProductId was passed in URL query
  useEffect(() => {
    if (initialProductId) {
      fetch(`/api/inventory/products/${initialProductId}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.product) {
            setSelectedProduct(data.product);
            setProductSearch(data.product.product_name);
            setSku(data.product.sku || "");
            setStyleCode(data.product.style_code || "");
            setIsCreatingNew(false);
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

    if (!productSearch.trim() || isCreatingNew) {
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
  }, [productSearch, selectedProduct, isCreatingNew]);

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

  // Auto-calculate Total Cost when Unit Cost or Quantity changes
  const handleUnitCostChange = (val: string) => {
    setUnitCost(val);
    const u = parseFloat(val);
    const q = parseInt(quantity, 10);
    if (!isNaN(u) && !isNaN(q) && q > 0) {
      setTotalCost((u * q).toFixed(2));
    }
  };

  const handleQuantityChange = (val: string) => {
    setQuantity(val);
    const q = parseInt(val, 10);
    const u = parseFloat(unitCost);
    if (!isNaN(u) && !isNaN(q) && q > 0) {
      setTotalCost((u * q).toFixed(2));
    }
  };

  const handleSelectProduct = (prod: ProductStockSummary) => {
    setSelectedProduct(prod);
    setProductSearch(prod.product_name);
    setSku(prod.sku || "");
    setStyleCode(prod.style_code || "");
    setIsCreatingNew(false);
    setShowDropdown(false);
  };

  const handleStartCreateNew = () => {
    setSelectedProduct(null);
    setIsCreatingNew(true);
    setShowDropdown(false);
  };

  const handleSubmit = async (e: React.FormEvent, forceCreate = false) => {
    e.preventDefault();

    const trimmedName = productSearch.trim();
    if (!trimmedName) {
      toast.error("Please specify a Product Name");
      return;
    }

    const parsedQty = parseInt(quantity, 10);
    if (isNaN(parsedQty) || parsedQty <= 0) {
      toast.error("Quantity must be a positive integer");
      return;
    }

    setIsSubmitting(true);
    setDuplicateWarning(null);

    try {
      const payload: Record<string, any> = {
        product_id: selectedProduct?.id || undefined,
        product_name: trimmedName,
        sku: sku.trim() || undefined,
        style_code: styleCode.trim() || undefined,
        quantity: parsedQty,
        source_category_id: sourceCategoryId || undefined,
        brought_by: broughtBy.trim() || undefined,
        received_by: receivedBy.trim() || undefined,
        reference_id: referenceId.trim() || undefined,
        unit_cost: unitCost ? parseFloat(unitCost) : undefined,
        total_cost: totalCost ? parseFloat(totalCost) : undefined,
        transaction_date: transactionDate ? new Date(transactionDate).toISOString() : undefined,
        notes: notes.trim() || undefined,
        idempotency_key: idempotencyKey,
      };

      const res = await fetch("/api/inventory/stock-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to record stock in");
      }

      toast.success(data.message || `Added ${parsedQty} units of ${trimmedName}!`, {
        description: `TXN: ${data.transaction?.transaction_number}. Available: ${data.product?.current_stock} pcs.`,
      });

      // Reset form
      setQuantity("");
      setReferenceId("");
      setNotes("");
      setUnitCost("");
      setTotalCost("");
      setBroughtBy("");

      // Redirect or let staff choose
      setIdempotencyKey(crypto.randomUUID());
      router.push("/inventory");
    } catch (err: any) {
      toast.error(err.message || "Failed to submit Stock In");
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
              <PackagePlus className="text-emerald-400" size={22} />
              Stock In — Incoming Product Entry
            </h1>
            <p className="text-xs text-zinc-400 mt-0.5">
              Record incoming stock from showroom, supplier, local market, or new production
            </p>
          </div>
        </div>
      </div>

      {/* Form Card */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl">
        <form onSubmit={(e) => handleSubmit(e, false)} className="space-y-6">
          
          {/* Section 1: Product Selection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-zinc-200 uppercase tracking-wide flex items-center gap-1.5">
                <Boxes size={14} className="text-indigo-400" />
                Product Information <span className="text-emerald-400">*</span>
              </label>

              {selectedProduct ? (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedProduct(null);
                    setProductSearch("");
                    setSku("");
                    setStyleCode("");
                  }}
                  className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                >
                  <X size={12} /> Clear Selected Product
                </button>
              ) : isCreatingNew ? (
                <button
                  type="button"
                  onClick={() => setIsCreatingNew(false)}
                  className="text-xs text-indigo-400 hover:text-indigo-300"
                >
                  Search Existing Products
                </button>
              ) : null}
            </div>

            {/* Product Search & Dropdown Container */}
            <div className="relative" ref={dropdownRef}>
              <div className="relative">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Search existing product by name, SKU, style code, or type a new product name..."
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
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-zinc-950 border border-zinc-700/80 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  required
                />
                {isSearching && (
                  <Loader2 size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 animate-spin" />
                )}
              </div>

              {/* Autocomplete Dropdown */}
              {showDropdown && (
                <div className="absolute left-0 right-0 top-full mt-1.5 z-30 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden max-h-60 overflow-y-auto divide-y divide-zinc-800">
                  {searchResults.map((p) => (
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
                        <span className="px-2 py-0.5 rounded text-[11px] font-bold text-indigo-300 bg-indigo-500/10 border border-indigo-500/20">
                          {p.current_stock || 0} in stock
                        </span>
                      </div>
                    </div>
                  ))}

                  {/* Option to create new product with this name */}
                  <div
                    onClick={handleStartCreateNew}
                    className="p-3 bg-zinc-950/80 hover:bg-indigo-950/30 text-indigo-300 hover:text-indigo-200 cursor-pointer flex items-center gap-2 text-xs font-medium"
                  >
                    <Plus size={14} />
                    <span>Create new product: &ldquo;{productSearch}&rdquo;</span>
                  </div>
                </div>
              )}
            </div>

            {/* Selected Product Banner */}
            {selectedProduct && (
              <div className="p-3 rounded-xl bg-indigo-950/20 border border-indigo-500/25 flex items-center justify-between">
                <div>
                  <p className="text-xs text-indigo-300 font-medium">Selected Existing Product</p>
                  <p className="text-sm font-bold text-white mt-0.5">{selectedProduct.product_name}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-zinc-400">Current Stock</p>
                  <p className="text-sm font-bold text-indigo-200">{selectedProduct.current_stock || 0} pcs</p>
                </div>
              </div>
            )}

            {/* Optional SKU & Style Code inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="text-xs text-zinc-400 font-medium flex items-center gap-1 mb-1.5">
                  <Tag size={13} /> SKU (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. UR-KT-BLK-L"
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs text-zinc-400 font-medium flex items-center gap-1 mb-1.5">
                  <Hash size={13} /> Style Code (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. KT-2026"
                  value={styleCode}
                  onChange={(e) => setStyleCode(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-hidden focus:border-indigo-500"
                />
              </div>
            </div>
          </div>

          <div className="border-t border-zinc-800/80 my-4" />

          {/* Section 2: Quantity & Source */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-zinc-200 uppercase tracking-wide">
              Stock In Details
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Quantity */}
              <div>
                <label className="text-xs text-zinc-300 font-medium flex items-center gap-1 mb-1.5">
                  Quantity Received <span className="text-emerald-400">*</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    placeholder="Enter units received (e.g. 20)"
                    value={quantity}
                    onChange={(e) => handleQuantityChange(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-700 text-base font-bold text-emerald-400 placeholder:text-zinc-600 focus:outline-hidden focus:border-emerald-500"
                    required
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-medium text-zinc-500">
                    pcs
                  </span>
                </div>
              </div>

              {/* Source Category */}
              <div>
                <label className="text-xs text-zinc-300 font-medium flex items-center gap-1 mb-1.5">
                  <Layers size={13} /> Source Category (Optional)
                </label>
                <select
                  value={sourceCategoryId}
                  onChange={(e) => setSourceCategoryId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:outline-hidden focus:border-indigo-500"
                >
                  <option value="">-- Select Source Category --</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Brought By & Reference ID */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-zinc-400 font-medium flex items-center gap-1 mb-1.5">
                  <User size={13} /> Brought By / Carrier (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Rahim, Supplier agent..."
                  value={broughtBy}
                  onChange={(e) => setBroughtBy(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs text-zinc-400 font-medium flex items-center gap-1 mb-1.5">
                  <FileText size={13} /> Order / Reference ID (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. #UR-1025 or PO-9921"
                  value={referenceId}
                  onChange={(e) => setReferenceId(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-hidden focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Pricing Section (Optional) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-xs text-zinc-400 font-medium flex items-center gap-1 mb-1.5">
                  <DollarSign size={13} /> Unit Cost (BDT)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={unitCost}
                  onChange={(e) => handleUnitCostChange(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs text-zinc-400 font-medium flex items-center gap-1 mb-1.5">
                  Total Cost (BDT, Auto)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={totalCost}
                  onChange={(e) => setTotalCost(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-mono text-emerald-400 placeholder:text-zinc-600 focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs text-zinc-400 font-medium flex items-center gap-1 mb-1.5">
                  <Calendar size={13} /> Transaction Date
                </label>
                <input
                  type="date"
                  value={transactionDate}
                  onChange={(e) => setTransactionDate(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 focus:outline-hidden focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="text-xs text-zinc-400 font-medium mb-1.5 block">
                Notes (Optional)
              </label>
              <textarea
                placeholder="Purchased from local market, batch #2, etc..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-hidden focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Submit Buttons */}
          <div className="pt-2 flex items-center justify-between">
            <Link
              href="/inventory"
              className="px-4 py-2 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              Cancel
            </Link>

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 shadow-md shadow-emerald-950 transition-all active:scale-95 disabled:opacity-50"
            >
              {isSubmitting ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <PackagePlus size={16} />
              )}
              <span>Record Stock In</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

