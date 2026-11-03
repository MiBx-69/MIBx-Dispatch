"use client";

import { useEffect, useState } from "react";
import {
  X,
  ShoppingBag,
  Truck,
  Calendar,
  MapPin,
  AlertTriangle,
  Copy,
  Check,
  ShieldCheck,
  BellRing,
  Plus,
  Clock,
  CheckCircle2,
  Circle,
  Loader2,
  Flag,
} from "lucide-react";
import { toast } from "sonner";
import { SendSMSModal } from "@/components/orders/send-sms-modal";
import { FraudDetailsModal } from "@/components/modals/fraud-details-modal";
import { analyzeCustomerRisk } from "@/lib/risk-analytics";

interface CustomerDrawerProps {
  customer: any;
  onClose: () => void;
}

export function CustomerDrawer({ customer, onClose }: CustomerDrawerProps) {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [smsOpen, setSmsOpen] = useState(false);
  const [fraudModalOrder, setFraudModalOrder] = useState<any | null>(null);

  // CRM Tab State
  const [activeTab, setActiveTab] = useState<"orders" | "followups">("orders");
  const [followUps, setFollowUps] = useState<any[]>([]);
  const [loadingFollowUps, setLoadingFollowUps] = useState(false);
  const [showAddFollowUp, setShowAddFollowUp] = useState(false);

  // New Follow-Up Form State
  const [newTitle, setNewTitle] = useState("");
  const [newNote, setNewNote] = useState("");
  const [newReminderDate, setNewReminderDate] = useState("");
  const [newPriority, setNewPriority] = useState<"low" | "normal" | "high" | "urgent">("normal");
  const [savingFollowUp, setSavingFollowUp] = useState(false);

  useEffect(() => {
    let mounted = true;
    const fetchOrders = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/customers/${customer.id}/orders`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        if (mounted) setOrders(data.orders || []);
      } catch (err: any) {
        if (mounted) setError(err.message);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    const fetchFollowUps = async () => {
      try {
        setLoadingFollowUps(true);
        const res = await fetch(`/api/customers/${customer.id}/follow-ups`);
        const data = await res.json();
        if (mounted && data.followUps) {
          setFollowUps(data.followUps);
        }
      } catch {
        // Non-blocking
      } finally {
        if (mounted) setLoadingFollowUps(false);
      }
    };

    fetchOrders();
    fetchFollowUps();

    return () => {
      mounted = false;
    };
  }, [customer.id]);

  const cancelledOrders = orders.filter(
    (o) => o.internal_status === "cancelled" || o.internal_status === "returned"
  ).length;
  const isHighRisk = orders.length >= 3 && cancelledOrders >= orders.length / 2;

  const latestFraudOrder = orders.find((o) => o.fraud_data);
  const fraudData = latestFraudOrder?.fraud_data;
  const analysis = fraudData ? analyzeCustomerRisk(fraudData) : null;

  const bestPhone = customer.phone || (orders.length > 0 ? orders[0].customer_phone : null);
  const bestName = customer.name || (orders.length > 0 ? orders[0].customer_name : "Unknown");
  const bestEmail = customer.email || (orders.length > 0 ? orders[0].customer_email : null);

  const handleCopyPhone = () => {
    if (bestPhone) {
      navigator.clipboard.writeText(bestPhone);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("Phone number copied to clipboard!");
    }
  };

  const handleAddFollowUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) {
      toast.error("Please provide a title for the reminder");
      return;
    }

    setSavingFollowUp(true);
    try {
      const res = await fetch(`/api/customers/${customer.id}/follow-ups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle.trim(),
          note: newNote.trim() || undefined,
          reminder_date: newReminderDate ? new Date(newReminderDate).toISOString() : undefined,
          priority: newPriority,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create follow-up");

      toast.success("Follow-up reminder saved!");
      setFollowUps((prev) => [data.followUp, ...prev]);
      setNewTitle("");
      setNewNote("");
      setNewReminderDate("");
      setNewPriority("normal");
      setShowAddFollowUp(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to save reminder");
    } finally {
      setSavingFollowUp(false);
    }
  };

  const handleToggleFollowUpStatus = async (item: any) => {
    const nextStatus = item.status === "completed" ? "pending" : "completed";
    try {
      setFollowUps((prev) =>
        prev.map((f) => (f.id === item.id ? { ...f, status: nextStatus } : f))
      );

      const res = await fetch(`/api/customers/${customer.id}/follow-ups`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          follow_up_id: item.id,
          status: nextStatus,
        }),
      });

      if (!res.ok) throw new Error("Could not update status");
      toast.success(nextStatus === "completed" ? "Marked as completed" : "Reopened follow-up");
    } catch (err: any) {
      toast.error(err.message || "Error updating follow-up");
      // Revert on error
      setFollowUps((prev) =>
        prev.map((f) => (f.id === item.id ? { ...f, status: item.status } : f))
      );
    }
  };

  const pendingFollowUpsCount = followUps.filter((f) => f.status === "pending").length;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity"
        onClick={onClose}
      />
      <div className="fixed right-0 top-0 bottom-0 w-full sm:w-[480px] bg-zinc-900 border-l border-zinc-800 z-50 shadow-2xl flex flex-col animate-slide-left">
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-zinc-800 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <h2 className="text-xl font-bold text-zinc-100">{bestName}</h2>
              {customer.total_spent >= 10000 || customer.total_orders >= 5 ? (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  VIP
                </span>
              ) : null}
              {isHighRisk && (
                <span className="px-2 py-0.5 rounded flex items-center gap-1 text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30">
                  <AlertTriangle size={10} /> HIGH RISK
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-sm text-zinc-400 font-mono">
              <span>{bestPhone || (!loading ? "No phone" : "Loading...")}</span>
              {bestPhone && (
                <button
                  onClick={handleCopyPhone}
                  className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
                  title="Copy Phone Number"
                >
                  {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                </button>
              )}
              {bestEmail && <span>• {bestEmail}</span>}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 bg-zinc-800 rounded-lg hover:bg-zinc-700 text-zinc-400 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Stats Summary */}
        <div className="grid grid-cols-2 divide-x divide-zinc-800 border-b border-zinc-800 bg-zinc-950/50">
          <div className="p-3.5 text-center">
            <p className="text-xs text-zinc-500 mb-0.5">Total Orders</p>
            <p className="text-lg font-bold text-zinc-200">{customer.total_orders}</p>
          </div>
          <div className="p-3.5 text-center">
            <p className="text-xs text-zinc-500 mb-0.5">Total Spent</p>
            <p className="text-lg font-bold text-emerald-400">
              ৳{Number(customer.total_spent).toLocaleString()}
            </p>
          </div>
        </div>

        {/* Quick Action Buttons */}
        <div className="p-3 sm:p-4 border-b border-zinc-800 flex gap-2">
          {bestPhone && (
            <>
              <button
                onClick={() => setSmsOpen(true)}
                className="flex-1 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 border border-indigo-600/30 font-semibold text-xs py-2 rounded-lg text-center transition-colors"
              >
                Send SMS
              </button>
              <button
                onClick={() => {
                  const d = bestPhone!.replace(/[^0-9]/g, "");
                  const formattedPhone = d.startsWith("880")
                    ? d
                    : d.startsWith("0")
                    ? `88${d}`
                    : `880${d}`;

                  const ua = navigator.userAgent.toLowerCase();
                  const isAndroid = ua.includes("android");
                  const isIOS = /ipad|iphone|ipod/.test(ua) && !(window as any).MSStream;

                  if (isAndroid) {
                    window.location.href = `intent://send/?phone=${formattedPhone}#Intent;scheme=whatsapp;package=com.whatsapp.w4b;end`;
                  } else if (isIOS) {
                    window.location.href = `whatsapp://send?phone=${formattedPhone}`;
                  } else {
                    window.open(`https://web.whatsapp.com/send?phone=${formattedPhone}`, "_blank");
                  }
                }}
                className="flex-1 bg-green-600/10 hover:bg-green-600/20 text-green-500 border border-green-600/30 font-semibold text-xs py-2 rounded-lg text-center transition-colors"
              >
                WhatsApp
              </button>
            </>
          )}
          {bestEmail && (
            <a
              href={`mailto:${bestEmail}`}
              className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold text-xs py-2 rounded-lg text-center transition-colors"
            >
              Email
            </a>
          )}
        </div>

        {/* Tab Navigation: Orders vs CRM Follow-ups */}
        <div className="flex border-b border-zinc-800 bg-zinc-900/60 px-4 pt-2">
          <button
            onClick={() => setActiveTab("orders")}
            className={`flex items-center gap-1.5 pb-2.5 px-3 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === "orders"
                ? "border-indigo-500 text-indigo-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <ShoppingBag size={13} />
            <span>Orders ({orders.length})</span>
          </button>
          <button
            onClick={() => setActiveTab("followups")}
            className={`flex items-center gap-1.5 pb-2.5 px-3 text-xs font-semibold border-b-2 transition-colors relative ${
              activeTab === "followups"
                ? "border-indigo-500 text-indigo-400"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <BellRing size={13} />
            <span>Follow-Ups & CRM</span>
            {pendingFollowUpsCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-full text-[10px]">
                {pendingFollowUpsCount}
              </span>
            )}
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {activeTab === "orders" ? (
            <>
              {/* FraudSpy Customer Risk & Delivery Report */}
              {analysis && (
                <div className="p-3.5 border border-zinc-800 rounded-xl bg-zinc-950/40 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShieldCheck
                        size={15}
                        className={
                          analysis.isHighRisk
                            ? "text-red-400"
                            : analysis.isMediumRisk
                            ? "text-amber-400"
                            : "text-emerald-400"
                        }
                      />
                      <span className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                        FraudSpy Report
                      </span>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        analysis.isHighRisk
                          ? "bg-red-500/20 text-red-400 border border-red-500/30"
                          : analysis.isMediumRisk
                          ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                          : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                      }`}
                    >
                      {analysis.riskLevel.toUpperCase()} ({analysis.riskScore}/100)
                    </span>
                  </div>

                  <p className="text-xs text-zinc-300">
                    {analysis.ratingLabel} •{" "}
                    <span className="text-zinc-400">
                      {fraudData.fraud_reports?.count > 0
                        ? `${fraudData.fraud_reports.count} Merchant Complaint(s)`
                        : "Clean Record (0 Complaints)"}
                    </span>
                  </p>

                  <div className="grid grid-cols-4 gap-1.5 text-center">
                    <div className="bg-zinc-900 border border-zinc-800 rounded p-1.5">
                      <div className="text-xs font-bold text-zinc-200">{analysis.total}</div>
                      <div className="text-[9px] text-zinc-500">Parcels</div>
                    </div>
                    <div className="bg-zinc-900 border border-zinc-800 rounded p-1.5">
                      <div className="text-xs font-bold text-emerald-400">{analysis.delivered}</div>
                      <div className="text-[9px] text-zinc-500">Delivered</div>
                    </div>
                    <div className="bg-zinc-900 border border-zinc-800 rounded p-1.5">
                      <div className="text-xs font-bold text-red-400">{analysis.returned}</div>
                      <div className="text-[9px] text-zinc-500">Returned</div>
                    </div>
                    <div className="bg-zinc-900 border border-zinc-800 rounded p-1.5">
                      <div className="text-xs font-bold text-indigo-400">
                        {analysis.successRatio}%
                      </div>
                      <div className="text-[9px] text-zinc-500">Success</div>
                    </div>
                  </div>

                  {latestFraudOrder && (
                    <button
                      onClick={() => setFraudModalOrder(latestFraudOrder)}
                      className="w-full text-center text-[11px] font-medium text-indigo-400 hover:text-indigo-300 py-1 bg-indigo-500/10 hover:bg-indigo-500/20 rounded border border-indigo-500/20 transition-colors"
                    >
                      View Full Detailed Report
                    </button>
                  )}
                </div>
              )}

              {/* Order List */}
              <div className="space-y-3">
                {loading ? (
                  <div className="text-center py-10 text-zinc-600 text-xs">Loading orders...</div>
                ) : error ? (
                  <div className="text-center py-10 text-red-500 text-xs">{error}</div>
                ) : orders.length === 0 ? (
                  <div className="text-center py-10 text-zinc-600 text-xs">No orders found.</div>
                ) : (
                  orders.map((order) => (
                    <div
                      key={order.id}
                      className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 flex flex-col gap-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-zinc-200 text-sm">
                          {order.shopify_order_name}
                        </span>
                        <span className="text-xs font-medium text-emerald-400">
                          ৳{Number(order.total_price).toLocaleString()}
                        </span>
                      </div>

                      <div className="flex flex-col gap-1 mt-0.5">
                        <div className="flex items-center gap-2 text-xs text-zinc-500">
                          <Calendar size={12} />
                          {new Date(order.shopify_created_at).toLocaleDateString("en-BD", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </div>

                        <div className="flex items-center gap-2 text-xs text-zinc-500 truncate">
                          <MapPin size={12} className="shrink-0" />
                          <span className="truncate">
                            {order.shipping_address?.address1 || "No address"}
                          </span>
                        </div>
                      </div>

                      <div className="mt-1.5 pt-2 border-t border-zinc-800 flex items-center justify-between">
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 capitalize">
                          {order.internal_status}
                        </span>

                        {order.dispatches?.[0] && (
                          <span className="text-[10px] flex items-center gap-1 text-indigo-400">
                            <Truck size={10} />
                            {order.dispatches[0].pathao_order_status || "Dispatched"}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            /* CRM Follow-Ups & Reminders Tab */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-400 font-medium">Customer Reminders & Log</span>
                <button
                  type="button"
                  onClick={() => setShowAddFollowUp(!showAddFollowUp)}
                  className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium flex items-center gap-1 transition-colors"
                >
                  <Plus size={13} />
                  <span>{showAddFollowUp ? "Cancel" : "Add Reminder"}</span>
                </button>
              </div>

              {/* Add Follow-Up Form */}
              {showAddFollowUp && (
                <form
                  onSubmit={handleAddFollowUp}
                  className="bg-zinc-950 border border-zinc-800 rounded-xl p-3.5 space-y-3 animate-in fade-in"
                >
                  <div>
                    <label className="text-[11px] text-zinc-400 font-medium block mb-1">
                      Reminder Title
                    </label>
                    <input
                      type="text"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      placeholder="e.g. Call to confirm address change"
                      className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500"
                    />
                    {/* Quick Suggestion Chips */}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {[
                        "Address confirmation",
                        "Call back later",
                        "Exchange enquiry",
                        "Payment verification",
                      ].map((chip) => (
                        <button
                          key={chip}
                          type="button"
                          onClick={() => setNewTitle(chip)}
                          className="px-2 py-0.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded text-[10px] text-zinc-400 hover:text-zinc-200 transition-colors"
                        >
                          {chip}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-zinc-400 font-medium block mb-1">
                        Reminder Date & Time
                      </label>
                      <input
                        type="datetime-local"
                        value={newReminderDate}
                        onChange={(e) => setNewReminderDate(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-100 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-zinc-400 font-medium block mb-1">
                        Priority
                      </label>
                      <select
                        value={newPriority}
                        onChange={(e: any) => setNewPriority(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-100 focus:outline-none focus:border-indigo-500"
                      >
                        <option value="low">Low</option>
                        <option value="normal">Normal</option>
                        <option value="high">High</option>
                        <option value="urgent">Urgent</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] text-zinc-400 font-medium block mb-1">
                      Notes / Context (Optional)
                    </label>
                    <textarea
                      rows={2}
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      placeholder="Add customer preferences, instructions..."
                      className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500 resize-none"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowAddFollowUp(false)}
                      className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 rounded-lg text-xs text-zinc-400"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={savingFollowUp || !newTitle.trim()}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5"
                    >
                      {savingFollowUp && <Loader2 size={12} className="animate-spin" />}
                      <span>Save Follow-up</span>
                    </button>
                  </div>
                </form>
              )}

              {/* Follow-ups List */}
              {loadingFollowUps ? (
                <div className="text-center py-8 text-zinc-500 text-xs">Loading follow-ups...</div>
              ) : followUps.length === 0 ? (
                <div className="text-center py-10 bg-zinc-950/40 border border-zinc-800/60 rounded-xl space-y-2 text-zinc-500">
                  <BellRing className="w-8 h-8 mx-auto text-zinc-600" />
                  <p className="text-xs">No active follow-ups or reminders for this customer.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {followUps.map((item) => {
                    const isCompleted = item.status === "completed";
                    const isOverdue =
                      !isCompleted &&
                      item.reminder_date &&
                      new Date(item.reminder_date).getTime() < Date.now();

                    return (
                      <div
                        key={item.id}
                        className={`p-3 rounded-xl border transition-all ${
                          isCompleted
                            ? "bg-zinc-950/30 border-zinc-900 opacity-60"
                            : isOverdue
                            ? "bg-red-950/20 border-red-500/30"
                            : "bg-zinc-950 border-zinc-800"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2.5 min-w-0">
                            <button
                              type="button"
                              onClick={() => handleToggleFollowUpStatus(item)}
                              className="mt-0.5 text-zinc-400 hover:text-zinc-200 transition-colors shrink-0"
                            >
                              {isCompleted ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-400 fill-emerald-500/20" />
                              ) : (
                                <Circle className="w-4 h-4 text-zinc-600 hover:text-zinc-400" />
                              )}
                            </button>
                            <div className="min-w-0">
                              <p
                                className={`text-xs font-semibold ${
                                  isCompleted
                                    ? "line-through text-zinc-500"
                                    : "text-zinc-200"
                                }`}
                              >
                                {item.title}
                              </p>
                              {item.note && (
                                <p className="text-[11px] text-zinc-400 mt-0.5 whitespace-pre-wrap">
                                  {item.note}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {item.priority === "urgent" || item.priority === "high" ? (
                              <span
                                className={`text-[9px] uppercase px-1.5 py-0.5 rounded font-bold border ${
                                  item.priority === "urgent"
                                    ? "bg-rose-500/20 text-rose-300 border-rose-500/30"
                                    : "bg-amber-500/20 text-amber-300 border-amber-500/30"
                                }`}
                              >
                                {item.priority}
                              </span>
                            ) : null}
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-[10px] text-zinc-500 mt-2 pt-2 border-t border-zinc-800/40">
                          <div className="flex items-center gap-1.5">
                            <Clock size={11} className={isOverdue ? "text-red-400" : ""} />
                            {item.reminder_date ? (
                              <span
                                className={
                                  isOverdue ? "text-red-400 font-semibold" : "text-zinc-400"
                                }
                              >
                                {isOverdue ? "Overdue: " : "Reminder: "}
                                {new Date(item.reminder_date).toLocaleString("en-BD", {
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            ) : (
                              <span>No scheduled date</span>
                            )}
                          </div>
                          <span>By {item.created_by || "Staff"}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {smsOpen && (
        <SendSMSModal
          isOpen={smsOpen}
          onClose={() => setSmsOpen(false)}
          order={{ customers: { name: bestName, phone: bestPhone } }}
        />
      )}

      {fraudModalOrder && (
        <FraudDetailsModal
          order={fraudModalOrder}
          onClose={() => setFraudModalOrder(null)}
        />
      )}
    </>
  );
}
