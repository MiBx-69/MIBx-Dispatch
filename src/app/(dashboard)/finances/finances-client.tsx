"use client";

import { useState } from "react";
import { Plus, Wallet, TrendingUp, TrendingDown, ArrowDownRight, ArrowUpRight, Search, FileText, Trash2, Calendar } from "lucide-react";
import { Transaction } from "@/types/database";
import { addTransaction, deleteTransaction } from "./actions";
import { toast } from "react-hot-toast";

interface FinancesClientProps {
  transactions: Transaction[];
  totalIncome: number;
  totalExpense: number;
}

export function FinancesClient({ transactions, totalIncome, totalExpense }: FinancesClientProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<"income" | "expense">("expense");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [search, setSearch] = useState("");

  const balance = totalIncome - totalExpense;

  const filteredTransactions = transactions.filter(t => 
    t.description.toLowerCase().includes(search.toLowerCase()) ||
    (t.category && t.category.toLowerCase().includes(search.toLowerCase()))
  );

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const formData = new FormData(e.currentTarget);
      formData.append("type", modalType);
      
      const res = await addTransaction(formData);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(modalType === "income" ? "Amount received added!" : "Expense added!");
        setIsModalOpen(false);
      }
    } catch (error) {
      toast.error("Failed to add transaction");
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

  const openModal = (type: "income" | "expense") => {
    setModalType(type);
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Finances & Expenses</h2>
          <p className="text-sm text-zinc-400 mt-1">Track your daily expenses and received funds</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => openModal("income")}
            className="flex items-center gap-2 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 px-4 py-2 rounded-xl text-sm font-semibold transition-colors border border-emerald-500/20"
          >
            <ArrowDownRight size={16} /> Add Received
          </button>
          <button
            onClick={() => openModal("expense")}
            className="flex items-center gap-2 bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 px-4 py-2 rounded-xl text-sm font-semibold transition-colors border border-rose-500/20"
          >
            <ArrowUpRight size={16} /> Add Expense
          </button>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Wallet size={48} className="text-indigo-400" />
          </div>
          <p className="text-sm font-medium text-zinc-400 mb-1">Available Balance</p>
          <p className="text-3xl font-bold text-white tracking-tight">
            ৳ {balance.toLocaleString()}
          </p>
        </div>
        
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <TrendingUp size={48} className="text-emerald-400" />
          </div>
          <p className="text-sm font-medium text-zinc-400 mb-1">Total Received</p>
          <p className="text-3xl font-bold text-emerald-400 tracking-tight">
            ৳ {totalIncome.toLocaleString()}
          </p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <TrendingDown size={48} className="text-rose-400" />
          </div>
          <p className="text-sm font-medium text-zinc-400 mb-1">Total Expenses</p>
          <p className="text-3xl font-bold text-rose-400 tracking-tight">
            ৳ {totalExpense.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Transactions List */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden flex flex-col h-[600px]">
        <div className="p-4 border-b border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h3 className="font-semibold text-zinc-100 flex items-center gap-2">
            <FileText size={18} className="text-indigo-400" /> Recent Transactions
          </h3>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search description..."
              className="w-full sm:w-64 pl-9 pr-4 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {filteredTransactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-zinc-500">
              <FileText size={48} className="mb-2 opacity-20" />
              <p>No transactions found</p>
            </div>
          ) : (
            filteredTransactions.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between p-4 rounded-xl border border-zinc-800/50 bg-zinc-950/50 hover:bg-zinc-800/50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${tx.type === 'income' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                    {tx.type === 'income' ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                  </div>
                  <div>
                    <p className="font-semibold text-zinc-200">{tx.description}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-zinc-500 flex items-center gap-1">
                        <Calendar size={12} />
                        {new Date(tx.date).toLocaleDateString()} {new Date(tx.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {tx.category && (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">
                          {tx.category}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <p className={`font-bold ${tx.type === 'income' ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {tx.type === 'income' ? '+' : '-'} ৳ {tx.amount.toLocaleString()}
                  </p>
                  <button 
                    onClick={() => handleDelete(tx.id)}
                    className="p-2 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Transaction Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-4 border-b border-zinc-800">
              <h3 className="font-bold text-lg text-white">
                {modalType === "income" ? "Add Received Amount" : "Add New Expense"}
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                ✕
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Amount (BDT) *</label>
                <input
                  type="number"
                  name="amount"
                  required
                  min="1"
                  step="any"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-zinc-100 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                  placeholder="e.g. 5000"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Description *</label>
                <input
                  type="text"
                  name="description"
                  required
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-zinc-100 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                  placeholder={modalType === "income" ? "e.g. Office Budget November" : "e.g. Office Snacks"}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Category (Optional)</label>
                <input
                  type="text"
                  name="category"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-zinc-100 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                  placeholder={modalType === "income" ? "e.g. Budget" : "e.g. Food, Transport, Supplies"}
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={`w-full py-2.5 rounded-xl text-white font-semibold flex items-center justify-center gap-2 transition-all
                    ${isSubmitting ? 'opacity-70 cursor-not-allowed' : ''}
                    ${modalType === 'income' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-indigo-500 hover:bg-indigo-600'}
                  `}
                >
                  {isSubmitting ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <Plus size={18} />
                      Save {modalType === 'income' ? 'Amount' : 'Expense'}
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
