"use client";

import { useState, useEffect } from "react";
import { CheckCircle2, X } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

const RETURN_REASONS = [
  "Customer Refused",
  "Wrong Address",
  "Customer Unreachable",
  "Damaged in Transit",
  "Wrong Item Sent",
  "Customer Changed Mind",
  "Address Not Found",
  "Payment Issue",
  "Other",
];

interface DeliverModalProps {
  orders: any[];
  onClose: () => void;
  onSuccess: () => void;
}

export function DeliverModal({ orders, onClose, onSuccess }: DeliverModalProps) {
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isBulk = orders.length > 1;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const payload: any = {
        orderIds: orders.map(o => o.id),
        delivery_type: "full",
        notes: notes || null,
      };

      const res = await fetch("/api/deliveries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to process delivery");
      }

      if (data.processed > 0) {
        toast.success(`${data.processed} order(s) marked as delivered`);
      }
      if (data.failed > 0) {
        toast.warning(`${data.failed} order(s) could not be delivered`, {
          description: data.errors?.[0]?.error || "Some orders failed to update",
        });
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-5 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5 text-emerald-400">
            <CheckCircle2 size={20} />
            <h3 className="font-semibold text-zinc-100">
              {isBulk ? `Deliver ${orders.length} Orders` : "Mark Order as Delivered"}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 transition-colors p-1 rounded-lg hover:bg-zinc-800"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-xs text-emerald-300">
            {isBulk ? (
              <span>Marking <strong>{orders.length}</strong> orders as delivered. This updates their status in the ERP and on Shopify.</span>
            ) : (
              <span>Marking order <strong>{orders[0]?.shopify_order_name}</strong> as delivered. This updates the order status in the ERP and on Shopify.</span>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Notes (Optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Any additional notes about the delivery..."
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-zinc-100 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all placeholder:text-zinc-600 resize-none"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isSubmitting}
            className={`w-full py-2.5 rounded-xl text-white font-semibold flex items-center justify-center gap-2 transition-all
              bg-emerald-500 hover:bg-emerald-600 ${isSubmitting ? "opacity-70 cursor-not-allowed" : ""}`}
          >
            {isSubmitting ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <CheckCircle2 size={18} />
                {`Confirm Delivery${isBulk ? ` (${orders.length})` : ""}`}
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
