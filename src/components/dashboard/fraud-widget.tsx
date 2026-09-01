"use client";

import { ShieldCheck, ShieldAlert, AlertTriangle } from "lucide-react";

export function FraudWidget({ stats }: { stats: { safe: number, risky: number, fraud: number } }) {
  const total = stats.safe + stats.risky + stats.fraud || 1; // Avoid divide by zero
  
  const safePct = Math.round((stats.safe / total) * 100) || 0;
  const riskyPct = Math.round((stats.risky / total) * 100) || 0;
  const fraudPct = Math.round((stats.fraud / total) * 100) || 0;

  return (
    <div className="flex flex-col h-full space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-zinc-400 text-sm font-medium">FraudSpy Analytics</h3>
        <span className="px-2 py-1 bg-zinc-800 text-zinc-300 rounded-full text-[10px] font-semibold">
          {stats.safe + stats.risky + stats.fraud} orders scanned
        </span>
      </div>

      {/* Progress Bar */}
      <div className="w-full h-3 bg-zinc-800 rounded-full overflow-hidden flex">
        <div style={{ width: `${safePct}%` }} className="bg-emerald-500 h-full"></div>
        <div style={{ width: `${riskyPct}%` }} className="bg-amber-500 h-full"></div>
        <div style={{ width: `${fraudPct}%` }} className="bg-red-500 h-full"></div>
      </div>

      {/* Legends */}
      <div className="grid grid-cols-3 gap-2 flex-1">
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 flex flex-col justify-center items-center text-center">
          <ShieldCheck className="w-5 h-5 text-emerald-400 mb-1" />
          <p className="text-xs text-emerald-500 font-medium uppercase">Safe</p>
          <p className="text-xl font-bold text-emerald-400 mt-1">{stats.safe}</p>
          <p className="text-[10px] text-emerald-600/80">{safePct}%</p>
        </div>
        
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex flex-col justify-center items-center text-center">
          <AlertTriangle className="w-5 h-5 text-amber-400 mb-1" />
          <p className="text-xs text-amber-500 font-medium uppercase">Risky</p>
          <p className="text-xl font-bold text-amber-400 mt-1">{stats.risky}</p>
          <p className="text-[10px] text-amber-600/80">{riskyPct}%</p>
        </div>

        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex flex-col justify-center items-center text-center">
          <ShieldAlert className="w-5 h-5 text-red-400 mb-1" />
          <p className="text-xs text-red-500 font-medium uppercase">Fraud</p>
          <p className="text-xl font-bold text-red-400 mt-1">{stats.fraud}</p>
          <p className="text-[10px] text-red-600/80">{fraudPct}%</p>
        </div>
      </div>
    </div>
  );
}
