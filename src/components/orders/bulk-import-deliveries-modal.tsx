"use client";

import { useState } from "react";
import { X, UploadCloud, Loader2, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface BulkImportDeliveriesModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function BulkImportDeliveriesModal({ onClose, onSuccess }: BulkImportDeliveriesModalProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inputText, setInputText] = useState("");
  const [previewData, setPreviewData] = useState<{
    matched: any[];
    unmatched: string[];
  } | null>(null);
  
  const [results, setResults] = useState<{
    processed: number;
    errors: any[];
  } | null>(null);

  const handlePreview = async () => {
    if (!inputText.trim()) {
      toast.error("Please paste some order numbers or tracking IDs");
      return;
    }

    setIsSubmitting(true);
    try {
      const identifiers = inputText
        .split(/[\n,\t]+/)
        .map((s) => s.trim())
        .map((s) => s.replace(/^["']+|["']+$/g, ''))
        .filter((s) => s.length > 0)
        .map((s) => (/^\d+$/.test(s) ? `#${s}` : s));

      const res = await fetch("/api/deliveries/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifiers, action: "preview" }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to preview");

      setPreviewData({ matched: data.matched, unmatched: data.unmatched });
    } catch (err: any) {
      toast.error(err.message || "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExecute = async () => {
    setIsSubmitting(true);
    try {
      const identifiers = inputText
        .split(/[\n,\t]+/)
        .map((s) => s.trim())
        .map((s) => s.replace(/^["']+|["']+$/g, ''))
        .filter((s) => s.length > 0)
        .map((s) => (/^\d+$/.test(s) ? `#${s}` : s));

      const res = await fetch("/api/deliveries/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifiers, action: "execute" }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to import");

      setResults({ processed: data.processed, errors: data.errors });
      toast.success(`Processed ${data.processed} orders`);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-900/50">
          <div className="flex items-center gap-2 text-zinc-100 font-semibold">
            <UploadCloud className="w-5 h-5 text-indigo-400" />
            Bulk Delivery Import {previewData && !results && " - Preview"}
          </div>
          <button 
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
          {results ? (
            <div className="space-y-6">
              <div className="bg-zinc-950 border border-zinc-800 p-6 rounded-xl text-center">
                <h3 className="text-xl font-bold text-white mb-2">Import Complete</h3>
                <p className="text-zinc-400">
                  <span className="text-emerald-400 font-semibold">{results.processed}</span> marked as delivered.
                </p>
              </div>

              {results.errors.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-rose-400">
                    {results.errors.length} Issue(s) found:
                  </h4>
                  <div className="border border-zinc-800 rounded-xl overflow-hidden bg-zinc-950/50">
                    <table className="w-full text-sm text-left">
                      <thead className="text-xs uppercase text-zinc-500 bg-zinc-900/50 border-b border-zinc-800">
                        <tr>
                          <th className="px-4 py-3 font-medium">Identifier</th>
                          <th className="px-4 py-3 font-medium">Error</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/50">
                        {results.errors.map((err, i) => (
                          <tr key={i} className="hover:bg-zinc-900/30">
                            <td className="px-4 py-3 text-zinc-300 font-mono text-xs">
                              {err.identifier || "Batch Error"}
                            </td>
                            <td className="px-4 py-3 text-rose-400">
                              {err.error}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : previewData ? (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-emerald-400 mb-2 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  Matched Orders ({previewData.matched.length})
                </h3>
                {previewData.matched.length > 0 ? (
                  <div className="bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden divide-y divide-zinc-800">
                    {previewData.matched.map((order: any) => (
                      <div key={order.id} className="p-3 flex items-center justify-between hover:bg-zinc-900/50 transition-colors">
                        <div>
                          <p className="text-sm font-medium text-zinc-200">{order.shopify_order_name}</p>
                          <p className="text-xs text-zinc-500">{order.customer_name}</p>
                        </div>
                        <div className="text-right">
                          {order.has_existing_delivery ? (
                            <span className="text-xs font-medium bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded border border-amber-500/20">
                              Already Delivered
                            </span>
                          ) : (
                            <span className="text-xs font-medium bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20">
                              Ready
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-zinc-500 italic">No valid orders found to process.</p>
                )}
              </div>
              
              {previewData.unmatched.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-rose-400 mb-2 flex items-center gap-2">
                    <XCircle className="w-4 h-4" />
                    Unmatched Identifiers ({previewData.unmatched.length})
                  </h3>
                  <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 flex flex-wrap gap-2">
                    {previewData.unmatched.map((id: string, i: number) => (
                      <span key={i} className="text-xs bg-rose-500/10 text-rose-400 border border-rose-500/20 px-2 py-1 rounded">
                        {id}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">
                  Paste Order Numbers or Tracking IDs
                </label>
                <p className="text-xs text-zinc-500 mb-3">
                  Separate them with newlines, commas, or tabs. E.g. 1001, PDB00123, 1002
                </p>
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="1023&#10;PDB0129381&#10;1025..."
                  className="w-full h-48 p-3 bg-zinc-950 border border-zinc-800 rounded-xl text-sm
                    text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500
                    transition-all font-mono resize-none custom-scrollbar"
                />
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-zinc-800 bg-zinc-900/50 flex justify-end gap-3">
          {results ? (
            <button
              onClick={onClose}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-sm font-medium transition-colors"
            >
              Close
            </button>
          ) : (
            <>
              <button
                onClick={() => {
                  if (previewData) setPreviewData(null);
                  else onClose();
                }}
                className="px-4 py-2 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded-xl text-sm font-medium transition-colors"
                disabled={isSubmitting}
              >
                {previewData ? "Back" : "Cancel"}
              </button>

              {!previewData ? (
                <button
                  onClick={handlePreview}
                  disabled={isSubmitting || !inputText.trim()}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Preview
                </button>
              ) : (
                <button
                  onClick={handleExecute}
                  disabled={isSubmitting || previewData.matched.length === 0}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Confirm & Mark Delivered
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
