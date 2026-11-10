"use client";

import { useEffect, useState, useMemo } from "react";
import type { OrderStickerData, OrderStickerConfig } from "@/types/order-sticker";
import { DEFAULT_80X100_CONFIG } from "@/types/order-sticker";
import { OrderStickerThermalCard } from "@/components/orders/order-sticker-thermal-card";
import { loadOrderStickerConfig } from "@/lib/order-sticker-config";
import { Printer, RefreshCw, X } from "lucide-react";

interface OrderStickersPrintClientProps {
  orderIds: string[];
}

export function OrderStickersPrintClient({ orderIds }: OrderStickersPrintClientProps) {
  const [stickers, setStickers] = useState<OrderStickerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<OrderStickerConfig>(() => loadOrderStickerConfig());

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const res = await fetch("/api/orders/stickers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderIds,
            customDiscountReasons: config.customDiscountReasons || {},
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load order stickers data");
        setStickers(data.stickers || []);

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
  }, [orderIds, config.customDiscountReasons]);

  const validStickers = useMemo(() => stickers.filter((s) => s.isValid), [stickers]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-100 flex flex-col items-center justify-center p-6 text-center">
        <RefreshCw className="w-8 h-8 text-amber-600 animate-spin mb-3" />
        <h2 className="text-base font-bold text-zinc-900">Preparing 80×100mm Order Stickers...</h2>
        <p className="text-xs text-zinc-600 mt-1">Validating products and verified COD amounts</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-100 flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md bg-white border border-rose-200 rounded-2xl p-6 shadow-sm">
          <h2 className="text-base font-bold text-rose-600">Error Loading Stickers</h2>
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
      {/* Dynamic @page CSS rule for exact 80x100mm thermal label dimensions */}
      <style jsx global>{`
        @page {
          size: 80mm 100mm;
          margin: 0 !important;
        }
        @media print {
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            width: 80mm !important;
            height: 100mm !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* Screen Controls Toolbar (hidden during print) */}
      <div className="no-print mb-6 flex flex-wrap items-center justify-center gap-3 bg-white px-5 py-3 rounded-2xl shadow-md border border-zinc-300">
        <div className="text-xs font-semibold text-zinc-800 mr-2">
          {validStickers.length} Order Sticker(s) Ready • Gprinter GP-3120TU (80×100mm)
        </div>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow transition-colors"
        >
          <Printer size={14} />
          Print Stickers
        </button>
        <button
          onClick={() => window.close()}
          className="flex items-center gap-1 px-3 py-2 bg-zinc-200 hover:bg-zinc-300 text-zinc-800 text-xs font-semibold rounded-xl transition-colors"
        >
          <X size={14} />
          Close Tab
        </button>
      </div>

      {/* Printable Stickers Container */}
      <div className="flex flex-col items-center gap-4 print:gap-0 print:block">
        {validStickers.map((sticker, index) => (
          <div
            key={sticker.orderId}
            className="box-border print:m-0"
            style={{
              pageBreakAfter: index < validStickers.length - 1 ? "always" : "auto",
              breakAfter: index < validStickers.length - 1 ? "page" : "auto",
            }}
          >
            <OrderStickerThermalCard sticker={sticker} config={config} isPrintMode={true} />
          </div>
        ))}
      </div>
    </div>
  );
}

