"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { X, Truck, MapPin, Package, Weight } from "lucide-react";

interface Store { store_id: number; store_name: string; store_address: string; }

interface BulkDispatchModalProps {
  orderIds: string[];
  storeId?: number | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function BulkDispatchModal({ orderIds, storeId, onClose, onSuccess }: BulkDispatchModalProps) {
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    store_id: String(storeId || ""),
    delivery_type: "48",
    item_type: "2",
    item_weight: "0.5",
  });

  useEffect(() => {
    fetch("/api/pathao/stores")
      .then((r) => r.json())
      .then((d) => setStores(d.stores || []));
  }, []);

  const set = (field: string, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const handleDispatch = async () => {
    if (!form.store_id) { toast.error("Please select a pickup store"); return; }

    setLoading(true);
    try {
      const res = await fetch("/api/dispatch", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_ids: orderIds,
          dispatch_params: {
            store_id: parseInt(form.store_id),
            delivery_type: parseInt(form.delivery_type),
            item_type: parseInt(form.item_type),
            item_weight: parseFloat(form.item_weight),
          }
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Bulk dispatch failed");

      // Check for partial errors
      const successes = data.results.filter((r: any) => !r.error);
      const errors = data.results.filter((r: any) => r.error);

      if (errors.length > 0) {
        toast.error(`Dispatched ${successes.length}, Failed ${errors.length}`, {
          description: `First error: ${errors[0].error}`,
          duration: 6000,
        });
      } else {
        toast.success(`Successfully dispatched ${successes.length} orders!`);
      }
      
      onSuccess();
    } catch (err: any) {
      toast.error(err.message || "Bulk dispatch failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full sm:max-w-md bg-zinc-900 border border-zinc-800 rounded-t-2xl sm:rounded-2xl
                     overflow-hidden shadow-2xl flex flex-col animate-slide-in">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <div>
            <h2 className="text-base font-bold text-zinc-100">Bulk Dispatch</h2>
            <p className="text-xs text-zinc-500">{orderIds.length} orders selected</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <div className="p-4 space-y-4">
          <div className="p-3 bg-indigo-600/10 border border-indigo-500/20 rounded-lg">
            <p className="text-xs text-indigo-300">
              Bulk dispatch will use the customer's shipping address and total price from Shopify automatically. Only general parcel details are needed.
            </p>
          </div>

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

          <Section icon={<Weight size={14} />} title="Default Parcel Details">
            <div className="grid grid-cols-2 gap-2 mb-2">
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
            </div>
            <Field label="Weight per package (kg)">
              <input type="number" step="0.1" min="0.1" value={form.item_weight}
                onChange={(e) => set("item_weight", e.target.value)} className={inputCls} />
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
            {loading ? "Dispatching..." : (
              <>
                <Truck size={16} />
                Dispatch {orderIds.length} Orders
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-zinc-500 mb-1">{label}</label>
      {children}
    </div>
  );
}
