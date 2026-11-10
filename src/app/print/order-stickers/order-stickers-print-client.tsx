"use client";

import { useEffect, useState, useMemo } from "react";
import type { OrderStickerData, OrderStickerConfig } from "@/types/order-sticker";
import { DEFAULT_75X100_CONFIG } from "@/types/order-sticker";
import { OrderStickerThermalCard } from "@/components/orders/order-sticker-thermal-card";
import { loadOrderStickerConfig } from "@/lib/order-sticker-config";
import { Printer, RefreshCw, X } from "lucide-react";

interface OrderStickersPrintClientProps {
  orderIds: string[];
  isEmbedded?: boolean;
  authToken?: string;
}

export function OrderStickersPrintClient({
  orderIds,
  isEmbedded = false,
  authToken,
}: OrderStickersPrintClientProps) {
  const [stickers, setStickers] = useState<OrderStickerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<OrderStickerConfig>(() => loadOrderStickerConfig());

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (authToken) {
          headers["Authorization"] = `Bearer ${authToken}`;
        }

        const res = await fetch("/api/orders/stickers", {
          method: "POST",
          headers,
          body: JSON.stringify({
            orderIds,
            customDiscountReasons: config.customDiscountReasons || {},
            token: authToken,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load order stickers data");
        setStickers(data.stickers || []);

        // Only auto-trigger window.print() if opened directly in a standalone browser tab
        // (Do NOT trigger nested print popups when embedded inside Shopify Admin's Print Action modal)
        if (!isEmbedded) {
          setTimeout(() => {
            if (typeof window !== "undefined") {
              window.print();
            }
          }, 800);
        }
      } catch (err: any) {
        setError(err.message || "An error occurred");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [orderIds, config.customDiscountReasons, isEmbedded, authToken]);

  const validStickers = useMemo(() => stickers.filter((s) => s.isValid), [stickers]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 text-center">
        <RefreshCw className="w-7 h-7 text-amber-600 animate-spin mb-3" />
        <h2 className="text-sm font-bold text-zinc-900">Preparing 75×100mm Order Stickers...</h2>
        <p className="text-xs text-zinc-600 mt-1">Direct Thermal (203 DPI) • Verifying Shopify items &amp; COD</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md bg-white border border-rose-200 rounded-2xl p-6 shadow-sm">
          <h2 className="text-sm font-bold text-rose-600">Error Generating Stickers</h2>
          <p className="text-xs text-zinc-700 mt-2">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-1.5 bg-zinc-900 text-white rounded-lg text-xs font-semibold"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen text-black print:bg-white flex flex-col items-center ${isEmbedded ? "bg-white py-0" : "bg-zinc-200 py-8 print:py-0"}`}>
      {/* Dynamic @page CSS rule for exact 75x100mm thermal label dimensions */}
      <style jsx global>{`
        @page {
          size: 75mm 100mm;
          margin: 0 !important;
        }
        @media print {
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            width: 75mm !important;
            height: 100mm !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* Screen Controls Toolbar (hidden during print and hidden if embedded in Shopify modal) */}
      {!isEmbedded && (
        <div className="no-print mb-6 flex flex-wrap items-center justify-center gap-3 bg-white px-5 py-3 rounded-2xl shadow-md border border-zinc-300">
          <div className="text-xs font-semibold text-zinc-800 mr-2">
            {validStickers.length} Order Sticker(s) Ready • 75×100mm Thermal
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
      )}

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
