"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  Truck,
  CheckCircle2,
  Phone,
  MapPin,
  Package,
  ExternalLink,
  Printer,
  Tag,
} from "lucide-react";
import {
  StatusBadge,
  ShopifyFinancialBadge,
  ShopifyFulfillmentBadge,
} from "@/components/ui/status-badge";
import { getOrderDisplayStatus } from "@/lib/order-status";
import { DispatchModal } from "@/components/orders/dispatch-modal";
import { OrderReturnSection } from "@/components/orders/order-return-section";
import { ParcelStatusTimeline } from "@/components/orders/parcel-status-timeline";
import { formatPathaoTrackingUrl } from "@/lib/pathao/client";
import { PrintDueSlipsModal } from "@/components/orders/print-due-slips-modal";
import { PrintOrderStickersModal } from "@/components/orders/print-order-stickers-modal";

interface OrderDetailClientProps {
  order: any;
  pathaoStoreId: number | null;
}

export function OrderDetailClient({
  order: initialOrder,
  pathaoStoreId,
}: OrderDetailClientProps) {
  const router = useRouter();
  const [order, setOrder] = useState(initialOrder);
  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState(false);
  const [isDueSlipModalOpen, setIsDueSlipModalOpen] = useState(false);
  const [isOrderStickerModalOpen, setIsOrderStickerModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const activeDispatch =
    order.dispatches?.find((d: any) => !d.is_cancelled) || order.dispatches?.[0];
  const consignmentId =
    activeDispatch?.consignment_id || order.pathao_consignment_id;
  const trackingPhone =
    activeDispatch?.recipient_phone ||
    order.customer_phone ||
    order.shipping_address?.phone ||
    "";
  const trackingUrl =
    formatPathaoTrackingUrl(consignmentId, trackingPhone) ||
    order.pathao_tracking_url;
  const isDelivered =
    order.internal_status === "delivered" ||
    Boolean(order.delivered_at) ||
    getOrderDisplayStatus(order) === "delivered";

  const handleDeliver = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/deliveries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds: [order.id], delivery_type: "full" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to mark delivered");
      toast.success("Order marked as Delivered");
      setOrder((prev: any) => ({
        ...prev,
        internal_status: "delivered",
        delivered_at: new Date().toISOString(),
        pathao_delivery_status: "Delivered",
      }));
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to deliver");
    } finally {
      setIsLoading(false);
    }
  };

  const lineItems = (order.line_items as any[]) || [];
  const origTotal = Number(order.original_total_price ?? order.total_price ?? 0);

  return (
    <div className="space-y-6 animate-fade-in pb-16 max-w-5xl mx-auto">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/orders"
            className="w-9 h-9 rounded-xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 flex items-center justify-center text-zinc-300 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-white">
                Order {order.shopify_order_name}
              </h1>
              <StatusBadge status={getOrderDisplayStatus(order)} />
              {order.financial_status && (
                <ShopifyFinancialBadge status={order.financial_status} />
              )}
              <ShopifyFulfillmentBadge
                status={order.fulfillment_status || "unfulfilled"}
                currentStatus={getOrderDisplayStatus(order)}
              />
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              Shopify Order ID: {order.shopify_order_id || "—"} • Original Total: ৳
              {origTotal.toLocaleString()}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsOrderStickerModalOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
            title="Print detailed 80×100mm parcel sticker using Gprinter GP-3120TU"
          >
            <Tag className="w-3.5 h-3.5 text-amber-400" />
            Order Sticker (80×100mm)
          </button>

          <button
            type="button"
            onClick={() => setIsDueSlipModalOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
            title="Print Customer Due Slip using Gprinter GP-3120TU"
          >
            <Printer className="w-3.5 h-3.5 text-indigo-400" />
            Due Slip
          </button>

          <button
            type="button"
            onClick={() => setIsDispatchModalOpen(true)}
            disabled={isLoading}
            className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <Truck className="w-3.5 h-3.5" />
            {consignmentId ? "Re-dispatch" : "Dispatch to Pathao"}
          </button>

          {!isDelivered && (
            <button
              type="button"
              onClick={handleDeliver}
              disabled={isLoading}
              className="px-3.5 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Mark Delivered
            </button>
          )}
        </div>
      </div>

      {/* Customer, Courier & Line Items Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Recipient Info */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 border-b border-zinc-800 pb-2">
            Customer & Delivery Address
          </h2>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-zinc-500">Customer Name:</span>
              <span className="font-semibold text-zinc-200">
                {order.customer_name || "Guest"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Phone Number:</span>
              <span className="font-mono text-zinc-200 flex items-center gap-1">
                <Phone className="w-3 h-3 text-zinc-500" />
                {order.customer_phone || "—"}
              </span>
            </div>
            {order.shipping_address && (
              <div className="flex items-start justify-between gap-4 pt-1">
                <span className="text-zinc-500 shrink-0 flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> Address:
                </span>
                <span className="text-right text-zinc-300">
                  {order.shipping_address.address1 || ""}
                  {order.shipping_address.city
                    ? `, ${order.shipping_address.city}`
                    : ""}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Courier Info */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5 text-indigo-400" />
              Courier Consignment
            </h2>
            {consignmentId && (
              <span className="text-xs font-mono font-bold bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded border border-indigo-500/30">
                {consignmentId}
              </span>
            )}
          </div>

          {consignmentId ? (
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-zinc-500">Courier Status:</span>
                <span className="font-semibold text-zinc-200">
                  {order.pathao_delivery_status ||
                    activeDispatch?.pathao_order_status ||
                    "Dispatched"}
                </span>
              </div>
              <div className="pt-2">
                <a
                  href={trackingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-600/30 text-xs font-semibold"
                >
                  Track on Pathao <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          ) : (
            <p className="text-xs text-zinc-500 py-2">
              Order has not been dispatched to Pathao Courier yet.
            </p>
          )}
        </div>
      </div>

      {/* Pathao Courier Visual Status Timeline & Courier Details */}
      <ParcelStatusTimeline order={order} dispatch={activeDispatch} />

      {/* Ordered Line Items */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Ordered Products ({lineItems.length})
          </h2>
          <span className="text-xs font-mono font-bold text-zinc-200">
            Original Total: ৳{origTotal.toLocaleString()}
          </span>
        </div>

        <div className="divide-y divide-zinc-800/60">
          {lineItems.map((item: any, idx: number) => (
            <div
              key={idx}
              className="py-2.5 flex items-center justify-between text-xs"
            >
              <div>
                <p className="font-medium text-zinc-200">
                  {item.title || item.name}
                  {item.variant_title && item.variant_title !== "Default Title"
                    ? ` (${item.variant_title})`
                    : ""}
                </p>
                {item.sku && (
                  <p className="font-mono text-[11px] text-zinc-500">
                    SKU: {item.sku}
                  </p>
                )}
              </div>
              <div className="text-right font-mono">
                <span className="text-zinc-400">
                  {item.original_quantity ?? item.quantity} × ৳
                  {Number(item.price || 0).toLocaleString()}
                </span>
                <p className="text-zinc-200 font-bold mt-0.5">
                  ৳
                  {(
                    Number(item.original_quantity ?? item.quantity ?? 1) *
                    Number(item.price || 0)
                  ).toLocaleString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Section 7: Order Details Return Section Integration */}
      <OrderReturnSection
        order={order}
        onUpdated={() => {
          router.refresh();
        }}
      />

      {isDispatchModalOpen && (
        <DispatchModal
          order={order}
          storeId={pathaoStoreId}
          onClose={() => setIsDispatchModalOpen(false)}
          onSuccess={() => {
            setIsDispatchModalOpen(false);
            router.refresh();
          }}
        />
      )}

      {isDueSlipModalOpen && (
        <PrintDueSlipsModal
          isOpen={isDueSlipModalOpen}
          onClose={() => setIsDueSlipModalOpen(false)}
          orderIds={[order.id]}
        />
      )}

      {isOrderStickerModalOpen && (
        <PrintOrderStickersModal
          isOpen={isOrderStickerModalOpen}
          onClose={() => setIsOrderStickerModalOpen(false)}
          orderIds={[order.id]}
        />
      )}
    </div>
  );
}

