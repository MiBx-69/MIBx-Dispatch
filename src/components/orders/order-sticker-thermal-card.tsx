import React from "react";
import type { OrderStickerData, OrderStickerConfig } from "@/types/order-sticker";

interface OrderStickerThermalCardProps {
  sticker: OrderStickerData;
  config: OrderStickerConfig;
  className?: string;
  isPrintMode?: boolean;
}

export function OrderStickerThermalCard({
  sticker,
  config,
  className = "",
  isPrintMode = false,
}: OrderStickerThermalCardProps) {
  const storeName = (config.storeNameOverride?.trim() || sticker.storeName || "UNIVERSES").toUpperCase();
  const financials = sticker.financials;
  const isPrepaid = financials.isPrepaid || financials.codAmount <= 0;

  // Exact 75mm x 100mm physical dimensions
  const widthVal = `${config.width}${config.unit}`;
  const heightVal = `${config.height}${config.unit}`;

  // Item count for adaptive layout
  const itemCount = sticker.items.length;

  // Balanced centered margins: 3.0mm horizontal (69.0mm printable width), 2.5mm vertical (95.0mm height)
  const topOffset = config.topOffsetMm || 0;
  const leftOffset = config.leftOffsetMm || 0;
  const padTop = Math.max(0.5, 2.5 + topOffset);
  const padBottom = Math.max(0.5, 2.5 - topOffset);
  const padLeft = Math.max(0.5, 3.0 + leftOffset);
  const padRight = Math.max(0.5, 3.0 - leftOffset);

  // Dynamic typography hierarchy: clean, readable, not too bold, not too small
  const pNameSize =
    itemCount === 1
      ? "text-[12.5px]"
      : itemCount === 2
      ? "text-[11.5px]"
      : itemCount <= 4
      ? "text-[10px]"
      : "text-[9px]";

  const pPriceSize =
    itemCount === 1
      ? "text-[13px]"
      : itemCount === 2
      ? "text-[12px]"
      : itemCount <= 4
      ? "text-[10.5px]"
      : "text-[9.5px]";

  const pMetaSize =
    itemCount === 1
      ? "text-[10px]"
      : itemCount === 2
      ? "text-[9px]"
      : itemCount <= 4
      ? "text-[8px]"
      : "text-[7.5px]";

  const pRowGap =
    itemCount === 1
      ? "py-1.5"
      : itemCount === 2
      ? "py-1"
      : itemCount <= 4
      ? "py-0.5"
      : "py-0.2";

  return (
    <div
      className={`order-sticker box-border bg-white text-black font-sans flex flex-col justify-between select-none overflow-hidden ${
        isPrintMode
          ? "border-0 shadow-none m-0"
          : "border border-zinc-400 rounded shadow-md"
      } ${className}`}
      style={{
        width: widthVal,
        height: heightVal,
        maxWidth: widthVal,
        maxHeight: heightVal,
        // Centered clean printable zone: ~69mm width x ~95mm height with proper balanced margins
        padding: `${padTop}mm ${padRight}mm ${padBottom}mm ${padLeft}mm`,
        pageBreakAfter: "always",
        breakAfter: "page",
        pageBreakInside: "avoid",
        breakInside: "avoid",
        WebkitPrintColorAdjust: "exact",
        printColorAdjust: "exact",
      }}
    >
      {/* ─── SECTION A: Store Header ─── */}
      <div className="w-full border-b border-black pb-1 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 overflow-hidden">
            <span className="text-[14px] font-bold tracking-wider uppercase truncate text-black leading-none">
              {storeName}
            </span>
            <span className="text-[8px] font-bold text-black uppercase tracking-wider shrink-0 border border-black px-1 py-0.2 rounded-xs leading-none">
              DISPATCH
            </span>
          </div>
          <div className="text-right shrink-0">
            <span className="text-[15px] font-bold tracking-tight text-black leading-none font-mono">
              {sticker.orderNumber}
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between text-[7.5px] text-zinc-800 font-semibold mt-1">
          <span>Date: {sticker.orderDate} {sticker.orderTime ? `• ${sticker.orderTime}` : ""}</span>
          <span className="uppercase tracking-wider font-semibold">75×100mm</span>
        </div>
      </div>

      {/* ─── SECTION B: Customer Information (Clean & Professional) ─── */}
      <div className="w-full border-b border-black py-1 shrink-0 space-y-0.5 text-black">
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1 overflow-hidden">
            <span className="text-[8.5px] uppercase font-bold text-zinc-600 shrink-0">TO:</span>
            <span className="font-bold text-[12px] text-black truncate">
              {sticker.customerName}
            </span>
          </div>
          <div className="text-right shrink-0">
            <span className="font-bold text-[12.5px] tracking-tight text-black leading-none">
              {sticker.customerPhone}
            </span>
          </div>
        </div>

        {/* Alternative Phone if available */}
        {config.showAltPhone && sticker.altPhone && (
          <div className="flex items-center justify-end text-[8.5px] font-semibold text-zinc-800">
            <span className="text-[7.5px] mr-1 uppercase text-zinc-600">Alt Phone:</span>
            <span>{sticker.altPhone}</span>
          </div>
        )}

        {/* Full Delivery Address */}
        <div className="flex items-start gap-1 pt-0.5">
          <span className="text-[8px] uppercase font-bold text-zinc-600 shrink-0 pt-0.2">ADDR:</span>
          <p className="text-[9px] leading-[11.5px] text-black font-medium break-words flex-1">
            {sticker.fullAddress}
          </p>
        </div>

        {/* Area / City / District */}
        {sticker.areaCityDistrict && (
          <div className="text-[8.5px] font-semibold text-zinc-700 pl-6 truncate">
            {sticker.areaCityDistrict}
          </div>
        )}
      </div>

      {/* ─── SECTION C: Product Information (Adaptive Multi-Line Grid) ─── */}
      <div className="w-full flex-1 overflow-hidden py-1 flex flex-col justify-center">
        <div className="w-full flex items-center justify-between text-[7.5px] font-bold uppercase tracking-wider text-zinc-600 border-b border-black/40 pb-0.5 mb-0.5 shrink-0">
          <span>Items &amp; Details</span>
          <span>Qty • Price</span>
        </div>

        <div className="w-full space-y-0.5 overflow-hidden">
          {sticker.items.map((item, idx) => (
            <div
              key={idx}
              className={`w-full ${pRowGap} ${idx > 0 ? "border-t border-black/20 pt-0.5" : ""}`}
            >
              {/* Line 1: Product Name & Price */}
              <div className="flex items-start justify-between gap-1">
                <div className={`font-bold text-black ${pNameSize} leading-tight break-words flex-1`}>
                  {item.title}
                </div>
                <div className={`font-bold text-black ${pPriceSize} text-right shrink-0 leading-none pl-1`}>
                  {financials.currency}{Number(item.lineTotal).toLocaleString()}
                </div>
              </div>

              {/* Line 2: Size / Variant & SKU & Quantity */}
              <div className={`flex items-center justify-between text-zinc-700 ${pMetaSize} mt-0.5`}>
                <div className="flex items-center gap-1.5 truncate flex-1 pr-1">
                  {(item.variantTitle || item.size) && (
                    <span className="font-semibold text-black">{item.variantTitle || item.size}</span>
                  )}
                  {config.showSku && item.sku ? (
                    <span className="font-mono text-zinc-600 font-semibold">[SKU: {item.sku}]</span>
                  ) : null}
                </div>
                <div className="font-bold text-black text-right shrink-0">
                  <span>QTY: {item.quantity} ({item.quantity}x)</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ─── SECTION D: Financial Summary (Clean & Aligned) ─── */}
      <div className="w-full border-t border-black pt-1 shrink-0 space-y-0.5 text-black text-[8.5px]">
        {/* Subtotal */}
        <div className="flex justify-between items-center text-zinc-800">
          <span>Subtotal ({itemCount} {itemCount === 1 ? "item" : "items"}):</span>
          <span className="font-bold text-black">{financials.currency}{Number(financials.subtotal).toLocaleString()}</span>
        </div>

        {/* Discount (if > 0) */}
        {financials.productDiscount > 0 && (
          <div className="flex justify-between items-center text-black font-medium">
            <span className="flex items-center gap-1">
              <span>Discount</span>
              {financials.discountCode && (
                <span className="text-[7.5px] font-bold border border-black/60 px-0.5 rounded-xs">
                  {financials.discountCode}
                </span>
              )}
              {financials.discountReason && (
                <span className="text-[7.5px] text-zinc-700">
                  ({financials.discountReason})
                </span>
              )}:
            </span>
            <span className="font-bold text-black">
              -{financials.currency}{Number(financials.productDiscount).toLocaleString()}
            </span>
          </div>
        )}

        {/* Delivery Charge */}
        <div className="flex justify-between items-center text-zinc-800">
          <span>Delivery Charge:</span>
          <span className="font-bold text-black">
            {financials.shippingCharge > 0
              ? `${financials.currency}${Number(financials.shippingCharge).toLocaleString()}`
              : "FREE"}
          </span>
        </div>

        {/* Advance Payment Received (if > 0) */}
        {financials.advancePaid > 0 && (
          <div className="flex justify-between items-center text-zinc-800 font-medium">
            <span>Advance Payment Received:</span>
            <span className="font-bold text-black">
              -{financials.currency}{Number(financials.advancePaid).toLocaleString()}
            </span>
          </div>
        )}

        {/* Total Order Value */}
        <div className="flex justify-between items-center text-[9.5px] font-bold text-black pt-0.5 border-t border-dashed border-black/40">
          <span>Total Order Value:</span>
          <span className="text-[10px]">{financials.currency}{Number(financials.totalOrderValue).toLocaleString()}</span>
        </div>
      </div>

      {/* ─── SECTION E: Total Due / COD Box ─── */}
      <div className="w-full border-t border-black pt-1 mt-0.5 shrink-0">
        {isPrepaid ? (
          <div className="w-full border-[1.5px] border-black bg-white text-black py-1.5 px-2 text-center rounded-xs">
            <span className="text-[13px] font-bold uppercase tracking-wider block leading-none">
              PAID – NO COD
            </span>
          </div>
        ) : (
          <div className="w-full border-[1.5px] border-black bg-white text-black py-1 px-2 rounded-xs flex items-center justify-between">
            <div className="text-left shrink-0">
              <span className="text-[8.5px] font-bold uppercase tracking-wider block text-zinc-800 leading-tight">
                CASH TO COLLECT:
              </span>
            </div>
            <div className="text-right shrink-0">
              <span className="text-[17px] font-black tracking-tight text-black leading-none font-mono">
                {financials.currency} {Number(financials.codAmount).toLocaleString()}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
