"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MessageSquare, Phone, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface MessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  customerName: string;
  customerPhone: string;
}

const TEMPLATES = [
  "Hello, your order is ready for dispatch.",
  "Hi, we couldn't reach you. Please let us know when you're available.",
  "Your parcel is out for delivery today.",
  "Thank you for shopping with us!"
];

export function MessageModal({ isOpen, onClose, customerName, customerPhone }: MessageModalProps) {
  const [message, setMessage] = useState("");
  const [isSendingSMS, setIsSendingSMS] = useState(false);

  const handleSendSMS = async () => {
    if (!message.trim()) {
      toast.error("Please enter a message");
      return;
    }
    
    setIsSendingSMS(true);
    try {
      const res = await fetch("/api/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: customerPhone, message }),
      });
      const data = await res.json();
      
      if (res.ok) {
        toast.success("SMS sent successfully!");
        onClose();
      } else {
        toast.error(data.error || "Failed to send SMS");
      }
    } catch (error) {
      toast.error("An error occurred while sending SMS");
    } finally {
      setIsSendingSMS(false);
    }
  };

  const handleSendWhatsApp = () => {
    if (!message.trim()) {
      toast.error("Please enter a message");
      return;
    }
    
    // Format phone for WhatsApp (requires country code, e.g., 880)
    let waPhone = customerPhone.replace(/[^0-9]/g, "");
    if (waPhone.startsWith("01")) {
      waPhone = "88" + waPhone;
    } else if (!waPhone.startsWith("880") && waPhone.startsWith("1")) {
      waPhone = "880" + waPhone;
    }

    const encodedMessage = encodeURIComponent(message);
    window.open(`https://wa.me/${waPhone}?text=${encodedMessage}`, "_blank");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md bg-zinc-950 border-zinc-800 text-zinc-100">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-zinc-100">
            <MessageSquare className="w-5 h-5 text-indigo-400" />
            Message {customerName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex items-center gap-2 text-sm text-zinc-400 bg-zinc-900/50 p-2 rounded-lg border border-zinc-800">
            <Phone className="w-4 h-4" />
            {customerPhone}
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-400">Quick Templates</label>
            <div className="flex flex-wrap gap-2">
              {TEMPLATES.map((tmpl, idx) => (
                <button
                  key={idx}
                  onClick={() => setMessage(tmpl)}
                  className="text-xs px-2 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-md transition-colors text-left text-zinc-300 hover:text-zinc-100"
                >
                  {tmpl.substring(0, 30)}...
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-300">Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-100
                         focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500
                         placeholder:text-zinc-600 resize-none"
              placeholder="Type your message here..."
            />
            <div className="text-xs text-zinc-500 text-right">
              {message.length} characters
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-zinc-100 transition-colors"
          >
            Cancel
          </button>
          
          <button
            onClick={handleSendWhatsApp}
            className="flex items-center gap-2 px-4 py-2 bg-[#25D366]/20 text-[#25D366] hover:bg-[#25D366]/30 border border-[#25D366]/30 rounded-lg text-sm font-medium transition-colors"
          >
            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
            </svg>
            WhatsApp
          </button>
          
          <button
            onClick={handleSendSMS}
            disabled={isSendingSMS}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {isSendingSMS ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {isSendingSMS ? "Sending..." : "Send SMS"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
