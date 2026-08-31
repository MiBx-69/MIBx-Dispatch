"use client";

import { useState } from "react";
import { X, AlertTriangle } from "lucide-react";
import { reportFraudAction } from "@/app/(dashboard)/orders/actions";

interface ReportFraudModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: any;
}

const CATEGORIES = [
  { id: "product_not_received", label: "Product Not Received" },
  { id: "product_not_returned", label: "Product Not Returned" },
  { id: "fake_address", label: "Fake Address" },
  { id: "phone_unreachable", label: "Phone Unreachable" },
  { id: "refused_delivery", label: "Refused Delivery" },
  { id: "partial_payment", label: "Partial Payment" },
  { id: "chargeback", label: "Chargeback" },
  { id: "fake_identity", label: "Fake Identity" },
  { id: "repeated_offender", label: "Repeated Offender" },
  { id: "other", label: "Other" }
];

export function ReportFraudModal({ isOpen, onClose, order }: ReportFraudModalProps) {
  const [complainDetails, setComplainDetails] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const toggleCategory = (catId: string) => {
    if (categories.includes(catId)) {
      setCategories(categories.filter(id => id !== catId));
    } else {
      setCategories([...categories, catId]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!complainDetails.trim()) {
      setError("Complain details are required");
      return;
    }
    if (categories.length === 0) {
      setError("Select at least one category");
      return;
    }

    setSubmitting(true);
    setError(null);

    const payload = {
      contact_number: order.customer_phone?.replace(/\D/g, ""),
      contact_name: order.customer_name || "Unknown",
      complain_details: complainDetails,
      categories: categories,
      parcel_id: order.pathao_consignment_id || order.shopify_order_name,
      is_anonymous: isAnonymous
    };

    const res = await reportFraudAction(payload);
    
    if (res.success) {
      setSuccess(true);
      setTimeout(() => {
        onClose();
        setSuccess(false);
        setComplainDetails("");
        setCategories([]);
        setIsAnonymous(false);
      }, 2000);
    } else {
      setError(res.error || "Failed to submit fraud report");
    }
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-600">
              <AlertTriangle size={18} />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Report Fraud Customer</h2>
          </div>
          <button 
            onClick={onClose}
            className="p-1 rounded-md hover:bg-gray-100 text-gray-500 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto flex-1">
          {success ? (
            <div className="py-8 text-center">
              <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900">Report Submitted</h3>
              <p className="text-gray-500 mt-1">Thank you for reporting to FraudSpy.</p>
            </div>
          ) : (
            <form id="fraud-form" onSubmit={handleSubmit} className="space-y-4">
              
              <div className="bg-gray-50 p-3 rounded-lg border border-gray-100 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-gray-500 text-xs block">Customer</span>
                    <span className="font-medium text-gray-900">{order.customer_name || "Unknown"}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs block">Phone</span>
                    <span className="font-medium text-gray-900">{order.customer_phone || "N/A"}</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reason for Reporting <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {CATEGORIES.map(cat => (
                    <label 
                      key={cat.id} 
                      className={`flex items-center p-2 border rounded cursor-pointer transition-colors ${
                        categories.includes(cat.id) 
                          ? "border-red-500 bg-red-50 text-red-700" 
                          : "border-gray-200 hover:bg-gray-50 text-gray-700"
                      }`}
                    >
                      <input 
                        type="checkbox" 
                        className="sr-only"
                        checked={categories.includes(cat.id)}
                        onChange={() => toggleCategory(cat.id)}
                      />
                      <span className="text-xs font-medium">{cat.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Details <span className="text-red-500">*</span>
                </label>
                <textarea
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 text-sm"
                  rows={3}
                  placeholder="Describe what happened..."
                  value={complainDetails}
                  onChange={(e) => setComplainDetails(e.target.value)}
                  required
                />
              </div>

              <div className="flex items-center gap-2 mt-2">
                <input
                  type="checkbox"
                  id="anonymous"
                  checked={isAnonymous}
                  onChange={(e) => setIsAnonymous(e.target.checked)}
                  className="rounded text-red-600 focus:ring-red-500 w-4 h-4"
                />
                <label htmlFor="anonymous" className="text-sm text-gray-600 cursor-pointer">
                  Submit anonymously (hide your business name)
                </label>
              </div>

              {error && (
                <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm flex items-start gap-2">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  <p>{error}</p>
                </div>
              )}
            </form>
          )}
        </div>

        {/* Footer */}
        {!success && (
          <div className="p-4 border-t bg-gray-50 flex justify-end gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="fraud-form"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 flex items-center gap-2"
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Submitting...</span>
                </>
              ) : (
                <span>Submit Report</span>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
