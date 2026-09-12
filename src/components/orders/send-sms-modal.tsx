"use client";

import { useState } from "react";
import { X, Send, Phone, MessageSquare, Loader2 } from "lucide-react";
import { sendSMSAction } from "@/app/(dashboard)/orders/actions";
import { toast } from "sonner";

interface SendSMSModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: any;
}

const TEMPLATES = [
  "Hello, your order is ready for dispatch.",
  "Hi, we couldn't reach you. Please let us know when you're available.",
  "Your parcel is out for delivery today.",
  "Thank you for shopping with us!"
];

export function SendSMSModal({ isOpen, onClose, order }: SendSMSModalProps) {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const phone = order?.shipping_address?.phone || order?.customer_phone || order?.customers?.phone || "No phone number";
  const customerName = order?.customer_name || order?.customers?.name || "Customer";

  const handleSendSMS = async () => {
    if (!message.trim()) {
      toast.error("Message cannot be empty");
      return;
    }

    if (!phone || phone === "No phone number") {
      toast.error("No phone number found for this customer");
      return;
    }

    setLoading(true);

    try {
      const result = await sendSMSAction(phone, message, {
        orderId: order?.shopify_order_id,
        orderName: order?.shopify_order_name,
        customerName: order?.customer_name,
      });
      if (result.success) {
        toast.success("Message sent successfully!");
        setTimeout(() => {
          onClose();
          setMessage("");
        }, 1000);
      } else {
        toast.error(result.error || "Failed to send SMS");
      }
    } catch (err: any) {
      toast.error(err.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleSendWhatsApp = () => {
    if (!message.trim()) {
      toast.error("Message cannot be empty");
      return;
    }

    if (!phone || phone === "No phone number") {
      toast.error("No phone number found for this customer");
      return;
    }

    let waPhone = phone.replace(/[^0-9]/g, "");
    if (waPhone.startsWith("01")) {
      waPhone = "88" + waPhone;
    } else if (!waPhone.startsWith("880") && waPhone.startsWith("1")) {
      waPhone = "880" + waPhone;
    }

    const encodedMessage = encodeURIComponent(message);
    window.open(`https://wa.me/${waPhone}?text=${encodedMessage}`, "_blank");
    onClose();
    setMessage("");
  };

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
            <h3 className="font-semibold text-sm">Send Message</h3>
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
                  {customerName.charAt(0) || "?"}
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-200 truncate">{customerName}</p>
                <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                  <Phone size={10} />
                  <span className="truncate">{phone}</span>
                </div>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-zinc-800 text-zinc-400">
              {order?.shopify_order_name || "N/A"}
            </span>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-400">Quick Templates</label>
            <div className="flex flex-wrap gap-2">
              {TEMPLATES.map((tmpl, idx) => (
                <button
                  key={idx}
                  onClick={() => setMessage(tmpl)}
                  className="text-xs px-2 py-1.5 bg-zinc-950 hover:bg-zinc-800 border border-zinc-800/80 rounded-md transition-colors text-left text-zinc-300 hover:text-zinc-100"
                >
                  {tmpl.substring(0, 30)}...
                </button>
              ))}
            </div>
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
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-zinc-800/50 bg-zinc-900/50">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-zinc-200 transition-colors mr-auto"
          >
            Cancel
          </button>
          
          <button
            onClick={handleSendWhatsApp}
            disabled={loading || !message.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-[#25D366]/20 text-[#25D366] hover:bg-[#25D366]/30 border border-[#25D366]/30 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors"
          >
            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
            </svg>
            WhatsApp
          </button>

          <button
            onClick={handleSendSMS}
            disabled={loading || !message.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            Send SMS
          </button>
        </div>
      </div>
    </div>
  );
}

