"use client";

import { useState } from "react";
import {
  Plus,
  Wallet,
  TrendingUp,
  TrendingDown,
  ArrowDownRight,
  ArrowUpRight,
  Search,
  FileText,
  Trash2,
  Calendar,
  Edit3,
  X,
  ExternalLink,
  Building2,
} from "lucide-react";
import { Transaction } from "@/types/database";
import { addTransaction, updateTransaction, deleteTransaction } from "./actions";
import { toast } from "sonner";
import { CourierReconciliationView } from "@/components/finances/courier-reconciliation-view";

export const EXPENSE_CATEGORIES = [
  "Marketing",
  "Meta Ads",
  "Google Ads",
  "Salary",
  "Rent",
  "Showroom expenses",
  "Courier charges",
  "Packaging",
  "Internet",
  "Electricity",
  "Transport",
  "Miscellaneous",
];

export const INCOME_CATEGORIES = [
  "Budget / Capital Injection",
  "Showroom / Direct Receipt",
  "Prepaid Order Payment",
  "Miscellaneous Income",
];

export const PAYMENT_METHODS = [
  "Cash",
  "Bank Transfer",
  "bKash",
  "Nagad",
  "Card",
  "Other",
];

interface FinancesClientProps {
  transactions: Transaction[];
  totalIncome: number;
  totalExpense: number;
}

export function FinancesClient({
  transactions,
  totalIncome,
  totalExpense,
}: FinancesClientProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [modalType, setModalType] = useState<"income" | "expense">("expense");
  const [modalAmount, setModalAmount] = useState("");
  const [modalDescription, setModalDescription] = useState("");
  const [modalCategory, setModalCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [modalPaymentMethod, setModalPaymentMethod] = useState("Cash");
  const [modalReferenceId, setModalReferenceId] = useState("");
  const [modalReceiptUrl, setModalReceiptUrl] = useState("");
  const [modalDate, setModalDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "income" | "expense">("all");
  const [activeFinanceTab, setActiveFinanceTab] = useState<"general" | "courier">("general");

  const balance = totalIncome - totalExpense;

  const filteredTransactions = transactions.filter((t) => {
    const matchesSearch =
      t.description.toLowerCase().includes(search.toLowerCase()) ||
      (t.category && t.category.toLowerCase().includes(search.toLowerCase())) ||
      (t.reference_id &&
        t.reference_id.toLowerCase().includes(search.toLowerCase()));
    const matchesCat =
      categoryFilter === "all" ||
      (t.category || "Uncategorized") === categoryFilter;
    const matchesType = typeFilter === "all" || t.type === typeFilter;
    return matchesSearch && matchesCat && matchesType;
  });

  const openAddModal = (type: "income" | "expense") => {
    setEditingTx(null);
    setModalType(type);
    setModalAmount("");
    setModalDescription("");
    setModalCategory(
      type === "expense" ? EXPENSE_CATEGORIES[0] : INCOME_CATEGORIES[0]
    );
    setModalPaymentMethod("Cash");
    setModalReferenceId("");
    setModalReceiptUrl("");
    setModalDate(new Date().toISOString().slice(0, 10));
    setIsModalOpen(true);
  };

  const openEditTxModal = (tx: Transaction) => {
    setEditingTx(tx);
    setModalType((tx.type as "income" | "expense") || "expense");
    setModalAmount(String(tx.amount));
    setModalDescription(tx.description);
    setModalCategory(
      tx.category ||
        (tx.type === "expense" ? EXPENSE_CATEGORIES[0] : INCOME_CATEGORIES[0])
    );
    setModalPaymentMethod(tx.payment_method || "Cash");
    setModalReferenceId(tx.reference_id || "");
    setModalReceiptUrl(tx.receipt_url || "");
    setModalDate(tx.date ? new Date(tx.date).toISOString().slice(0, 10) : "");
    setIsModalOpen(true);
  };

  const handleSubmitTransaction = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.append("amount", modalAmount);
      formData.append("description", modalDescription);
      formData.append("category", modalCategory);
      formData.append("type", modalType);
      formData.append("payment_method", modalPaymentMethod);
      formData.append("reference_id", modalReferenceId);
      formData.append("receipt_url", modalReceiptUrl);
      formData.append("date", modalDate);

      const res = editingTx
        ? await updateTransaction({
            id: editingTx.id,
            amount: Number(modalAmount),
            description: modalDescription,
            category: modalCategory,
            date: modalDate,
            payment_method: modalPaymentMethod,
            receipt_url: modalReceiptUrl || null,
            reference_id: modalReferenceId || null,
          })
        : await addTransaction(formData);

      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(
          editingTx
            ? "Transaction updated!"
            : modalType === "income"
            ? "Amount received added!"
            : "Expense added!"
        );
        setIsModalOpen(false);
        setEditingTx(null);
      }
    } catch {
      toast.error("Failed to save transaction");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this transaction?")) return;

    try {
      const res = await deleteTransaction(id);
      if (res.error) toast.error(res.error);
      else toast.success("Transaction deleted");
    } catch {
      toast.error("Failed to delete");
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
            Finances & Settlements
          </h2>
          <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
            Track daily expenses, capital receipts and courier payout reconciliations
          </p>
        </div>
        {activeFinanceTab === "general" && (
          <div className="flex gap-2">
            <button
              onClick={() => openAddModal("income")}
              className="flex items-center gap-1.5 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium transition-colors border border-emerald-500/20"
            >
              <ArrowDownRight size={15} /> Add Received
            </button>
            <button
              onClick={() => openAddModal("expense")}
              className="flex items-center gap-1.5 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium transition-colors border border-rose-500/20"
            >
              <ArrowUpRight size={15} /> Add Expense
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-800 bg-zinc-900/40 rounded-xl p-1 gap-1">
        <button
          onClick={() => setActiveFinanceTab("general")}
          className={`flex-1 sm:flex-initial px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
            activeFinanceTab === "general"
              ? "bg-zinc-800 text-white shadow-sm"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          General Ledger & Expenses
        </button>
        <button
          onClick={() => setActiveFinanceTab("courier")}
          className={`flex-1 sm:flex-initial px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
            activeFinanceTab === "courier"
              ? "bg-indigo-600 text-white shadow-sm"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <Building2 size={13} />
          <span>Courier Payment Reconciliation</span>
        </button>
      </div>

      {activeFinanceTab === "courier" ? (
        <CourierReconciliationView />
      ) : (
        <>
          {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Wallet size={48} className="text-indigo-400" />
          </div>
          <p className="text-xs sm:text-sm font-medium text-zinc-400 mb-1">
            Available Fund Balance
          </p>
          <p className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            ৳ {balance.toLocaleString()}
          </p>
          <p className="text-[11px] text-zinc-500 mt-1">
            Total recorded receipts minus all expenses
          </p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <TrendingUp size={48} className="text-emerald-400" />
          </div>
          <p className="text-xs sm:text-sm font-medium text-zinc-400 mb-1">
            Total Bank/Cash Received
          </p>
          <p className="text-2xl sm:text-3xl font-bold text-emerald-400 tracking-tight">
            ৳ {totalIncome.toLocaleString()}
          </p>
          <p className="text-[11px] text-zinc-500 mt-1">
            From investments, deposits & manual receipts
          </p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <TrendingDown size={48} className="text-rose-400" />
          </div>
          <p className="text-xs sm:text-sm font-medium text-zinc-400 mb-1">
            Total Expenses
          </p>
          <p className="text-2xl sm:text-3xl font-bold text-rose-400 tracking-tight">
            ৳ {totalExpense.toLocaleString()}
          </p>
          <p className="text-[11px] text-zinc-500 mt-1">
            Marketing, salary, rent, packaging, utilities & supplies
          </p>
        </div>
      </div>

      {/* Transactions List */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden flex flex-col">
        <div className="p-4 border-b border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="font-semibold text-zinc-100 flex items-center gap-2">
            <FileText size={18} className="text-indigo-400" /> Financial
            Transactions ({filteredTransactions.length})
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as any)}
              className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200"
            >
              <option value="all">All Types</option>
              <option value="expense">Expenses Only</option>
              <option value="income">Receipts Only</option>
            </select>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200"
            >
              <option value="all">All Categories</option>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
              {INCOME_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search description, category, ref..."
                className="w-full sm:w-64 pl-9 pr-4 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs sm:text-sm text-zinc-200"
              />
            </div>
          </div>
        </div>

        <div className="divide-y divide-zinc-800/60 max-h-[650px] overflow-y-auto">
          {filteredTransactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-zinc-500">
              <FileText size={48} className="mb-2 opacity-20" />
              <p>No transactions found</p>
            </div>
          ) : (
            filteredTransactions.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between p-4 hover:bg-zinc-800/40 transition-colors gap-4"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                      tx.type === "income"
                        ? "bg-emerald-500/10 text-emerald-500"
                        : "bg-rose-500/10 text-rose-500"
                    }`}
                  >
                    {tx.type === "income" ? (
                      <TrendingUp size={18} />
                    ) : (
                      <TrendingDown size={18} />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-zinc-200 truncate">
                      {tx.description}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <span className="text-xs text-zinc-500 flex items-center gap-1">
                        <Calendar size={12} />
                        {new Date(tx.date).toLocaleDateString()}
                      </span>
                      {tx.category && (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700">
                          {tx.category}
                        </span>
                      )}
                      {tx.payment_method && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                          {tx.payment_method}
                        </span>
                      )}
                      {tx.reference_id && (
                        <span className="text-[10px] font-mono text-zinc-400">
                          Ref: {tx.reference_id}
                        </span>
                      )}
                      {tx.receipt_url && (
                        <a
                          href={tx.receipt_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-indigo-400 hover:underline inline-flex items-center gap-0.5"
                        >
                          Receipt <ExternalLink size={10} />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <p
                    className={`font-bold text-sm sm:text-base ${
                      tx.type === "income"
                        ? "text-emerald-400"
                        : "text-rose-400"
                    }`}
                  >
                    {tx.type === "income" ? "+" : "-"} ৳{" "}
                    {Number(tx.amount).toLocaleString()}
                  </p>
                  <button
                    onClick={() => openEditTxModal(tx)}
                    className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                    title="Edit Transaction"
                  >
                    <Edit3 size={15} />
                  </button>
                  <button
                    onClick={() => handleDelete(tx.id)}
                    className="p-2 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                    title="Delete Transaction"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      </>
      )}

      {/* Add / Edit Transaction Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-zinc-800">
              <h3 className="font-bold text-lg text-white">
                {editingTx
                  ? "Edit Transaction"
                  : modalType === "income"
                  ? "Add Received Amount"
                  : "Add Expense"}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-zinc-500 hover:text-zinc-300"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmitTransaction} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">
                    Amount (BDT) *
                  </label>
                  <input
                    type="number"
                    value={modalAmount}
                    onChange={(e) => setModalAmount(e.target.value)}
                    required
                    min="1"
                    step="any"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2 text-sm text-zinc-100"
                    placeholder="e.g. 5000"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">
                    Transaction Date *
                  </label>
                  <input
                    type="date"
                    value={modalDate}
                    onChange={(e) => setModalDate(e.target.value)}
                    required
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2 text-sm text-zinc-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">
                    Category *
                  </label>
                  <select
                    value={modalCategory}
                    onChange={(e) => setModalCategory(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2 text-sm text-zinc-100"
                  >
                    {(modalType === "expense"
                      ? EXPENSE_CATEGORIES
                      : INCOME_CATEGORIES
                    ).map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">
                    Payment Method
                  </label>
                  <select
                    value={modalPaymentMethod}
                    onChange={(e) => setModalPaymentMethod(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2 text-sm text-zinc-100"
                  >
                    {PAYMENT_METHODS.map((pm) => (
                      <option key={pm} value={pm}>
                        {pm}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  Description / Notes *
                </label>
                <input
                  type="text"
                  value={modalDescription}
                  onChange={(e) => setModalDescription(e.target.value)}
                  required
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2 text-sm text-zinc-100"
                  placeholder={
                    modalType === "income"
                      ? "e.g. Office Budget October"
                      : "e.g. Meta Ads Campaign - October"
                  }
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">
                    Reference / Invoice ID
                  </label>
                  <input
                    type="text"
                    value={modalReferenceId}
                    onChange={(e) => setModalReferenceId(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2 text-sm text-zinc-100"
                    placeholder="Optional invoice/trx ID"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">
                    Receipt URL
                  </label>
                  <input
                    type="url"
                    value={modalReceiptUrl}
                    onChange={(e) => setModalReceiptUrl(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2 text-sm text-zinc-100"
                    placeholder="https://..."
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={`w-full py-2.5 rounded-xl text-white font-semibold flex items-center justify-center gap-2 transition-all ${
                    isSubmitting ? "opacity-70 cursor-not-allowed" : ""
                  } ${
                    modalType === "income"
                      ? "bg-emerald-500 hover:bg-emerald-600"
                      : "bg-indigo-500 hover:bg-indigo-600"
                  }`}
                >
                  {isSubmitting ? (
                    "Saving..."
                  ) : (
                    <>
                      <Plus size={18} />
                      {editingTx
                        ? "Save Changes"
                        : `Save ${modalType === "income" ? "Amount" : "Expense"}`}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
