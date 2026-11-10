"use client";

import { useEffect, useState, useMemo } from "react";
import type { DueSlipData, PrinterPaperConfig } from "@/types/due-slip";
import { GPRINTER_PRESET } from "@/types/due-slip";
import { DueSlipThermalCard } from "@/components/orders/due-slip-thermal-card";
import { loadPrinterConfig } from "@/lib/printer-config";
import { Printer, RefreshCw, X, ArrowLeft } from "lucide-react";

interface DueSlipsPrintClientProps {
  orderIds: string[];
  initialWidth?: number;
  initialHeight?: number;
  initialUnit?: "in" | "mm";
}

export function DueSlipsPrintClient({
  orderIds,
  initialWidth,
  initialHeight,
  initialUnit,
}: DueSlipsPrintClientProps) {
  const [slips, setSlips] = useState<DueSlipData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<PrinterPaperConfig>(() => {
    const saved = loadPrinterConfig();
    return {
      ...saved,
      width: initialWidth || saved.width || GPRINTER_PRESET.width,
      height: initialHeight || saved.height || GPRINTER_PRESET.height,
      unit: initialUnit || saved.unit || GPRINTER_PRESET.unit,
    };
  });

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const res = await fetch("/api/orders/due-slips", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderIds }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load due slips data");
        setSlips(data.slips || []);

        // Trigger print after brief rendering delay
        setTimeout(() => {
          if (typeof window !== "undefined") {
            window.print();
          }
        }, 800);
      } catch (err: any) {
        setError(err.message || "An error occurred");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [orderIds]);

  const validSlips = useMemo(() => slips.filter((s) => s.isValid), [slips]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-100 flex flex-col items-center justify-center p-6 text-center">
        <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin mb-3" />
        <h2 className="text-base font-bold text-zinc-900">Preparing Customer Due Slips...</h2>
        <p className="text-xs text-zinc-600 mt-1">Retrieving latest Shopify order amounts</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-100 flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md bg-white border border-rose-200 rounded-2xl p-6 shadow-sm">
          <h2 className="text-base font-bold text-rose-600">Error Loading Slips</h2>
          <p className="text-xs text-zinc-700 mt-2">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-zinc-900 text-white rounded-lg text-xs font-semibold"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-zinc-200 min-h-screen text-black print:bg-white flex flex-col items-center py-8 print:py-0">
      {/* Dynamic @page CSS rule for exact thermal label dimensions */}
      <style jsx global>{`
        @page {
          size: ${config.width}${config.unit} ${config.height}${config.unit};
          margin: 0 !important;
        }
        @media print {
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* Screen Controls Toolbar (hidden during print) */}
      <div className="no-print mb-6 flex flex-wrap items-center justify-center gap-3 bg-white px-5 py-3 rounded-2xl shadow-md border border-zinc-300">
        <div className="text-xs font-semibold text-zinc-800 mr-2">
          {validSlips.length} Slip(s) Ready • {config.width}&quot; × {config.height}&quot; (Gprinter)
        </div>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow transition-colors"
        >
          <Printer size={14} />
          Print Slips
        </button>
        <button
          onClick={() => window.close()}
          className="flex items-center gap-1 px-3 py-2 bg-zinc-200 hover:bg-zinc-300 text-zinc-800 text-xs font-semibold rounded-xl transition-colors"
        >
          <X size={14} />
          Close Tab
        </button>
      </div>

      {/* Printable Slips Container */}
      <div className="flex flex-col items-center gap-4 print:gap-0 print:block">
        {validSlips.map((slip, index) => (
          <div
            key={slip.id}
            className="box-border print:m-0"
            style={{
              pageBreakAfter: index < validSlips.length - 1 ? "always" : "auto",
              breakAfter: index < validSlips.length - 1 ? "page" : "auto",
            }}
          >
            <DueSlipThermalCard slip={slip} config={config} isPrintMode={true} />
          </div>
        ))}
      </div>
    </div>
  );
}

