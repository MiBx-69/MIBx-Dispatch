"use client";

import { useState, useEffect } from "react";
import {
  Truck,
  DollarSign,
  AlertCircle,
  CheckCircle2,
  Clock,
  Search,
  Filter,
  RefreshCw,
  Calendar,
  ExternalLink,
  ChevronDown,
  ArrowUpDown,
  Building2,
} from "lucide-react";
import { toast } from "sonner";

interface SettlementSummary {
  expectedCod: number;
  collectedCod: number;
  deliveryCharges: number;
  returnCharges: number;
  otherDeductions: number;
  netPayable: number;
  actualReceived: number;
  outstanding: number;
  discrepancyCount: number;
  discrepancyAmount: number;
  totalParcels: number;
  deliveredParcels: number;
  returnedParcels: number;
}

interface SettlementParcel {
  dispatch_id: string;
  order_id: string;
  order_name: string;
  customer_name: string;
  customer_phone: string;
  consignment_id: string;
  status: string;
  dispatched_at: string;
  expected_cod: number;
  collected_cod: number;
  delivery_fee: number;
  return_charge: number;
  other_deductions: number;
  net_payable: number;
  actual_received: number;
  discrepancy: number;
  settlement_status: "settled" | "pending" | "partial" | "discrepancy";
  invoice_id?: string;
}

export function CourierReconciliationView() {
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState("this_month");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [data, setData] = useState<{
    summary: SettlementSummary;
    parcels: SettlementParcel[];
    batches: any[];
  } | null>(null);

  const fetchSettlements = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        dateFilter,
        status: statusFilter,
      });
      if (search.trim()) params.set("search", search.trim());

      const res = await fetch(`/api/settlements?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load settlement data");
      setData(json);
    } catch (err: any) {
      toast.error(err.message || "Failed to fetch settlements");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettlements();
  }, [dateFilter, statusFilter]);

  const summary = data?.summary || {
    expectedCod: 0,
    collectedCod: 0,
    deliveryCharges: 0,
    returnCharges: 0,
    otherDeductions: 0,
    netPayable: 0,
    actualReceived: 0,
    outstanding: 0,
    discrepancyCount: 0,
    discrepancyAmount: 0,
    totalParcels: 0,
    deliveredParcels: 0,
    returnedParcels: 0,
  };

  const parcels = data?.parcels || [];
  const filteredParcels = search.trim()
    ? parcels.filter(
        (p) =>
          p.order_name?.toLowerCase().includes(search.toLowerCase()) ||
          p.consignment_id?.toLowerCase().includes(search.toLowerCase()) ||
          p.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
          p.customer_phone?.includes(search)
      )
    : parcels;

  return (
    <div className="space-y-6">
      {/* Header & Date Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
            <Truck className="w-5 h-5 text-amber-400" />
            Pathao Courier Payment Reconciliation
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Compare collected COD, delivery deductions, and actual bank settlements received
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
          >
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="this_week">This Week</option>
            <option value="this_month">This Month</option>
            <option value="last_month">Last Month</option>
            <option value="all_time">All Time</option>
          </select>

          <button
            onClick={fetchSettlements}
            disabled={loading}
            className="p-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-xl text-zinc-400 hover:text-zinc-200 transition-colors"
            title="Refresh settlements"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Net Expected Settlement */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-zinc-400 mb-1">
            <span className="text-xs font-medium">Net Expected COD</span>
            <DollarSign className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-xl sm:text-2xl font-bold text-zinc-100">
            ৳{Math.round(summary.netPayable).toLocaleString()}
          </div>
          <div className="text-[11px] text-zinc-500 mt-1">
            After ৳{Math.round(summary.deliveryCharges + summary.returnCharges).toLocaleString()} fees
          </div>
        </div>

        {/* Actual Received Settlement */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-zinc-400 mb-1">
            <span className="text-xs font-medium">Settled to Bank</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl sm:text-2xl font-bold text-emerald-400">
            ৳{Math.round(summary.actualReceived).toLocaleString()}
          </div>
          <div className="text-[11px] text-zinc-500 mt-1">
            Received in merchant payouts
          </div>
        </div>

        {/* Pending / Outstanding Settlement */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-zinc-400 mb-1">
            <span className="text-xs font-medium">Pending Payout</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-xl sm:text-2xl font-bold text-amber-400">
            ৳{Math.round(summary.outstanding).toLocaleString()}
          </div>
          <div className="text-[11px] text-zinc-500 mt-1">
            Awaiting Pathao invoice batch
          </div>
        </div>

        {/* Discrepancies */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4">
          <div className="flex items-center justify-between text-zinc-400 mb-1">
            <span className="text-xs font-medium">Reconciliation Flags</span>
            <AlertCircle className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-xl sm:text-2xl font-bold text-rose-400">
            {summary.discrepancyCount}
          </div>
          <div className="text-[11px] text-zinc-500 mt-1">
            ৳{Math.round(summary.discrepancyAmount).toLocaleString()} variance
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-zinc-900/40 p-3 rounded-2xl border border-zinc-800/80">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search consignment, order #, or customer phone..."
            className="w-full pl-9 pr-4 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500 font-mono"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide text-xs">
          {[
            { label: "All Parcels", value: "all" },
            { label: "Pending", value: "pending" },
            { label: "Settled", value: "settled" },
            { label: "Discrepancy", value: "discrepancy" },
          ].map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={`px-3 py-1.5 rounded-xl font-medium whitespace-nowrap transition-colors ${
                statusFilter === tab.value
                  ? "bg-indigo-600 text-white"
                  : "bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Parcels Table / Mobile Cards */}
      <div className="space-y-3">
        {loading ? (
          <div className="py-16 text-center text-zinc-500 text-xs">
            Loading settlement ledger...
          </div>
        ) : filteredParcels.length === 0 ? (
          <div className="py-16 text-center text-zinc-500 text-xs bg-zinc-900/20 border border-zinc-800/60 rounded-2xl">
            No parcels match the selected criteria.
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto bg-zinc-950 border border-zinc-800 rounded-2xl">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-800/80 bg-zinc-900/60 text-zinc-400 font-semibold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4">Order / Consignment</th>
                    <th className="py-3 px-4">Customer</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Collected COD</th>
                    <th className="py-3 px-4 text-right">Courier Fee</th>
                    <th className="py-3 px-4 text-right">Net Payable</th>
                    <th className="py-3 px-4 text-right">Actual Settled</th>
                    <th className="py-3 px-4 text-center">Settlement</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/40">
                  {filteredParcels.map((p) => (
                    <tr key={p.dispatch_id} className="hover:bg-zinc-900/40 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-bold text-zinc-200">{p.order_name}</div>
                        <div className="font-mono text-[11px] text-zinc-400 mt-0.5">
                          {p.consignment_id}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-zinc-300 font-medium truncate max-w-[140px]">
                          {p.customer_name || "N/A"}
                        </div>
                        <div className="text-zinc-500 font-mono text-[11px]">
                          {p.customer_phone || ""}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-zinc-800 text-zinc-300 border border-zinc-700/60">
                          {p.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-medium text-zinc-200">
                        ৳{Math.round(p.collected_cod || 0)}
                      </td>
                      <td className="py-3 px-4 text-right text-zinc-400">
                        ৳{Math.round(p.delivery_fee + (p.return_charge || 0))}
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-indigo-300">
                        ৳{Math.round(p.net_payable || 0)}
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-emerald-400">
                        ৳{Math.round(p.actual_received || 0)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                            p.settlement_status === "settled"
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                              : p.settlement_status === "discrepancy"
                              ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                              : p.settlement_status === "partial"
                              ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                              : "bg-zinc-800 text-zinc-400 border-zinc-700"
                          }`}
                        >
                          {p.settlement_status.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards (360px - 430px first) */}
            <div className="grid grid-cols-1 gap-2.5 md:hidden">
              {filteredParcels.map((p) => (
                <div
                  key={p.dispatch_id}
                  className="bg-zinc-950 border border-zinc-800 rounded-xl p-3.5 space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-bold text-zinc-100 text-sm">{p.order_name}</span>
                      <span className="block font-mono text-[11px] text-zinc-400">
                        {p.consignment_id}
                      </span>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                        p.settlement_status === "settled"
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          : p.settlement_status === "discrepancy"
                          ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                          : "bg-zinc-800 text-zinc-400 border-zinc-700"
                      }`}
                    >
                      {p.settlement_status.toUpperCase()}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 py-2 border-t border-b border-zinc-800/60 text-center text-xs">
                    <div>
                      <div className="text-[10px] text-zinc-500 uppercase">Collected</div>
                      <div className="font-bold text-zinc-200">৳{Math.round(p.collected_cod || 0)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-zinc-500 uppercase">Courier Fee</div>
                      <div className="text-zinc-400">৳{Math.round(p.delivery_fee + (p.return_charge || 0))}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-zinc-500 uppercase">Settled</div>
                      <div className="font-bold text-emerald-400">৳{Math.round(p.actual_received || 0)}</div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-zinc-400 pt-0.5">
                    <span>{p.customer_name || "Guest"}</span>
                    <span className="font-mono text-zinc-500">{p.customer_phone || ""}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
