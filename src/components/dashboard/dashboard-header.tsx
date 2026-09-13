"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import { Calendar } from "lucide-react";

export function DashboardHeader() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [dateFilter, setDateFilter] = useState("this_month");

  useEffect(() => {
    const filter = searchParams.get("dateFilter");
    if (filter) {
      setDateFilter(filter);
    } else {
      setDateFilter("this_month");
    }
  }, [searchParams]);

  const handleFilterChange = (val: string) => {
    setDateFilter(val);
    const params = new URLSearchParams(searchParams.toString());
    params.set("dateFilter", val);
    router.push(`/?${params.toString()}`);
  };

  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Dashboard Overview</h1>
        <p className="text-sm text-zinc-400 mt-1">Key metrics and reporting across your operations.</p>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative">
          <select
            value={dateFilter}
            onChange={(e) => handleFilterChange(e.target.value)}
            className="pl-9 pr-4 py-2 bg-zinc-900 border border-zinc-700 text-zinc-200 text-sm rounded-lg outline-none focus:border-indigo-500 transition-colors appearance-none"
          >
            <option value="this_month">This Month (Default)</option>
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="last_7_days">Last 7 Days</option>
            <option value="last_30_days">Last 30 Days</option>
          </select>
          <Calendar className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      </div>
    </div>
  );
}
