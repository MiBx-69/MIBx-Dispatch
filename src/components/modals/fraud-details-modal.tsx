"use client";

import { useEffect, useState } from "react";
import { X, ShieldAlert, ShieldCheck, Shield, AlertTriangle } from "lucide-react";
import type { Order } from "@/types/database";

interface FraudDetailsModalProps {
  order: Order | null;
  onClose: () => void;
  onCheckAgain?: (orderId: string) => void;
  isChecking?: boolean;
}

export function FraudDetailsModal({ order, onClose, onCheckAgain, isChecking }: FraudDetailsModalProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (order) setOpen(true);
    else setOpen(false);
  }, [order]);

  if (!order || !open) return null;

  const handleClose = () => {
    setOpen(false);
    setTimeout(onClose, 200);
  };

  const fraudData = order.fraud_data as any;

  if (!fraudData) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-0">
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />
        <div className="relative bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
            <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
              <Shield className="w-5 h-5 text-zinc-400" />
              Fraud Status
            </h2>
            <button onClick={handleClose} className="p-1 text-zinc-400 hover:text-zinc-100 rounded-lg hover:bg-zinc-800 transition-colors">
              <X size={18} />
            </button>
          </div>
          <div className="p-6 text-center space-y-4">
            <p className="text-sm text-zinc-400">No fraud data available for this order yet.</p>
            {onCheckAgain && (
              <button
                onClick={() => onCheckAgain(order.id)}
                disabled={isChecking}
                className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors"
              >
                {isChecking ? "Checking..." : "Run Fraud Check"}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const isHighRisk = order.fraud_status === "fraud";
  const isMediumRisk = order.fraud_status === "risky";
  const isSafe = order.fraud_status === "safe" || (!isHighRisk && !isMediumRisk);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-0">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />
      
      <div className="relative bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 bg-zinc-900/50">
          <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
            {isHighRisk ? <ShieldAlert className="w-5 h-5 text-red-400" /> : isMediumRisk ? <AlertTriangle className="w-5 h-5 text-amber-400" /> : <ShieldCheck className="w-5 h-5 text-green-400" />}
            Fraud Report details
          </h2>
          <button onClick={handleClose} className="p-1 text-zinc-400 hover:text-zinc-100 rounded-lg hover:bg-zinc-800 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 max-h-[80vh] overflow-y-auto space-y-6">
          
          {/* Header Status */}
          <div className={`p-4 rounded-xl border flex items-start gap-4 ${isHighRisk ? 'bg-red-500/10 border-red-500/20' : isMediumRisk ? 'bg-amber-500/10 border-amber-500/20' : 'bg-green-500/10 border-green-500/20'}`}>
            <div className={`p-2 rounded-lg ${isHighRisk ? 'bg-red-500/20 text-red-400' : isMediumRisk ? 'bg-amber-500/20 text-amber-400' : 'bg-green-500/20 text-green-400'}`}>
               {isHighRisk ? <ShieldAlert size={24} /> : isMediumRisk ? <AlertTriangle size={24} /> : <ShieldCheck size={24} />}
            </div>
            <div>
              <h3 className={`text-lg font-bold ${isHighRisk ? 'text-red-400' : isMediumRisk ? 'text-amber-400' : 'text-green-400'}`}>
                {isHighRisk ? 'High Risk' : isMediumRisk ? 'Medium Risk' : 'Safe'}
              </h3>
              <p className="text-xs text-zinc-400 mt-1">
                Based on phone number: {fraudData.phone?.local || order.customer_phone}
              </p>
            </div>
            <div className="ml-auto text-right">
               <div className="text-2xl font-black text-zinc-100">{order.fraud_score || 0}</div>
               <div className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider">Risk Score</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Delivery Stats */}
            {fraudData.overall && (
              <div className="space-y-3 col-span-2">
                <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Delivery History</h4>
                <div className="grid grid-cols-4 gap-2">
                  <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-center">
                    <div className="text-lg font-bold text-zinc-200">{fraudData.overall.total || 0}</div>
                    <div className="text-[10px] text-zinc-500 mt-0.5">Total</div>
                  </div>
                  <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-center">
                    <div className="text-lg font-bold text-green-400">{fraudData.overall.delivered || 0}</div>
                    <div className="text-[10px] text-zinc-500 mt-0.5">Delivered</div>
                  </div>
                  <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-center">
                    <div className="text-lg font-bold text-red-400">{fraudData.overall.returned || 0}</div>
                    <div className="text-[10px] text-zinc-500 mt-0.5">Returned</div>
                  </div>
                  <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-center">
                    <div className="text-lg font-bold text-indigo-400">{fraudData.overall.success_ratio || 0}%</div>
                    <div className="text-[10px] text-zinc-500 mt-0.5">Success</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Courier Breakdowns */}
          {fraudData.couriers && Object.keys(fraudData.couriers).length > 0 && (
             <div className="space-y-3">
                <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Courier Breakdown</h4>
                <div className="space-y-2">
                  {Object.entries(fraudData.couriers).map(([courier, data]: [string, any]) => {
                    if (!data.ok || data.total === 0) return null;
                    return (
                      <div key={courier} className="flex items-center justify-between p-3 rounded-lg bg-zinc-950 border border-zinc-800">
                        <div className="capitalize text-sm font-medium text-zinc-300">{courier}</div>
                        <div className="flex gap-4 text-xs text-zinc-400">
                          <div><span className="text-zinc-500">Total:</span> {data.total}</div>
                          <div><span className="text-green-500/80">Del:</span> {data.successful}</div>
                          <div><span className="text-red-500/80">Ret:</span> {data.returned}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
             </div>
          )}

          {/* Fraud Reports List */}
          {fraudData.fraud_reports?.reports?.length > 0 && (
            <div className="space-y-3">
               <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
                 Reported Issues <span className="bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full text-[10px]">{fraudData.fraud_reports.count}</span>
               </h4>
               <div className="space-y-2">
                 {fraudData.fraud_reports.reports.map((report: any, i: number) => (
                   <div key={i} className="p-3 rounded-lg bg-red-500/5 border border-red-500/10 space-y-2">
                     <div className="flex justify-between items-start">
                       <div className="text-xs font-medium text-zinc-300">{report.contact_name || "Unknown"}</div>
                       <div className="text-[10px] text-zinc-500">{new Date(report.created_at).toLocaleDateString()}</div>
                     </div>
                     <p className="text-xs text-zinc-400">{report.complain_details}</p>
                     {report.categories?.length > 0 && (
                       <div className="flex flex-wrap gap-1 mt-2">
                         {report.categories.map((c: string) => (
                           <span key={c} className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">{c}</span>
                         ))}
                       </div>
                     )}
                   </div>
                 ))}
               </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-zinc-800 bg-zinc-900/50 flex justify-between items-center">
          <div className="text-[10px] text-zinc-500">
            Last checked: {order.updated_at ? new Date(order.updated_at).toLocaleString() : "Recently"}
          </div>
          {onCheckAgain && (
            <button
              onClick={() => onCheckAgain(order.id)}
              disabled={isChecking}
              className="text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors disabled:opacity-50"
            >
              {isChecking ? "Checking..." : "Re-check Now"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
