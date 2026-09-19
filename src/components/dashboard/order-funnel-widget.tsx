"use client";

import { CheckCircle, Clock, Package, Truck } from "lucide-react";
import Link from "next/link";

interface FunnelStats {
  pending: number;
  preparing: number;
  dispatched: number;
  delivered: number;
}

export function OrderFunnelWidget({ stats }: { stats: FunnelStats }) {
  const maxVal = Math.max(stats.pending, stats.preparing, stats.dispatched, stats.delivered, 1);
  const getWidth = (val: number) => `${Math.max((val / maxVal) * 100, 5)}%`;

  const steps = [
    { id: 'pending', label: 'Pending', value: stats.pending, icon: Clock, color: 'bg-zinc-500', text: 'text-zinc-400', href: '/orders?status=pending' },
    { id: 'preparing', label: 'Preparing', value: stats.preparing, icon: Package, color: 'bg-amber-500', text: 'text-amber-400', href: '/orders?status=preparing' },
    { id: 'dispatched', label: 'Dispatched', value: stats.dispatched, icon: Truck, color: 'bg-indigo-500', text: 'text-indigo-400', href: '/dispatches' },
    { id: 'delivered', label: 'Delivered', value: stats.delivered, icon: CheckCircle, color: 'bg-emerald-500', text: 'text-emerald-400', href: '/orders?status=delivered' },
  ];

  return (
    <div className="rounded-2xl p-5 border border-zinc-800/50 bg-gradient-to-b from-zinc-900 to-zinc-950/80 shadow-xl h-full flex flex-col">
      <div className="mb-6">
        <h2 className="text-sm font-semibold text-zinc-200">Fulfillment Pipeline</h2>
        <p className="text-xs text-zinc-500 mt-1">Real-time order flow tracking</p>
      </div>

      <div className="flex-1 flex flex-col justify-center space-y-6">
        {steps.map((step, index) => (
          <Link key={step.id} href={step.href} className="block group">
            <div className="relative">
              {/* Connector Line */}
              {index !== steps.length - 1 && (
                <div className="absolute left-4 top-8 bottom-[-24px] w-0.5 bg-zinc-800/50 group-hover:bg-zinc-700 transition-colors z-0" />
              )}
              
              <div className="flex items-center gap-4 relative z-10">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center bg-zinc-900 border-2 border-zinc-800 group-hover:border-zinc-600 transition-colors shrink-0 shadow-lg`}>
                  <step.icon className={`w-4 h-4 ${step.text} group-hover:scale-110 transition-transform`} />
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-end mb-1.5">
                    <span className="text-xs font-medium text-zinc-300 group-hover:text-white transition-colors">
                      {step.label}
                    </span>
                    <span className={`text-sm font-bold ${step.text}`}>
                      {step.value}
                    </span>
                  </div>
                  
                  {/* Progress Bar Visual */}
                  <div className="h-2 w-full bg-zinc-950 rounded-full overflow-hidden border border-zinc-800/50 shadow-inner">
                    <div 
                      className={`h-full ${step.color} rounded-full transition-all duration-1000 ease-out`}
                      style={{ width: getWidth(step.value) }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
