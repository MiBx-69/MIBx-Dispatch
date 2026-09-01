"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { X, Truck, MapPin, Package, DollarSign, Weight } from "lucide-react";
import type { Order } from "@/types/database";

interface City { city_id: number; city_name: string; }
interface Zone { zone_id: number; zone_name: string; }
interface Area { area_id: number; area_name: string; }
interface Store { store_id: number; store_name: string; store_address: string; }

interface DispatchModalProps {
  order: Order;
  storeId?: number | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function DispatchModal({ order, storeId, onClose, onSuccess }: DispatchModalProps) {
  const lineItems = (order.line_items as any[]) || [];
  const shippingAddr = order.shipping_address as any;

  const [cities, setCities] = useState<City[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingLocations, setLoadingLocations] = useState(true);

  const [form, setForm] = useState({
    store_id: String(storeId || ""),
    recipient_name: order.customer_name || shippingAddr?.name || "",
    recipient_phone: order.customer_phone || shippingAddr?.phone || "",
    recipient_address: shippingAddr?.address1 || "",
    recipient_city: "",
    recipient_zone: "",
    recipient_area: "",
    delivery_type: "48",    // 48=Normal, 12=On-demand
    item_type: "2",          // 2=Parcel
    item_quantity: String(lineItems.reduce((s: number, i: any) => s + (i.quantity || 1), 0) || 1),
    item_weight: "0.5",
    amount_to_collect: String(order.total_price || 0),
    item_description: lineItems.map((i: any) => i.title).join(", ").slice(0, 100),
    special_instruction: order.note || "",
  });

  // Load cities and stores
  useEffect(() => {
    fetch("/api/pathao/cities")
      .then((r) => r.json())
      .then((d) => {
        setCities(d.cities || []);
        setLoadingLocations(false);
      })
      .catch(() => setLoadingLocations(false));

    fetch("/api/pathao/stores")
      .then((r) => r.json())
      .then((d) => setStores(d.stores || []));
  }, []);

  // Load zones when city changes
  useEffect(() => {
    if (!form.recipient_city) { setZones([]); setAreas([]); return; }
    fetch(`/api/pathao/zones?city_id=${form.recipient_city}`)
      .then((r) => r.json())
      .then((d) => setZones(d.zones || []));
  }, [form.recipient_city]);

  // Load areas when zone changes
  useEffect(() => {
    if (!form.recipient_zone) { setAreas([]); return; }
    fetch(`/api/pathao/areas?zone_id=${form.recipient_zone}`)
      .then((r) => r.json())
      .then((d) => setAreas(d.areas || []));
  }, [form.recipient_zone]);

  const set = (field: string, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const handleDispatch = async () => {
    if (!form.store_id) { toast.error("Please select a pickup store"); return; }
    if (!form.recipient_phone) { toast.error("Recipient phone is required"); return; }

    setLoading(true);
    try {
      const res = await fetch("/api/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          order_id: order.id,
          store_id: parseInt(form.store_id),
          recipient_city: form.recipient_city ? parseInt(form.recipient_city) : undefined,
          recipient_zone: form.recipient_zone ? parseInt(form.recipient_zone) : undefined,
          recipient_area: form.recipient_area ? parseInt(form.recipient_area) : undefined,
          delivery_type: parseInt(form.delivery_type),
          item_type: parseInt(form.item_type),
          item_quantity: parseInt(form.item_quantity),
          item_weight: parseFloat(form.item_weight),
          amount_to_collect: parseFloat(form.amount_to_collect),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Dispatch failed");

      toast.success(`Dispatched! Consignment: ${data.consignment_id}`, {
        description: `Delivery fee: ৳${data.delivery_fee}`,
        duration: 5000,
      });
      onSuccess();
    } catch (err: any) {
      toast.error(err.message || "Dispatch failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full sm:max-w-lg bg-zinc-900 border border-zinc-800 rounded-t-2xl sm:rounded-2xl
                     overflow-hidden shadow-2xl max-h-[95dvh] flex flex-col animate-slide-in">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <div>
            <h2 className="text-base font-bold text-zinc-100">Dispatch Order</h2>
            <p className="text-xs text-zinc-500">{order.shopify_order_name} · {order.customer_name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Order summary */}
        <div className="px-4 py-3 bg-zinc-800/50 border-b border-zinc-800">
          <div className="flex gap-4 text-xs">
            <div>
              <p className="text-zinc-500">Items</p>
              <p className="text-zinc-200 font-medium mt-0.5">
                {lineItems.map((i: any) => `${i.title} ×${i.quantity}`).join(", ").slice(0, 60)}
              </p>
            </div>
            <div className="ml-auto text-right shrink-0">
              <p className="text-zinc-500">COD Amount</p>
              <p className="text-emerald-400 font-bold mt-0.5 text-base">৳{Number(order.total_price).toLocaleString()}</p>
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          {/* Pickup Store */}
          <Section icon={<MapPin size={14} />} title="Pickup Store">
            <Field label="Store *">
              <select value={form.store_id} onChange={(e) => set("store_id", e.target.value)} className={selectCls}>
                <option value="">Select a store</option>
                {stores.map((s) => (
                  <option key={s.store_id} value={s.store_id}>{s.store_name} {s.store_address ? `- ${s.store_address}` : ""}</option>
                ))}
              </select>
            </Field>
          </Section>

          {/* Recipient */}
          <Section icon={<Package size={14} />} title="Recipient Details">
            <InputRow>
              <Field label="Name">
                <input value={form.recipient_name} onChange={(e) => set("recipient_name", e.target.value)}
                  className={inputCls} placeholder="Recipient name" />
              </Field>
              <Field label="Phone *">
                <input value={form.recipient_phone} onChange={(e) => set("recipient_phone", e.target.value)}
                  className={inputCls} placeholder="01XXXXXXXXX" />
              </Field>
            </InputRow>
            <Field label="Address">
              <input value={form.recipient_address} onChange={(e) => set("recipient_address", e.target.value)}
                className={inputCls} placeholder="House, Road, Area" />
            </Field>
          </Section>



          {/* Parcel Details */}
          <Section icon={<Weight size={14} />} title="Parcel Details">
            <InputRow>
              <Field label="Weight (kg)">
                <input type="number" step="0.1" min="0.1" value={form.item_weight}
                  onChange={(e) => set("item_weight", e.target.value)} className={inputCls} />
              </Field>
              <Field label="Quantity">
                <input type="number" min="1" value={form.item_quantity}
                  onChange={(e) => set("item_quantity", e.target.value)} className={inputCls} />
              </Field>
            </InputRow>
            <InputRow>
              <Field label="Delivery Type">
                <select value={form.delivery_type} onChange={(e) => set("delivery_type", e.target.value)} className={selectCls}>
                  <option value="48">Normal (48h)</option>
                  <option value="12">On-Demand (Same day)</option>
                </select>
              </Field>
              <Field label="Item Type">
                <select value={form.item_type} onChange={(e) => set("item_type", e.target.value)} className={selectCls}>
                  <option value="2">Parcel</option>
                  <option value="1">Document</option>
                </select>
              </Field>
            </InputRow>
            <Field label="Description">
              <input value={form.item_description} onChange={(e) => set("item_description", e.target.value)}
                className={inputCls} placeholder="Item description" maxLength={100} />
            </Field>
          </Section>

          {/* Payment */}
          <Section icon={<DollarSign size={14} />} title="Payment">
            <Field label="Amount to Collect (COD) ৳">
              <input type="number" value={form.amount_to_collect}
                onChange={(e) => set("amount_to_collect", e.target.value)}
                className={`${inputCls} text-emerald-400 font-bold`} />
            </Field>
            <Field label="Special Instruction">
              <input value={form.special_instruction} onChange={(e) => set("special_instruction", e.target.value)}
                className={inputCls} placeholder="e.g. Handle with care" />
            </Field>
          </Section>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-800 bg-zinc-900">
          <button
            onClick={handleDispatch}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-indigo-600
                      hover:bg-indigo-500 text-white font-bold text-sm transition-colors
                      disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Dispatching...
              </>
            ) : (
              <>
                <Truck size={16} />
                Dispatch to Pathao
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// Helpers
const inputCls = "w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500";
const selectCls = "w-full px-2.5 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-indigo-500";

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
        {icon}{title}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function InputRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-2">{children}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-zinc-500 mb-1">{label}</label>
      {children}
    </div>
  );
}
