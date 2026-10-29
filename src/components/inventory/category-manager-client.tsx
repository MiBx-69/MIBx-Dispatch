"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Tags,
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  Edit2,
  ArrowLeft,
  Loader2,
  Boxes,
  ShieldCheck,
  ShieldAlert,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { InventorySourceCategory } from "@/types/inventory";

interface CategoryManagerClientProps {
  categories: InventorySourceCategory[];
  isAdmin: boolean;
}

export function CategoryManagerClient({
  categories: initialCategories,
  isAdmin,
}: CategoryManagerClientProps) {
  const router = useRouter();
  const [categories, setCategories] = useState(initialCategories);
  const [search, setSearch] = useState("");

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<InventorySourceCategory | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filtered = categories.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.description && c.description.toLowerCase().includes(search.toLowerCase()))
  );

  const handleOpenCreate = () => {
    setEditingCategory(null);
    setName("");
    setDescription("");
    setIsActive(true);
    setModalOpen(true);
  };

  const handleOpenEdit = (cat: InventorySourceCategory) => {
    setEditingCategory(cat);
    setName(cat.name);
    setDescription(cat.description || "");
    setIsActive(cat.is_active);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Category name is required");
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingCategory) {
        // Edit category
        const res = await fetch("/api/inventory/categories", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editingCategory.id,
            name: name.trim(),
            description: description.trim() || null,
            is_active: isActive,
          }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to update category");

        setCategories((prev) =>
          prev.map((c) => (c.id === editingCategory.id ? data.category : c))
        );
        toast.success("Category updated successfully");
      } else {
        // Create new category
        const res = await fetch("/api/inventory/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim() || null,
          }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to create category");

        setCategories((prev) => [data.category, ...prev]);
        toast.success("Category created successfully");
      }

      setModalOpen(false);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to save category");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (cat: InventorySourceCategory) => {
    if (!isAdmin) {
      toast.error("Only administrators can activate/deactivate categories");
      return;
    }

    try {
      const res = await fetch("/api/inventory/categories", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: cat.id,
          is_active: !cat.is_active,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to toggle status");

      setCategories((prev) =>
        prev.map((c) => (c.id === cat.id ? data.category : c))
      );
      toast.success(
        `Category "${cat.name}" is now ${!cat.is_active ? "active" : "deactivated"}`
      );
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Could not toggle category status");
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
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
              <Tags className="text-indigo-400" size={24} />
              Source Categories
            </h1>
            <p className="text-xs text-zinc-400 mt-0.5">
              Manage product source channels (Showroom, Supplier, Market, New Arrival, etc.)
            </p>
          </div>
        </div>

        {isAdmin && (
          <button
            onClick={handleOpenCreate}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 shadow-sm transition-all"
          >
            <Plus size={15} />
            Add New Category
          </button>
        )}
      </div>

      {/* Admin Notice if not admin */}
      {!isAdmin && (
        <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800 text-xs text-zinc-400 flex items-center gap-2">
          <ShieldAlert size={16} className="text-amber-400 shrink-0" />
          <span>You are viewing categories in read-only mode. Creating or modifying categories requires Administrator privileges.</span>
        </div>
      )}

      {/* Main List Card */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xs">
        {/* Search */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between gap-3">
          <div className="relative w-full sm:w-72">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Search categories..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-hidden focus:border-indigo-500"
            />
          </div>

          <span className="text-xs text-zinc-500">
            {filtered.length} categories
          </span>
        </div>

        {/* Categories List */}
        <div className="divide-y divide-zinc-800/60">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-zinc-500 text-xs">
              No categories found.
            </div>
          ) : (
            filtered.map((cat) => (
              <div
                key={cat.id}
                className="p-4 flex items-center justify-between gap-4 hover:bg-zinc-800/30 transition-colors"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-zinc-100">{cat.name}</h3>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.2 rounded-full text-[10px] font-medium ${
                        cat.is_active
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : "bg-zinc-800 text-zinc-500 border border-zinc-700"
                      }`}
                    >
                      {cat.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  {cat.description && (
                    <p className="text-xs text-zinc-400 truncate max-w-xl">
                      {cat.description}
                    </p>
                  )}
                </div>

                {isAdmin && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleToggleStatus(cat)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                        cat.is_active
                          ? "bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-zinc-400 hover:text-zinc-200"
                          : "bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/25 text-emerald-400"
                      }`}
                      title={cat.is_active ? "Deactivate category" : "Activate category"}
                    >
                      {cat.is_active ? "Deactivate" : "Activate"}
                    </button>

                    <button
                      onClick={() => handleOpenEdit(cat)}
                      className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                      title="Edit Category"
                    >
                      <Edit2 size={15} />
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Create / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/75 backdrop-blur-xs" onClick={() => setModalOpen(false)} />
          <div className="relative bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                <Tags size={18} className="text-indigo-400" />
                {editingCategory ? "Edit Source Category" : "New Source Category"}
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">
                  Category Name <span className="text-indigo-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Showroom, Factory, Supplier..."
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-700 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-hidden focus:border-indigo-500"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300">
                  Description (Optional)
                </label>
                <textarea
                  placeholder="Short explanation of this stock source..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-700 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              {editingCategory && (
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-zinc-300">Active Status</span>
                  <button
                    type="button"
                    onClick={() => setIsActive(!isActive)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${
                      isActive
                        ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400"
                        : "bg-zinc-800 border-zinc-700 text-zinc-400"
                    }`}
                  >
                    {isActive ? "Active" : "Inactive"}
                  </button>
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-zinc-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isSubmitting && <Loader2 size={13} className="animate-spin" />}
                  {editingCategory ? "Update Category" : "Create Category"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

