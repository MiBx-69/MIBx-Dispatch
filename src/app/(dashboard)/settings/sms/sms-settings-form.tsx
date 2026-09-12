"use client";

import { useState, useTransition } from "react";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { updateSMSSettings, toggleMasterSMSAction } from "./actions";
import {
  PackagePlus,
  Truck,
  Bike,
  CheckCircle2,
  PauseCircle,
  RotateCcw,
  XCircle,
  Key,
  Smartphone,
  Eye,
  RotateCw,
  Sparkles,
  Info,
  Power,
  ShieldCheck,
  Radio,
  Tag,
  MessageSquare,
  AlertTriangle,
} from "lucide-react";
import type { AppSettings } from "@/types/database";

interface SMSSettingsFormProps {
  settings: AppSettings | null;
}

interface NotificationConfig {
  id: string;
  eventType: string;
  nameKey: string;
  templateKey: string;
  title: string;
  description: string;
  badge: string;
  badgeColor: string;
  icon: any;
  defaultTemplate: string;
  variables: { name: string; desc: string }[];
}

const NOTIFICATIONS: NotificationConfig[] = [
  {
    id: "order_placed",
    eventType: "order",
    nameKey: "sms_auto_order_enabled",
    templateKey: "sms_auto_order_template",
    title: "Order Placed / Received",
    description: "Sent automatically when a new order is received from Shopify store.",
    badge: "New Order",
    badgeColor: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    icon: PackagePlus,
    defaultTemplate:
      "প্রিয় {{customer_name}}, Universes-এ আপনার অর্ডার ({{order_id}}) সফলভাবে প্লেস হয়েছে। আমাদের টিম খুব শীঘ্রই কনফার্ম করতে যোগাযোগ করবে। ধন্যবাদ!",
    variables: [
      { name: "{{order_id}}", desc: "Order # (e.g. #1780)" },
      { name: "{{customer_name}}", desc: "Customer full name" },
      { name: "{{total_price}}", desc: "Order total amount (৳)" },
    ],
  },
  {
    id: "dispatched",
    eventType: "dispatch",
    nameKey: "sms_auto_dispatch_enabled",
    templateKey: "sms_auto_dispatch_template",
    title: "Order Dispatched",
    description: "Sent when an order is created and handed over to Pathao courier.",
    badge: "Dispatched",
    badgeColor: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    icon: Truck,
    defaultTemplate:
      "প্রিয় {{customer_name}}, Universes থেকে আপনার অর্ডার {{order_id}} ডিসপ্যাচ করা হয়েছে। বকেয়া বিল ৳{{total_price}}। ট্র্যাকিং: {{tracking_url}}",
    variables: [
      { name: "{{order_id}}", desc: "Order # (e.g. #1780)" },
      { name: "{{customer_name}}", desc: "Customer full name" },
      { name: "{{tracking_url}}", desc: "Pathao live parcel tracking link" },
      { name: "{{consignment_id}}", desc: "Courier Consignment ID" },
      { name: "{{total_price}}", desc: "Order total amount (৳)" },
    ],
  },
  {
    id: "out_for_delivery",
    eventType: "out_for_delivery",
    nameKey: "sms_auto_out_for_delivery_enabled",
    templateKey: "sms_auto_out_for_delivery_template",
    title: "Out For Delivery (Rider Assigned)",
    description: "Sent on delivery day when courier assigns a rider to deliver the parcel.",
    badge: "Out for Delivery",
    badgeColor: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
    icon: Bike,
    defaultTemplate:
      "প্রিয় {{customer_name}}, আপনার অর্ডার {{order_id}} আজ ডেলিভারির জন্য রাইডারের কাছে হস্তান্তর করা হয়েছে। অনুগ্রহ করে ৳{{total_price}} প্রস্তুত রাখুন। ধন্যবাদ!",
    variables: [
      { name: "{{order_id}}", desc: "Order # (e.g. #1780)" },
      { name: "{{customer_name}}", desc: "Customer full name" },
      { name: "{{total_price}}", desc: "Amount to collect (৳)" },
      { name: "{{tracking_url}}", desc: "Pathao live parcel tracking link" },
    ],
  },
  {
    id: "delivered",
    eventType: "delivered",
    nameKey: "sms_auto_delivered_enabled",
    templateKey: "sms_auto_delivered_template",
    title: "Order Delivered",
    description: "Sent when courier marks the delivery as completed.",
    badge: "Delivered",
    badgeColor: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    icon: CheckCircle2,
    defaultTemplate:
      "প্রিয় {{customer_name}}, আপনার অর্ডার {{order_id}} সফলভাবে ডেলিভারি হয়েছে। Universes-এর সাথে থাকার জন্য আন্তরিক ধন্যবাদ!",
    variables: [
      { name: "{{order_id}}", desc: "Order # (e.g. #1780)" },
      { name: "{{customer_name}}", desc: "Customer full name" },
    ],
  },
  {
    id: "on_hold",
    eventType: "on_hold",
    nameKey: "sms_auto_on_hold_enabled",
    templateKey: "sms_auto_on_hold_template",
    title: "Delivery On Hold / Failed Attempt",
    description: "Sent when courier reports customer unavailable, rescheduled, or delivery issue.",
    badge: "On Hold",
    badgeColor: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    icon: PauseCircle,
    defaultTemplate:
      "প্রিয় {{customer_name}}, আপনার অর্ডার {{order_id}} ডেলিভারি সাময়িকভাবে হোল্ডে রয়েছে। পণ্যটি রিসিভ করতে অনুগ্রহ করে আমাদের সাথে যোগাযোগ করুন: 09643655867",
    variables: [
      { name: "{{order_id}}", desc: "Order # (e.g. #1780)" },
      { name: "{{customer_name}}", desc: "Customer full name" },
      { name: "{{tracking_url}}", desc: "Pathao live parcel tracking link" },
    ],
  },
  {
    id: "returned",
    eventType: "returned",
    nameKey: "sms_auto_returned_enabled",
    templateKey: "sms_auto_returned_template",
    title: "Order Returned",
    description: "Sent when an authorized return is processed from Shopify.",
    badge: "Returned",
    badgeColor: "bg-rose-500/10 text-rose-400 border-rose-500/20",
    icon: RotateCcw,
    defaultTemplate:
      "প্রিয় {{customer_name}}, আপনার অর্ডার {{order_id}} রিটার্ন সম্পন্ন হয়েছে। কোনো জিজ্ঞাসা থাকলে আমাদের কল করুন: 09643655867",
    variables: [
      { name: "{{order_id}}", desc: "Order # (e.g. #1780)" },
      { name: "{{customer_name}}", desc: "Customer full name" },
    ],
  },
  {
    id: "cancelled",
    eventType: "cancelled",
    nameKey: "sms_auto_cancelled_enabled",
    templateKey: "sms_auto_cancelled_template",
    title: "Order Cancelled",
    description: "Sent when an order is cancelled on Shopify or inside the Dispatch app.",
    badge: "Cancelled",
    badgeColor: "bg-red-500/10 text-red-400 border-red-500/20",
    icon: XCircle,
    defaultTemplate:
      "প্রিয় {{customer_name}}, আপনার অর্ডার {{order_id}} বাতিল করা হয়েছে। যেকোনো প্রয়োজনে অনুগ্রহ করে আমাদের কল করুন: 09643655867। ধন্যবাদ!",
    variables: [
      { name: "{{order_id}}", desc: "Order # (e.g. #1780)" },
      { name: "{{customer_name}}", desc: "Customer full name" },
    ],
  },
];

const SENDER_ID_MESSAGE_TYPES = [
  { id: "order", label: "Order Placed / Confirmation", desc: "Customer order placed SMS" },
  { id: "dispatch", label: "Order Dispatched", desc: "Parcel dispatched to courier" },
  { id: "out_for_delivery", label: "Out for Delivery", desc: "Rider out for delivery notification" },
  { id: "delivered", label: "Order Delivered", desc: "Delivery success notification" },
  { id: "on_hold", label: "Delivery On Hold", desc: "Courier hold/failed attempt notice" },
  { id: "returned", label: "Order Returned", desc: "Shopify return completion notice" },
  { id: "cancelled", label: "Order Cancelled", desc: "Cancellation notice" },
  { id: "manual", label: "Manual / Dashboard SMS", desc: "Custom SMS sent from orders table" },
];

export function SMSSettingsForm({ settings }: SMSSettingsFormProps) {
  const [isPending, startTransition] = useTransition();

  // Master CTA Toggle State
  const [masterEnabled, setMasterEnabled] = useState<boolean>(() => settings?.sms_master_enabled !== false);

  // Sender ID (Masking) vs Non-Sender ID states
  const [senderIdEnabled, setSenderIdEnabled] = useState<boolean>(() => settings?.sms_sender_id_enabled !== false);
  const [nonSenderIdEnabled, setNonSenderIdEnabled] = useState<boolean>(() => settings?.sms_non_sender_id_enabled !== false);
  
  const [senderIdTypes, setSenderIdTypes] = useState<string[]>(() => {
    if (settings?.sms_sender_id_event_types) {
      if (typeof settings.sms_sender_id_event_types === "string") {
        return settings.sms_sender_id_event_types.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
      }
      if (Array.isArray(settings.sms_sender_id_event_types)) {
        return (settings.sms_sender_id_event_types as string[]).map((s) => s.toLowerCase());
      }
    }
    return ["order", "dispatch", "out_for_delivery", "delivered", "returned", "on_hold", "cancelled", "manual"];
  });

  // Local state for interactive editing, character counts, and live previews
  const [templates, setTemplates] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const n of NOTIFICATIONS) {
      map[n.id] = ((settings as any)?.[n.templateKey] as string) || n.defaultTemplate;
    }
    return map;
  });

  const [toggles, setToggles] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    for (const n of NOTIFICATIONS) {
      map[n.id] = !!(settings as any)?.[n.nameKey];
    }
    return map;
  });

  const [previewOpen, setPreviewOpen] = useState<Record<string, boolean>>({});

  const handleTemplateChange = (id: string, value: string) => {
    setTemplates((prev) => ({ ...prev, [id]: value }));
  };

  const handleToggle = (id: string) => {
    setToggles((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleMasterToggleInstant = () => {
    const nextState = !masterEnabled;
    setMasterEnabled(nextState);
    startTransition(async () => {
      try {
        await toggleMasterSMSAction(nextState);
      } catch (err) {
        console.error("Failed to toggle master SMS:", err);
      }
    });
  };

  const toggleSenderIdType = (typeId: string) => {
    setSenderIdTypes((prev) => {
      if (prev.includes(typeId)) {
        return prev.filter((t) => t !== typeId);
      } else {
        return [...prev, typeId];
      }
    });
  };

  const insertVariable = (id: string, variable: string) => {
    const current = templates[id] || "";
    handleTemplateChange(id, current + " " + variable);
  };

  const resetToDefault = (id: string, def: string) => {
    handleTemplateChange(id, def);
  };

  const togglePreview = (id: string) => {
    setPreviewOpen((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const renderPreview = (template: string) => {
    return template
      .replace(/\{\{customer_name\}\}/g, "Rakibul Hasan")
      .replace(/\{\{order_id\}\}/g, "#1824")
      .replace(/\{\{total_price\}\}/g, "1450")
      .replace(/\{\{tracking_url\}\}/g, "https://merchant.pathao.com/cn-tracking/DU110926854GH8")
      .replace(/\{\{consignment_id\}\}/g, "DU110926854GH8");
  };

  const getSMSStats = (text: string) => {
    const isUnicode = /[^\u0000-\u00ff]/.test(text);
    const length = text.length;
    let parts = 1;
    if (isUnicode) {
      parts = length <= 70 ? 1 : Math.ceil(length / 67);
    } else {
      parts = length <= 160 ? 1 : Math.ceil(length / 153);
    }
    return { length, parts, isUnicode };
  };

  return (
    <ActionForm
      action={updateSMSSettings}
      successMessage="SMS configuration and routing rules saved successfully!"
      className="space-y-6"
    >
      {/* Hidden inputs for state preservation */}
      <input type="hidden" name="sms_master_enabled" value={masterEnabled ? "true" : "false"} />
      <input type="hidden" name="sms_sender_id_enabled" value={senderIdEnabled ? "true" : "false"} />
      <input type="hidden" name="sms_non_sender_id_enabled" value={nonSenderIdEnabled ? "true" : "false"} />
      <input type="hidden" name="sms_sender_id_event_types" value={senderIdTypes.join(",")} />

      {/* ─── 1. MASTER CTA BUTTON & NOTIFICATION CONTROLLER ─── */}
      <div
        className={`rounded-2xl border p-5 sm:p-6 transition-all shadow-xl relative overflow-hidden ${
          masterEnabled
            ? "bg-gradient-to-r from-emerald-950/40 via-zinc-900 to-indigo-950/40 border-emerald-500/40 shadow-emerald-500/5"
            : "bg-gradient-to-r from-rose-950/40 via-zinc-900 to-zinc-950 border-rose-500/40 shadow-rose-500/5"
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="space-y-1.5 max-w-xl">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span
                className={`p-2 rounded-xl border ${
                  masterEnabled
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                }`}
              >
                <Power className="w-5 h-5" />
              </span>
              <h2 className="text-base sm:text-lg font-bold text-zinc-100">
                Master SMS Notification Controller
              </h2>
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-semibold border ${
                  masterEnabled
                    ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                    : "bg-rose-500/15 text-rose-300 border-rose-500/30"
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    masterEnabled ? "bg-emerald-400 animate-pulse" : "bg-rose-400"
                  }`}
                />
                {masterEnabled ? "ACTIVE (SENDING LIVE)" : "PAUSED (ALL SMS STOPPED)"}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
              {masterEnabled
                ? "All configured automated order, dispatch, and delivery notifications are active. Single-click below to pause all customer messaging instantly."
                : "All SMS notifications are globally suspended. No customer will receive automated or bulk SMS while Master mode is turned off."}
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              disabled={isPending}
              onClick={handleMasterToggleInstant}
              className={`px-5 py-2.5 rounded-xl font-semibold text-xs sm:text-sm flex items-center gap-2 shadow-lg transition-all border ${
                masterEnabled
                  ? "bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border-rose-500/40 hover:border-rose-500/60"
                  : "bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500 shadow-emerald-600/20"
              }`}
            >
              <Power size={16} />
              <span>{masterEnabled ? "Turn OFF All SMS Notifications" : "Turn ON All SMS Notifications"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ─── 2. REPEATED NOTIFICATION & COURIER SYNC DECOUPLING NOTICE ─── */}
      <div className="bg-zinc-950/80 border border-zinc-800 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 shrink-0 mt-0.5">
            <ShieldCheck className="w-4 h-4" />
          </span>
          <div>
            <h4 className="text-xs sm:text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <span>Zero Duplicate & Courier Sync Protection</span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Guaranteed
              </span>
            </h4>
            <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
              1. <strong>Courier Sync Decoupled</strong>: Running manual or automated &quot;Sync Status&quot; with Pathao will <strong>never send SMS notifications</strong>. Only live milestones dispatch SMS.
              <br />
              2. <strong>Event Deduplication</strong>: Customers will never receive repeated messages for the same order and delivery status.
            </p>
          </div>
        </div>
      </div>

      {/* ─── 3. SENDER ID (MASKING) VS NON-SENDER ID ROUTING CARD ─── */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 sm:p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-violet-500/10 text-violet-400 border border-violet-500/20">
              <Radio className="w-4 h-4" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">
                Sender ID (Masking) & Non-Masking SMS Routing
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Configure brand name masking (Sender ID) vs operator standard numbers (Non-Sender ID)
              </p>
            </div>
          </div>
        </div>

        {/* Global Sender ID & Non-Sender ID Toggles */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800 flex items-center justify-between gap-3">
            <div>
              <span className="text-xs font-semibold text-zinc-200 block">
                Enable Sender ID (Masking) SMS
              </span>
              <span className="text-[11px] text-zinc-400 block mt-0.5">
                Displays approved brand name (e.g. <strong>{settings?.sms_sender_id || "UNIVERSES"}</strong>)
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={senderIdEnabled}
                onChange={() => setSenderIdEnabled((prev) => !prev)}
                className="sr-only peer"
              />
              <div className="w-10 h-5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-violet-600"></div>
            </label>
          </div>

          <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800 flex items-center justify-between gap-3">
            <div>
              <span className="text-xs font-semibold text-zinc-200 block">
                Enable Non-Sender ID (Non-Masking) SMS
              </span>
              <span className="text-[11px] text-zinc-400 block mt-0.5">
                Uses standard operator number (budget-friendly fallback)
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={nonSenderIdEnabled}
                onChange={() => setNonSenderIdEnabled((prev) => !prev)}
                className="sr-only peer"
              />
              <div className="w-10 h-5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
            </label>
          </div>
        </div>

        {/* Selected Message Types to Use Sender ID */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-zinc-200 flex items-center gap-2">
              <Tag size={13} className="text-violet-400" />
              <span>Select Message Types That Must Use Sender ID (Masking)</span>
            </label>
            <span className="text-[11px] text-zinc-400">
              Unchecked types send via Non-Sender ID route
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {SENDER_ID_MESSAGE_TYPES.map((t) => {
              const isSelected = senderIdTypes.includes(t.id);
              return (
                <div
                  key={t.id}
                  onClick={() => toggleSenderIdType(t.id)}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    isSelected
                      ? "bg-violet-500/10 border-violet-500/40 text-zinc-100"
                      : "bg-zinc-950/40 border-zinc-800/80 text-zinc-400 hover:border-zinc-700"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <span className="text-xs font-semibold block text-zinc-100">{t.label}</span>
                      <span className="text-[10px] text-zinc-400 block leading-tight">{t.desc}</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}} // Handled by container onClick
                      className="rounded bg-zinc-900 border-zinc-700 text-violet-600 focus:ring-0 mt-0.5"
                    />
                  </div>
                  <div className="pt-2">
                    <span
                      className={`text-[9px] font-mono px-2 py-0.5 rounded-full border ${
                        isSelected && senderIdEnabled
                          ? "bg-violet-500/20 text-violet-300 border-violet-500/30"
                          : "bg-zinc-800 text-zinc-400 border-zinc-700"
                      }`}
                    >
                      {isSelected && senderIdEnabled
                        ? `Masking (${settings?.sms_sender_id || "BRAND"})`
                        : "Non-Masking Route"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ─── 4. API CREDENTIALS CARD ─── */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 sm:p-6 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Key className="w-4 h-4" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">SMS Gateway Credentials</h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Provider: <strong>sms.net.bd</strong> high-speed gateway API
              </p>
            </div>
          </div>
          <span className="text-[11px] font-mono px-2.5 py-1 rounded-full bg-zinc-800/80 text-zinc-400 border border-zinc-700/50">
            Provider: sms.net.bd
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-300 flex items-center justify-between">
              <span>API Key</span>
              <span className="text-[10px] text-zinc-500">Required</span>
            </label>
            <input
              type="password"
              name="sms_api_key"
              defaultValue={settings?.sms_api_key || ""}
              placeholder="e.g. 4e819b26f5..."
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-zinc-100 text-xs font-mono focus:outline-none focus:border-indigo-500/60 transition-colors"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-300 flex items-center justify-between">
              <span>Approved Sender ID (Masking Name)</span>
              <span className="text-[10px] text-zinc-500">Approved by Operator</span>
            </label>
            <input
              type="text"
              name="sms_sender_id"
              defaultValue={settings?.sms_sender_id || "UNIVERSES"}
              placeholder="e.g. UNIVERSES"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-zinc-100 text-xs font-mono uppercase focus:outline-none focus:border-indigo-500/60 transition-colors"
            />
          </div>
        </div>
      </div>

      {/* ─── 5. AUTOMATED NOTIFICATION TEMPLATES & TRIGGERS ─── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <div>
            <h3 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-indigo-400" />
              <span>Event Notification Templates & Automations</span>
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Customize dynamic messages for each phase of customer fulfillment
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5">
          {NOTIFICATIONS.map((item) => {
            const isEnabled = toggles[item.id] ?? false;
            const currentText = templates[item.id] || "";
            const stats = getSMSStats(currentText);
            const isPreviewing = previewOpen[item.id] ?? false;
            const Icon = item.icon;
            const isSenderIdMasked = senderIdTypes.includes(item.eventType) && senderIdEnabled;

            return (
              <div
                key={item.id}
                className={`bg-zinc-900 border rounded-2xl p-5 sm:p-6 space-y-4 transition-all ${
                  isEnabled ? "border-zinc-700/80 shadow-md" : "border-zinc-800/70 opacity-80"
                }`}
              >
                {/* Card Header */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <span className="p-2.5 rounded-xl bg-zinc-800 text-zinc-300 border border-zinc-700/60 shrink-0 mt-0.5">
                      <Icon className="w-4 h-4" />
                    </span>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-semibold text-zinc-100">{item.title}</h4>
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${item.badgeColor}`}>
                          {item.badge}
                        </span>
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                            isSenderIdMasked
                              ? "bg-violet-500/10 text-violet-300 border-violet-500/20"
                              : "bg-zinc-800 text-zinc-400 border-zinc-700"
                          }`}
                        >
                          {isSenderIdMasked ? "Sender ID: Masking" : "Non-Sender ID: Standard"}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                        {item.description}
                      </p>
                    </div>
                  </div>

                  {/* Toggle Switch */}
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs font-medium hidden sm:inline ${isEnabled ? "text-emerald-400" : "text-zinc-500"}`}>
                      {isEnabled ? "Active" : "Disabled"}
                    </span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        name={item.nameKey}
                        value="true"
                        checked={isEnabled}
                        onChange={() => handleToggle(item.id)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-500 shadow-inner"></div>
                    </label>
                  </div>
                </div>

                {/* Template Editor Box */}
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <label className="font-medium text-zinc-300">Message Content</label>
                    <div className="flex items-center gap-3 text-[11px]">
                      <button
                        type="button"
                        onClick={() => togglePreview(item.id)}
                        className="text-zinc-400 hover:text-indigo-400 flex items-center gap-1 transition-colors"
                      >
                        <Eye size={12} />
                        <span>{isPreviewing ? "Edit Template" : "Live Preview"}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => resetToDefault(item.id, item.defaultTemplate)}
                        className="text-zinc-500 hover:text-zinc-300 flex items-center gap-1 transition-colors"
                        title="Reset to recommended standard template"
                      >
                        <RotateCw size={11} />
                        <span>Reset Default</span>
                      </button>
                    </div>
                  </div>

                  {isPreviewing ? (
                    <div className="bg-zinc-950 border border-indigo-500/30 rounded-xl p-4 space-y-2.5 animate-in fade-in">
                      <div className="flex items-center justify-between text-[11px] text-zinc-400 border-b border-zinc-800/80 pb-2">
                        <span className="flex items-center gap-1.5 text-indigo-400 font-medium">
                          <Sparkles size={12} />
                          Live Customer SMS Preview
                        </span>
                        <span className="font-mono text-zinc-400">
                          Route: {isSenderIdMasked ? `Masking (${settings?.sms_sender_id || "UNIVERSES"})` : "Non-Masking"}
                        </span>
                      </div>
                      <div className="bg-zinc-900/90 rounded-lg p-3 text-xs sm:text-sm text-zinc-100 font-sans leading-relaxed whitespace-pre-wrap border border-zinc-800">
                        {renderPreview(currentText)}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <textarea
                        name={item.templateKey}
                        value={currentText}
                        onChange={(e) => handleTemplateChange(item.id, e.target.value)}
                        rows={3}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-zinc-100 text-xs sm:text-sm leading-relaxed focus:outline-none focus:border-indigo-500/60 font-sans transition-colors resize-y"
                        placeholder="Write your custom SMS notification message..."
                      />
                    </div>
                  )}

                  {/* Footer toolbar: Variable tags & character / segment count */}
                  <div className="flex items-center justify-between flex-wrap gap-2 pt-1 text-[11px]">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-zinc-500 font-medium">Insert Variable:</span>
                      {item.variables.map((v) => (
                        <button
                          key={v.name}
                          type="button"
                          onClick={() => insertVariable(item.id, v.name)}
                          className="px-2 py-0.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-indigo-300 font-mono text-[10px] border border-zinc-700/60 transition-colors"
                          title={v.desc}
                        >
                          + {v.name}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-2 text-zinc-400 font-mono text-[11px]">
                      <span>{stats.length} chars</span>
                      <span>•</span>
                      <span className={stats.parts > 1 ? "text-amber-400" : "text-emerald-400"}>
                        {stats.parts} SMS ({stats.isUnicode ? "Unicode/Bangla" : "GSM"})
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── SAVE BUTTON BAR ─── */}
      <div className="sticky bottom-4 z-20 bg-zinc-900/90 backdrop-blur-md border border-zinc-800 p-4 rounded-2xl flex items-center justify-between gap-4 shadow-2xl">
        <p className="text-xs text-zinc-400 hidden sm:block">
          Settings take effect immediately for all live orders and webhook deliveries.
        </p>
        <SubmitButton className="w-full sm:w-auto px-7 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs sm:text-sm font-semibold shadow-lg shadow-indigo-600/20 transition-all">
          Save All SMS Configuration & Routing
        </SubmitButton>
      </div>
    </ActionForm>
  );
}
