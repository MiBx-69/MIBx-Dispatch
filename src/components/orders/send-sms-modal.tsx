"use client";

import { useState } from "react";
import { X, Send, Phone, MessageSquare, Loader2 } from "lucide-react";
import { sendSMSAction } from "@/app/(dashboard)/orders/actions";

interface SendSMSModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: any;
}

export function SendSMSModal({ isOpen, onClose, order }: SendSMSModalProps) {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSend = async () => {
    if (!message.trim()) {
      setError("Message cannot be empty");
      return;
    }

    const phone = order?.shipping_address?.phone || order?.customers?.phone;
    if (!phone) {
      setError("No phone number found for this customer");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess(false);

    try {
      const result = await sendSMSAction(phone, message);
      if (result.success) {
        setSuccess(true);
        setTimeout(() => {
          onClose();
          setSuccess(false);
          setMessage("");
        }, 2000);
      } else {
        setError(result.error || "Failed to send SMS");
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  const phone = order?.shipping_address?.phone || order?.customers?.phone || "No phone number";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div 
        className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800/50 bg-zinc-900/50">
          <div className="flex items-center gap-2 text-zinc-100">
            <div className="p-1.5 bg-indigo-500/10 rounded-lg">
              <MessageSquare className="w-4 h-4 text-indigo-400" />
            </div>
            <h3 className="font-semibold text-sm">Send SMS</h3>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between bg-zinc-950 p-3 rounded-xl border border-zinc-800/50">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-zinc-300">
                  {order?.customers?.name?.charAt(0) || "?"}
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-200 truncate">{order?.customers?.name || "Customer"}</p>
                <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                  <Phone size={10} />
                  <span className="truncate">{phone}</span>
                </div>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-zinc-800 text-zinc-400">
              {order?.shopify_order_name}
            </span>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-400">Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your message here..."
              rows={4}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-zinc-200 text-sm focus:outline-none focus:border-indigo-500/50 resize-none transition-colors"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-xs text-red-400 font-medium">{error}</p>
            </div>
          )}

          {success && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
              <p className="text-xs text-emerald-400 font-medium">Message sent successfully!</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-zinc-800/50 bg-zinc-900/50">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={loading || success || !message.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            Send Message
          </button>
        </div>
      </div>
    </div>
  );
}
