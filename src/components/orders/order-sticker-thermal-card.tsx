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

  // Safe alignment padding: ~2.2mm horizontal (leaves ~70.6mm printable width), ~2.0mm vertical
  const topOffset = config.topOffsetMm || 0;
  const leftOffset = config.leftOffsetMm || 0;
  const padTop = Math.max(0.5, 2.0 + topOffset);
  const padBottom = Math.max(0.5, 2.0 - topOffset);
  const padLeft = Math.max(0.5, 2.2 + leftOffset);
  const padRight = Math.max(0.5, 2.2 - leftOffset);

  // Dynamic typography hierarchy based on product count:
  // 1 item: large prominent 14-17px typography
  // 2 items: balanced 13-15px typography
  // 3-4 items: clean compact 11-13px typography
  // 5+ items: dense information-rich 10-12px layout fitting all products without overflow
  const pNameClass =
    itemCount === 1
      ? "text-[14.5px]"
      : itemCount === 2
      ? "text-[13px]"
      : itemCount <= 4
      ? "text-[11.5px]"
      : "text-[10px]";

  const pPriceClass =
    itemCount === 1
      ? "text-[16.5px]"
      : itemCount === 2
      ? "text-[15px]"
      : itemCount <= 4
      ? "text-[13px]"
      : "text-[11.5px]";

  const pVariantClass =
    itemCount === 1
      ? "text-[13px]"
      : itemCount === 2
      ? "text-[11.5px]"
      : itemCount <= 4
      ? "text-[10.5px]"
      : "text-[9.5px]";

  const pSkuClass =
    itemCount === 1
      ? "text-[12px]"
      : itemCount === 2
      ? "text-[11px]"
      : itemCount <= 4
      ? "text-[10px]"
      : "text-[9px]";

  const pQtyClass =
    itemCount === 1
      ? "text-[13px]"
      : itemCount === 2
      ? "text-[12px]"
      : itemCount <= 4
      ? "text-[11px]"
      : "text-[10px]";

  const pRowPadding =
    itemCount === 1
      ? "py-2"
      : itemCount === 2
      ? "py-1.5"
      : itemCount <= 4
      ? "py-1"
      : "py-0.5";

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
        // Premium information-dense printable zone: ~70.6mm width x ~96mm height
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
      <div className="w-full border-b-[2px] border-black pb-1 shrink-0">
        <div className="flex items-baseline justify-between">
          <div className="flex items-baseline gap-2 overflow-hidden">
            <span className="text-[16px] font-black tracking-wider uppercase truncate text-black leading-none">
              {storeName}
            </span>
            <span className="text-[8.5px] font-black text-black uppercase tracking-wider shrink-0 border border-black px-1 py-0.5 rounded-xs leading-none">
              PARCEL STICKER
            </span>
          </div>
          <div className="text-right shrink-0">
            <span className="text-[18px] font-black tracking-tight text-black leading-none">
              {sticker.orderNumber}
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between text-[8px] text-black font-bold mt-1">
          <span>Date: {sticker.orderDate} {sticker.orderTime ? `• ${sticker.orderTime}` : ""}</span>
          <span className="uppercase tracking-wider">GP-3120TU • 203 DPI</span>
        </div>
      </div>

      {/* ─── SECTION B: Customer Information (Prominent & Extra-Bold) ─── */}
      <div className="w-full border-b-[2px] border-black py-1 shrink-0 space-y-0.5 text-black">
        <div className="flex items-baseline justify-between gap-1">
          <div className="flex items-baseline gap-1.5 overflow-hidden">
            <span className="text-[9.5px] uppercase font-black text-black shrink-0">TO:</span>
            <span className="font-black text-[13.5px] text-black leading-tight break-words">
              {sticker.customerName}
            </span>
          </div>
          <div className="text-right shrink-0">
            <span className="font-black text-[14px] tracking-tight text-black leading-none">
              {sticker.customerPhone}
            </span>
          </div>
        </div>

        {/* Alternative Phone if available */}
        {config.showAltPhone && sticker.altPhone && (
          <div className="flex items-center justify-end text-[9.5px] font-black text-black">
            <span className="text-[8.5px] mr-1 uppercase text-black">Alt Phone:</span>
            <span>{sticker.altPhone}</span>
          </div>
        )}

        {/* Full Delivery Address (No ellipses truncation, complete wrapping) */}
        <div className="flex items-start gap-1 pt-0.5">
          <span className="text-[9px] uppercase font-black text-black shrink-0 pt-0.5">ADDR:</span>
          <p className="text-[10px] leading-[12.5px] text-black font-bold break-words flex-1">
            {sticker.fullAddress}
          </p>
        </div>

        {/* Area / City / District */}
        {sticker.areaCityDistrict && (
          <div className="text-[9.5px] font-black text-black pl-8 truncate">
            {sticker.areaCityDistrict}
          </div>
        )}
      </div>

      {/* ─── SECTION C: Product Information (Structured Multi-Line Grid) ─── */}
      <div className="w-full flex-1 overflow-hidden py-1 flex flex-col justify-center">
        <div className="w-full space-y-1 overflow-hidden">
          {sticker.items.map((item, idx) => (
            <div
              key={idx}
              className={`w-full ${pRowPadding} ${idx > 0 ? "border-t border-black/40" : ""}`}
            >
              {/* Line 1: Product Name & Price */}
              <div className="flex items-start justify-between gap-2">
                <div className={`font-black text-black ${pNameClass} leading-tight break-words flex-1`}>
                  {item.title}
                </div>
                <div className={`font-black text-black ${pPriceClass} text-right shrink-0 leading-none`}>
                  {financials.currency}{Number(item.lineTotal).toLocaleString()}
                </div>
              </div>

              {/* Line 2: Size / Variant */}
              {(item.variantTitle || item.size) && (
                <div className={`font-black text-black ${pVariantClass} leading-tight mt-0.5`}>
                  <span>{item.variantTitle || item.size}</span>
                </div>
              )}

              {/* Line 3: SKU & Quantity */}
              <div className="flex items-center justify-between text-black font-black mt-0.5">
                <div className={`${pSkuClass} font-mono tracking-tight`}>
                  {config.showSku && item.sku ? (
                    <span>[SKU: {item.sku}]</span>
                  ) : null}
                </div>
                <div className={`${pQtyClass} font-black text-right`}>
                  <span>QTY: {item.quantity} ({item.quantity}x)</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ─── SECTION D: Financial Summary (Dedicated Clear Area) ─── */}
      <div className="w-full border-t-[2px] border-black pt-1 shrink-0 space-y-0.5 text-black">
        {/* Subtotal */}
        <div className="flex justify-between items-center text-[10px] font-bold">
          <span>Subtotal ({itemCount} {itemCount === 1 ? "item" : "items"}):</span>
          <span className="font-black text-[11px]">{financials.currency}{Number(financials.subtotal).toLocaleString()}</span>
        </div>

        {/* Discount (if > 0) */}
        {financials.productDiscount > 0 && (
          <div className="flex justify-between items-center text-[10px] font-bold">
            <span className="flex items-center gap-1">
              <span>Discount</span>
              {financials.discountCode && (
                <span className="text-[8.5px] font-black border border-black px-1 rounded-xs">
                  {financials.discountCode}
                </span>
              )}
              {financials.discountReason && (
                <span className="text-[8.5px] font-bold">
                  ({financials.discountReason})
                </span>
              )}:
            </span>
            <span className="font-black text-[11px]">
              -{financials.currency}{Number(financials.productDiscount).toLocaleString()}
            </span>
          </div>
        )}

        {/* Delivery Charge */}
        <div className="flex justify-between items-center text-[10px] font-bold">
          <span>Delivery Charge:</span>
          <span className="font-black text-[11px]">
            {financials.shippingCharge > 0
              ? `${financials.currency}${Number(financials.shippingCharge).toLocaleString()}`
              : "FREE"}
          </span>
        </div>

        {/* Advance Payment Received (if > 0) */}
        {financials.advancePaid > 0 && (
          <div className="flex justify-between items-center text-[10px] font-bold">
            <span>Advance Payment Received:</span>
            <span className="font-black text-[11px]">
              -{financials.currency}{Number(financials.advancePaid).toLocaleString()}
            </span>
          </div>
        )}

        {/* Total Order Value */}
        <div className="flex justify-between items-center text-[11px] font-black pt-0.5 border-t border-black/40">
          <span>Total Order Value:</span>
          <span className="text-[12px]">{financials.currency}{Number(financials.totalOrderValue).toLocaleString()}</span>
        </div>
      </div>

      {/* ─── SECTION E: Prominent COD Highlight (24-28px Bold COD / PAID – NO COD) ─── */}
      <div className="w-full border-t-[2px] border-black pt-1 mt-0.5 shrink-0">
        {isPrepaid ? (
          <div className="w-full border-[2.5px] border-black bg-white text-black py-2 px-2 text-center rounded-xs">
            <span className="text-[18px] font-black uppercase tracking-wider block leading-none">
              PAID – NO COD
            </span>
          </div>
        ) : (
          <div className="w-full border-[2.5px] border-black bg-white text-black py-1.5 px-2.5 rounded-xs flex items-center justify-between">
            <div className="text-left shrink-0">
              <span className="text-[11px] font-black uppercase tracking-wider block text-black leading-tight">
                CASH TO COLLECT:
              </span>
            </div>
            <div className="text-right shrink-0">
              <span className="text-[25px] font-black tracking-tight text-black leading-none">
                {financials.currency} {Number(financials.codAmount).toLocaleString()}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
