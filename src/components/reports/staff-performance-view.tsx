"use client";

import { useState, useEffect } from "react";
import {
  Users,
  Trophy,
  PackageCheck,
  Truck,
  ArrowUpDown,
  RotateCw,
  Clock,
  Sparkles,
  Shield,
  Search,
} from "lucide-react";
import { toast } from "sonner";

interface StaffPerformanceRecord {
  name: string;
  role: string;
  packsVerified: number;
  dispatchesCount: number;
  inventoryActions: number;
  followUpsCount: number;
  totalActions: number;
  lastActive: string | null;
}

export function StaffPerformanceView() {
  const [loading, setLoading] = useState(true);
  const [staffList, setStaffList] = useState<StaffPerformanceRecord[]>([]);
  const [search, setSearch] = useState("");

  const fetchStaffPerformance = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/reports/staff-performance");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch staff data");
      setStaffList(data.staff || []);
    } catch (err: any) {
      toast.error(err.message || "Failed to load staff performance");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStaffPerformance();
  }, []);

  const filteredStaff = staffList.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  const topStaff = staffList[0];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-400" />
            Staff Performance & Operations Productivity
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Audit logs and leaderboard across packing, dispatches, inventory movements and customer CRM
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchStaffPerformance}
            disabled={loading}
            className="p-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-xl text-zinc-400 hover:text-zinc-200 transition-colors"
            title="Refresh staff analytics"
          >
            <RotateCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Top Performer Spotlight Card */}
      {topStaff && topStaff.totalActions > 0 && (
        <div className="bg-gradient-to-r from-indigo-950/40 via-purple-950/20 to-zinc-900 border border-indigo-500/30 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
              <Trophy className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono uppercase tracking-wider text-amber-400 font-bold">
                  Top Operations Leader
                </span>
                <span className="px-2 py-0.2 rounded-full text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  {topStaff.role}
                </span>
              </div>
              <h3 className="text-base sm:text-lg font-bold text-white mt-0.5">{topStaff.name}</h3>
              <p className="text-xs text-zinc-400">
                Logged <strong>{topStaff.totalActions} total operations actions</strong> across warehouse stations
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center w-full sm:w-auto">
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl px-3 py-2">
              <div className="text-xs font-bold text-emerald-400">{topStaff.packsVerified}</div>
              <div className="text-[10px] text-zinc-500">Packs</div>
            </div>
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl px-3 py-2">
              <div className="text-xs font-bold text-indigo-400">{topStaff.dispatchesCount}</div>
              <div className="text-[10px] text-zinc-500">Dispatched</div>
            </div>
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl px-3 py-2">
              <div className="text-xs font-bold text-amber-400">{topStaff.inventoryActions}</div>
              <div className="text-[10px] text-zinc-500">Inventory</div>
            </div>
          </div>
        </div>
      )}

      {/* Search Input */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter staff by name..."
          className="w-full pl-9 pr-4 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500"
        />
      </div>

      {/* Performance Table / Mobile Cards */}
      <div className="space-y-3">
        {loading ? (
          <div className="py-16 text-center text-zinc-500 text-xs">
            Loading staff performance metrics...
          </div>
        ) : filteredStaff.length === 0 ? (
          <div className="py-16 text-center text-zinc-500 text-xs bg-zinc-900/20 border border-zinc-800/60 rounded-2xl">
            No staff records found.
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto bg-zinc-950 border border-zinc-800 rounded-2xl">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-800/80 bg-zinc-900/60 text-zinc-400 font-semibold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4">Staff Member</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4 text-center">Packing Verified</th>
                    <th className="py-3 px-4 text-center">Dispatches</th>
                    <th className="py-3 px-4 text-center">Inventory Ops</th>
                    <th className="py-3 px-4 text-center">Follow-ups</th>
                    <th className="py-3 px-4 text-right">Total Activity</th>
                    <th className="py-3 px-4 text-right">Last Active</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/40">
                  {filteredStaff.map((s, idx) => (
                    <tr key={s.name} className="hover:bg-zinc-900/40 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-zinc-800 border border-zinc-700/60 flex items-center justify-center font-bold text-zinc-300 text-xs">
                            {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : idx + 1}
                          </div>
                          <span className="font-bold text-zinc-200">{s.name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-800 text-zinc-300 border border-zinc-700/60 capitalize">
                          {s.role}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center font-semibold text-emerald-400">
                        {s.packsVerified}
                      </td>
                      <td className="py-3 px-4 text-center font-semibold text-indigo-400">
                        {s.dispatchesCount}
                      </td>
                      <td className="py-3 px-4 text-center font-semibold text-amber-400">
                        {s.inventoryActions}
                      </td>
                      <td className="py-3 px-4 text-center font-semibold text-purple-400">
                        {s.followUpsCount}
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-zinc-100">
                        {s.totalActions}
                      </td>
                      <td className="py-3 px-4 text-right text-zinc-500 text-[11px]">
                        {s.lastActive
                          ? new Date(s.lastActive).toLocaleDateString("en-BD", {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "Inactive"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards (360px - 430px) */}
            <div className="grid grid-cols-1 gap-2.5 md:hidden">
              {filteredStaff.map((s, idx) => (
                <div
                  key={s.name}
                  className="bg-zinc-950 border border-zinc-800 rounded-xl p-3.5 space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-zinc-400 font-mono">#{idx + 1}</span>
                      <span className="font-bold text-zinc-100 text-sm">{s.name}</span>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-zinc-800 text-zinc-300 border border-zinc-700">
                      {s.role}
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-1.5 py-2 border-t border-b border-zinc-800/60 text-center text-xs">
                    <div>
                      <div className="text-[9px] text-zinc-500 uppercase">Packs</div>
                      <div className="font-bold text-emerald-400">{s.packsVerified}</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-zinc-500 uppercase">Dispatch</div>
                      <div className="font-bold text-indigo-400">{s.dispatchesCount}</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-zinc-500 uppercase">Inventory</div>
                      <div className="font-bold text-amber-400">{s.inventoryActions}</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-zinc-500 uppercase">Total</div>
                      <div className="font-bold text-zinc-100">{s.totalActions}</div>
                    </div>
                  </div>

                  <div className="text-[10px] text-zinc-500 flex items-center justify-between">
                    <span>Last active</span>
                    <span>
                      {s.lastActive
                        ? new Date(s.lastActive).toLocaleDateString()
                        : "No recent activity"}
                    </span>
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

