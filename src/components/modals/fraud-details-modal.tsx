"use client";

import { useEffect, useState } from "react";
import { X, ShieldAlert, ShieldCheck, Shield, AlertTriangle, Copy, Check, UserCheck, MessageSquareWarning, Zap, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import type { Order } from "@/types/database";
import { analyzeCustomerRisk } from "@/lib/risk-analytics";
import { formatPathaoTrackingUrl } from "@/lib/pathao/client";

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
  const mrFraudData = order.mr_fraud_data as any;

  const hasFraudSpy = Boolean(fraudData && (fraudData.ok || fraudData.overall));
  const hasMrFraud = Boolean(mrFraudData && (mrFraudData.ok || mrFraudData.total_parcel !== undefined));
  const hasAnyFraudData = hasFraudSpy || hasMrFraud;

  if (!hasAnyFraudData) {
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

  // Calculate baseline risk analysis
  let analysis = analyzeCustomerRisk(
    hasFraudSpy
      ? { fraud_data: fraudData, fraud_status: order.fraud_status, fraud_score: order.fraud_score }
      : {
          delivered: mrFraudData?.success_parcel || 0,
          returned: mrFraudData?.cancel_parcel || 0,
          total: mrFraudData?.total_parcel || 0,
          fraud_score: order.fraud_score ?? mrFraudData?.risk_score ?? 0,
          fraud_status: order.fraud_status ?? (mrFraudData?.status === "Safe" ? "safe" : "risky"),
        }
  );

  // If score is recorded on order, prioritize that
  if (typeof order.fraud_score === "number") {
    const score = order.fraud_score;
    const level = order.fraud_status || (score >= 70 ? "fraud" : score >= 35 ? "risky" : "safe");
    analysis = {
      ...analysis,
      riskScore: score,
      riskLevel: level as any,
      isHighRisk: score >= 70,
      isMediumRisk: score >= 35 && score < 70,
      isSafe: score < 35,
      ratingLabel: score >= 70 ? "High Risk (Fraud)" : score >= 35 ? "Medium Risk (Caution)" : "Safe (Low Risk)",
    };
  }

  const isHighRisk = analysis.isHighRisk;
  const isMediumRisk = analysis.isMediumRisk;
  const customerReportsCount = fraudData?.fraud_reports?.count || 0;

  const isBoth = hasFraudSpy && hasMrFraud;
  const isFraudSpyOnly = hasFraudSpy && !hasMrFraud;
  const isMrFraudOnly = !hasFraudSpy && hasMrFraud;

  // Aggregate stats across whichever provider(s) are present
  const totalParcels = hasFraudSpy ? analysis.total : (mrFraudData?.total_parcel ?? analysis.total);
  const deliveredParcels = hasFraudSpy ? analysis.delivered : (mrFraudData?.success_parcel ?? analysis.delivered);
  const returnedParcels = hasFraudSpy ? analysis.returned : (mrFraudData?.cancel_parcel ?? analysis.returned);
  const successRate = totalParcels > 0 ? Math.round((deliveredParcels / totalParcels) * 100) : 0;
  const returnRate = totalParcels > 0 ? Math.round((returnedParcels / totalParcels) * 100) : 0;

  const handleCopyReport = () => {
    let reportText = `🛡️ Customer & Delivery Risk Assessment Report\n`;
    reportText += `👤 Customer: ${order.customer_name || "Customer"} (${order.customer_phone})\n`;
    reportText += `🏷️ Status: ${analysis.riskLevel.toUpperCase()} (Score: ${analysis.riskScore}/100) - ${analysis.ratingLabel}\n`;
    if (isBoth) reportText += `🔍 Source: Combined (FraudSpy 60% + Mr. Fraud Checker 40%)\n`;
    else if (isFraudSpyOnly) reportText += `🔍 Source: FraudSpy\n`;
    else if (isMrFraudOnly) reportText += `🔍 Source: Mr. Fraud Checker\n`;

    reportText += `📦 Total Parcels: ${totalParcels}\n`;
    reportText += `✅ Delivered: ${deliveredParcels} (${successRate}%)\n`;
    reportText += `❌ Returned: ${returnedParcels} (${returnRate}%)\n`;

    if (hasFraudSpy) {
      reportText += `⚠️ Merchant Complaints (FraudSpy): ${customerReportsCount > 0 ? `${customerReportsCount} complaint(s) reported` : "Clean record (0 complaints)"}\n`;
    }

    if (hasMrFraud && mrFraudData?.status) {
      reportText += `🛡️ Mr. Fraud Checker Rating: ${mrFraudData.status} (Safety Score: ${mrFraudData.score})\n`;
    }

    reportText += `💡 Recommendation: ${analysis.recommendation}\n`;
    reportText += `🕒 Checked: ${new Date().toLocaleString()}`;

    navigator.clipboard.writeText(reportText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Detailed customer report copied to clipboard!");
  };

  // Mr. Fraud Checker courier response entries
  const mrCouriers = mrFraudData?.response
    ? Object.entries(mrFraudData.response)
        .filter(([_, entry]: [string, any]) => entry?.data && entry.data.total > 0)
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-0">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />
      
      <div className="relative bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 bg-zinc-900/50">
          <div>
            <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
              {isHighRisk ? <ShieldAlert className="w-5 h-5 text-red-400" /> : isMediumRisk ? <AlertTriangle className="w-5 h-5 text-amber-400" /> : <ShieldCheck className="w-5 h-5 text-emerald-400" />}
              Fraud &amp; Customer Risk Assessment
            </h2>
            <div className="flex items-center gap-1.5 mt-1">
              {isBoth && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                  Combined: FraudSpy (60%) + Mr. Fraud (40%)
                </span>
              )}
              {isFraudSpyOnly && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-medium">
                  Provider: FraudSpy
                </span>
              )}
              {isMrFraudOnly && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
                  Provider: Mr. Fraud Checker
                </span>
              )}
            </div>
          </div>
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
                Phone: {order.customer_phone || "N/A"} {order.customer_name ? `• ${order.customer_name}` : ""}
              </p>
              {order.pathao_consignment_id && (
                <div className="mt-1">
                  <a
                    href={order.pathao_tracking_url || formatPathaoTrackingUrl(order.pathao_consignment_id, order.customer_phone)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-indigo-400 hover:text-indigo-300 hover:underline inline-flex items-center gap-1 font-mono transition-colors"
                    title="Track parcel on Pathao"
                  >
                    📦 Consignment: {order.pathao_consignment_id}
                    <ExternalLink size={10} className="opacity-70" />
                  </a>
                </div>
              )}
            </div>
            <div className="ml-auto text-right shrink-0">
               <div className="text-2xl font-black text-zinc-100">{analysis.riskScore}</div>
               <div className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider">Risk Score</div>
            </div>
          </div>

          {/* Customer Merchant Complaints (FraudSpy) */}
          {hasFraudSpy && (
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
                    <strong>Clean Merchant History:</strong> No complaints or refusal flags reported by other merchants on FraudSpy.
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
          )}

          {/* Mr. Fraud Checker Rating Badge if active */}
          {hasMrFraud && (
            <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-semibold text-zinc-300">Mr. Fraud Checker Result</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-400">Rating:</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded ${mrFraudData.status === 'Safe' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                  {mrFraudData.status || "Safe"}
                </span>
                <span className="text-[11px] text-zinc-500">({mrFraudData.score ?? 100}/100)</span>
              </div>
            </div>
          )}

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
          {totalParcels > 0 && (
            <div className="space-y-2.5">
              <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Courier Delivery Analytics</h4>
              <div className="grid grid-cols-5 gap-2">
                <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-center">
                  <div className="text-base font-bold text-zinc-200">{totalParcels}</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">Total</div>
                </div>
                <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-center">
                  <div className="text-base font-bold text-emerald-400">{deliveredParcels}</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">Delivered</div>
                </div>
                <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-center">
                  <div className="text-base font-bold text-red-400">{returnedParcels}</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">Returned</div>
                </div>
                <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-center">
                  <div className="text-base font-bold text-indigo-400">{successRate}%</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">Success</div>
                </div>
                <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-center">
                  <div className={`text-base font-bold ${returnRate > 30 ? 'text-red-400' : returnRate > 15 ? 'text-amber-400' : 'text-zinc-400'}`}>
                    {returnRate}%
                  </div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">Ret Rate</div>
                </div>
              </div>
            </div>
          )}

          {/* Mr. Fraud Checker Courier Network Breakdown */}
          {mrCouriers.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider flex items-center justify-between">
                <span>Mr. Fraud Courier Breakdown</span>
                <span className="text-[10px] text-zinc-500 font-normal">Steadfast, Pathao, REDX, CarryBee</span>
              </h4>
              <div className="space-y-2">
                {mrCouriers.map(([courierName, entry]: [string, any]) => {
                  const d = entry.data;
                  const rate = d.deliveredPercentage ?? (d.total > 0 ? Math.round((d.success / d.total) * 100) : 0);
                  return (
                    <div key={courierName} className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="capitalize text-sm font-semibold text-zinc-200">{courierName}</span>
                        <div className="flex gap-3 text-xs">
                          <span className="text-zinc-500">Total: <strong className="text-zinc-300">{d.total}</strong></span>
                          <span className="text-emerald-400 font-medium">Del: {d.success}</span>
                          <span className="text-rose-400 font-medium">Ret: {d.cancel}</span>
                          <span className="text-amber-400 font-semibold">{rate}%</span>
                        </div>
                      </div>
                      {d.total > 0 && (
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

          {/* FraudSpy Courier Network Breakdown */}
          {hasFraudSpy && fraudData.couriers && Object.keys(fraudData.couriers).length > 0 && (
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">FraudSpy Courier Breakdown</h4>
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
