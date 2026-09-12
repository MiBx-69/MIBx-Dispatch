"use client";

import { useEffect, useState } from "react";
import { X, ShieldAlert, ShieldCheck, Shield, AlertTriangle, CheckCircle2, Copy, Check, UserCheck, MessageSquareWarning } from "lucide-react";
import { toast } from "sonner";
import type { Order } from "@/types/database";
import { analyzeCustomerRisk } from "@/lib/risk-analytics";

interface FraudDetailsModalProps {
  order: Order | null;
  onClose: () => void;
  onCheckAgain?: (orderId: string) => void;
  isChecking?: boolean;
}

export function FraudDetailsModal({ order, onClose, onCheckAgain, isChecking }: FraudDetailsModalProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

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

  const analysis = analyzeCustomerRisk({
    fraud_data: fraudData,
    fraud_status: order.fraud_status,
    fraud_score: order.fraud_score,
  });

  const isHighRisk = analysis.isHighRisk;
  const isMediumRisk = analysis.isMediumRisk;
  const customerReportsCount = fraudData.fraud_reports?.count || 0;

  const handleCopyReport = () => {
    const courierLines = fraudData.couriers 
      ? Object.entries(fraudData.couriers)
          .filter(([_, d]: [string, any]) => d.total > 0 || d.successful > 0)
          .map(([c, d]: [string, any]) => `  - ${c.toUpperCase()}: ${d.successful || d.delivered || 0} Delivered / ${d.total || 0} Total`)
          .join("\n")
      : "  No courier data";

    const reportText = `🛡️ FraudSpy Customer & Delivery Report
👤 Customer: ${order.customer_name || "Customer"} (${fraudData.phone?.local || order.customer_phone})
🏷️ Status: ${analysis.riskLevel.toUpperCase()} (Score: ${analysis.riskScore}/100) - ${analysis.ratingLabel}
📦 Total Parcels: ${analysis.total}
✅ Delivered: ${analysis.delivered} (${analysis.successRatio}%)
❌ Returned: ${analysis.returned} (${analysis.returnRatio}%)
⚠️ Merchant Complaints: ${customerReportsCount > 0 ? `${customerReportsCount} complaint(s) reported` : "Clean record (0 complaints)"}
🚚 Couriers Breakdown:
${courierLines}
💡 Recommendation: ${analysis.recommendation}
🕒 Checked: ${new Date().toLocaleString()}`;

    navigator.clipboard.writeText(reportText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Detailed customer report copied to clipboard!");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-0">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />
      
      <div className="relative bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 bg-zinc-900/50">
          <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
            {isHighRisk ? <ShieldAlert className="w-5 h-5 text-red-400" /> : isMediumRisk ? <AlertTriangle className="w-5 h-5 text-amber-400" /> : <ShieldCheck className="w-5 h-5 text-emerald-400" />}
            Fraud &amp; Customer Risk Assessment
          </h2>
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleCopyReport}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors border border-zinc-700"
              title="Copy Full Report"
            >
              {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
              <span>{copied ? "Copied" : "Copy Report"}</span>
            </button>
            <button onClick={handleClose} className="p-1 text-zinc-400 hover:text-zinc-100 rounded-lg hover:bg-zinc-800 transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="p-5 max-h-[80vh] overflow-y-auto space-y-5">
          
          {/* Header Status */}
          <div className={`p-4 rounded-xl border flex items-start gap-4 ${isHighRisk ? 'bg-red-500/10 border-red-500/20' : isMediumRisk ? 'bg-amber-500/10 border-amber-500/20' : 'bg-emerald-500/10 border-emerald-500/20'}`}>
            <div className={`p-2 rounded-lg ${isHighRisk ? 'bg-red-500/20 text-red-400' : isMediumRisk ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
               {isHighRisk ? <ShieldAlert size={24} /> : isMediumRisk ? <AlertTriangle size={24} /> : <ShieldCheck size={24} />}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className={`text-base font-bold ${isHighRisk ? 'text-red-400' : isMediumRisk ? 'text-amber-400' : 'text-emerald-400'}`}>
                {analysis.ratingLabel}
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Phone: {fraudData.phone?.local || order.customer_phone} {order.customer_name ? `• ${order.customer_name}` : ""}
              </p>
            </div>
            <div className="ml-auto text-right shrink-0">
               <div className="text-2xl font-black text-zinc-100">{analysis.riskScore}</div>
               <div className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider">Risk Score</div>
            </div>
          </div>

          {/* Customer Report / Merchant History Section */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider flex items-center justify-between">
              <span>Customer Merchant Complaints</span>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${customerReportsCount > 0 ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                {customerReportsCount > 0 ? `${customerReportsCount} Complaint(s)` : "Clean Record (0 Reports)"}
              </span>
            </h4>

            {customerReportsCount === 0 ? (
              <div className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl flex items-center gap-2.5">
                <UserCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <div className="text-xs text-emerald-300">
                  <strong>Clean Merchant History:</strong> No complaints, scam reports, or refusal flags reported by other merchants on FraudSpy.
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {fraudData.fraud_reports?.reports?.map((report: any, i: number) => (
                  <div key={i} className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 space-y-1.5">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-red-300">
                        <MessageSquareWarning size={13} className="text-red-400" />
                        <span>{report.contact_name || "Merchant Report"}</span>
                        {report.courier_name && (
                          <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded">
                            {report.courier_name}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-zinc-500">
                        {report.created_at ? new Date(report.created_at).toLocaleDateString() : ""}
                      </div>
                    </div>
                    <p className="text-xs text-zinc-300 leading-relaxed pl-5">
                      {report.complain_details || "Complaint recorded by merchant."}
                    </p>
                    {report.categories?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1 pl-5">
                        {report.categories.map((c: string) => (
                          <span key={c} className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">{c}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Analytics Assessment & Recommendation */}
          <div className={`p-3.5 rounded-xl border ${isHighRisk ? 'bg-red-500/5 border-red-500/20 text-red-300' : isMediumRisk ? 'bg-amber-500/5 border-amber-500/20 text-amber-300' : 'bg-emerald-500/5 border-emerald-500/20 text-emerald-300'}`}>
            <h4 className="text-xs font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5 text-zinc-200">
              Risk Assessment &amp; Action
            </h4>
            <p className="text-xs leading-relaxed text-zinc-300">
              {analysis.recommendation}
            </p>
            {analysis.reasons.length > 0 && (
              <ul className="mt-2 space-y-1 text-[11px] text-zinc-400 list-disc list-inside">
                {analysis.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            )}
          </div>

          {/* Delivery Stats */}
          {fraudData.overall && (
            <div className="space-y-2.5">
              <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Courier Delivery Analytics</h4>
              <div className="grid grid-cols-5 gap-2">
                <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-center">
                  <div className="text-base font-bold text-zinc-200">{analysis.total}</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">Total</div>
                </div>
                <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-center">
                  <div className="text-base font-bold text-emerald-400">{analysis.delivered}</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">Delivered</div>
                </div>
                <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-center">
                  <div className="text-base font-bold text-red-400">{analysis.returned}</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">Returned</div>
                </div>
                <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-center">
                  <div className="text-base font-bold text-indigo-400">{analysis.successRatio}%</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">Success</div>
                </div>
                <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-center">
                  <div className={`text-base font-bold ${analysis.returnRatio > 30 ? 'text-red-400' : analysis.returnRatio > 15 ? 'text-amber-400' : 'text-zinc-400'}`}>
                    {analysis.returnRatio}%
                  </div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">Ret Rate</div>
                </div>
              </div>
            </div>
          )}

          {/* Courier Breakdowns */}
          {fraudData.couriers && Object.keys(fraudData.couriers).length > 0 && (
             <div className="space-y-3">
                <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Courier Network Breakdown</h4>
                <div className="space-y-2">
                  {Object.entries(fraudData.couriers).map(([courier, data]: [string, any]) => {
                    if (!data.ok || (data.total === 0 && !data.successful && !data.delivered)) return null;
                    const dlv = data.successful ?? data.delivered ?? 0;
                    const tot = data.total ?? (dlv + (data.returned ?? 0));
                    const rate = tot > 0 ? Math.round((dlv / tot) * 100) : 0;

                    return (
                      <div key={courier} className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="capitalize text-sm font-semibold text-zinc-200">{courier}</span>
                          <div className="flex gap-3 text-xs">
                            <span className="text-zinc-500">Total: <strong className="text-zinc-300">{tot}</strong></span>
                            <span className="text-emerald-400 font-medium">Del: {dlv}</span>
                            <span className="text-rose-400 font-medium">Ret: {data.returned || 0}</span>
                            <span className="text-indigo-400 font-semibold">{rate}%</span>
                          </div>
                        </div>
                        {tot > 0 && (
                          <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden flex">
                            <div className="bg-emerald-500 h-full" style={{ width: `${rate}%` }} />
                            <div className="bg-rose-500 h-full" style={{ width: `${100 - rate}%` }} />
                          </div>
                        )}
                      </div>
                    );
                  })}
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
