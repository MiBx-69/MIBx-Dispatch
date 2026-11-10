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

  // Count items to adapt font sizing if there are multiple products
  const itemCount = sticker.items.length;
  const isMultiItem = itemCount > 2;

  // Safe alignment padding (4.5mm left/right, 3.5mm top/bottom to prevent edge clipping on thermal rolls)
  const topOffset = config.topOffsetMm || 0;
  const leftOffset = config.leftOffsetMm || 0;
  const padTop = Math.max(1, 3.5 + topOffset);
  const padBottom = Math.max(1, 3.5 - topOffset);
  const padLeft = Math.max(1, 4.5 + leftOffset);
  const padRight = Math.max(1, 4.5 - leftOffset);

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
        // Centered safe printable zone: ~66mm width x ~93mm height
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
      <div className="w-full border-b-[1.5px] border-black pb-1 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-baseline gap-1.5 overflow-hidden">
            <span className="text-[12.5px] font-black tracking-wider uppercase truncate">{storeName}</span>
            <span className="text-[8px] font-bold text-zinc-600 uppercase shrink-0">Parcel Sticker</span>
          </div>
          <div className="text-right shrink-0">
            <span className="text-[15px] font-black tracking-tight">{sticker.orderNumber}</span>
          </div>
        </div>
        <div className="flex items-center justify-between text-[7px] text-zinc-800 font-semibold mt-0.5">
          <span>Date: {sticker.orderDate} {sticker.orderTime ? `• ${sticker.orderTime}` : ""}</span>
          <span className="uppercase tracking-wider">Gprinter 203 DPI</span>
        </div>
      </div>

      {/* ─── SECTION B: Customer Information ─── */}
      <div className="w-full border-b border-black py-1 shrink-0 space-y-0.5 text-[8.5px] leading-tight">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 overflow-hidden">
            <span className="text-[7.5px] uppercase font-bold text-zinc-600 shrink-0">Customer:</span>
            <span className="font-bold text-black truncate">{sticker.customerName}</span>
          </div>
          <div className="text-right shrink-0">
            <span className="font-black text-[9.5px] tracking-tight text-black">{sticker.customerPhone}</span>
          </div>
        </div>

        {/* Alternative Phone if available */}
        {config.showAltPhone && sticker.altPhone && (
          <div className="flex items-center justify-end text-[8px] font-bold text-zinc-800">
            <span className="text-[7px] text-zinc-600 mr-1">Alt:</span>
            <span>{sticker.altPhone}</span>
          </div>
        )}

        {/* Full Delivery Address */}
        <div className="flex items-start gap-1 pt-0.5">
          <span className="text-[7.5px] uppercase font-bold text-zinc-600 shrink-0">Address:</span>
          <p className="text-[8px] leading-[10.5px] text-black font-medium line-clamp-2">
            {sticker.fullAddress}
          </p>
        </div>

        {/* Area / City */}
        {sticker.areaCityDistrict && (
          <div className="text-[7.5px] font-semibold text-zinc-700 pl-7 truncate">
            {sticker.areaCityDistrict}
          </div>
        )}
      </div>

      {/* ─── SECTION C: Product Information Table (Lists ALL Products) ─── */}
      <div className="w-full flex-1 overflow-hidden py-0.5 flex flex-col justify-center">
        <div className="w-full flex items-center justify-between text-[7.5px] font-bold uppercase tracking-wider text-zinc-700 border-b border-black/30 pb-0.5 mb-0.5 shrink-0">
          <span className="w-[58%]">Product / Variant</span>
          <span className="w-[14%] text-center">Qty</span>
          <span className="w-[28%] text-right">Price</span>
        </div>

        <div className="w-full space-y-0.5 overflow-hidden">
          {sticker.items.map((item, idx) => (
            <div key={idx} className="w-full flex items-start justify-between text-[8px] leading-tight">
              <div className="w-[58%] pr-1">
                <p className={`font-bold text-black ${isMultiItem ? "truncate" : "line-clamp-2"}`}>
                  {item.title}
                </p>
                <div className="flex items-center gap-1 text-[7px] text-zinc-600 flex-wrap">
                  {item.variantTitle && (
                    <span className="font-semibold text-zinc-800">{item.variantTitle}</span>
                  )}
                  {config.showSku && item.sku && (
                    <span className="font-mono text-[6.5px] text-zinc-500">[{item.sku}]</span>
                  )}
                </div>
              </div>
              <div className="w-[14%] text-center font-bold text-black pt-0.5">
                {item.quantity}x
              </div>
              <div className="w-[28%] text-right font-black text-black pt-0.5">
                {financials.currency}{Number(item.lineTotal).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ─── SECTION D & E: Financial Summary & Discount ─── */}
      <div className="w-full border-t border-black pt-0.5 shrink-0 space-y-0.5 text-[8px]">
        {/* Subtotal & Delivery */}
        <div className="flex justify-between items-center text-zinc-700">
          <span>Subtotal ({itemCount} {itemCount === 1 ? "item" : "items"}):</span>
          <span className="font-semibold text-black">{financials.currency}{Number(financials.subtotal).toLocaleString()}</span>
        </div>

        {/* Discount (hidden if 0) */}
        {financials.productDiscount > 0 && (
          <div className="flex justify-between items-center text-zinc-800">
            <span className="flex items-center gap-1">
              <span>Discount</span>
              {financials.discountCode && (
                <span className="text-[7px] font-bold border border-black/40 px-0.5 rounded-xs">
                  {financials.discountCode}
                </span>
              )}
              {financials.discountReason && (
                <span className="text-[7px] text-zinc-600 truncate max-w-[90px]">
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
        <div className="flex justify-between items-center text-zinc-700">
          <span>Delivery Charge:</span>
          <span className="font-semibold text-black">
            {financials.shippingCharge > 0
              ? `${financials.currency}${Number(financials.shippingCharge).toLocaleString()}`
              : "FREE"}
          </span>
        </div>

        {/* Total Value & Advance Paid */}
        <div className="flex justify-between items-center font-bold text-black pt-0.5 border-t border-dashed border-black/40">
          <span>Total Order Value:</span>
          <span>{financials.currency}{Number(financials.totalOrderValue).toLocaleString()}</span>
        </div>

        {financials.advancePaid > 0 && (
          <div className="flex justify-between items-center text-zinc-800 font-semibold text-[7.5px]">
            <span>Advance Payment Received:</span>
            <span>-{financials.currency}{Number(financials.advancePaid).toLocaleString()}</span>
          </div>
        )}
      </div>

      {/* ─── SECTION F: Prominent Payment Highlight (COD vs PAID – NO COD) ─── */}
      <div className="w-full border-t-[2px] border-black pt-0.5 mt-0.5 shrink-0">
        {isPrepaid ? (
          <div className="w-full border-2 border-black bg-white text-black py-0.5 px-1 text-center rounded-xs">
            <span className="text-[11px] font-black uppercase tracking-wider">
              PAID – NO COD
            </span>
          </div>
        ) : (
          <div className="w-full border-2 border-black bg-white text-black py-0.5 px-1 text-center rounded-xs flex items-center justify-between">
            <span className="text-[9px] font-black uppercase tracking-wider text-black">
              CASH TO COLLECT:
            </span>
            <span className="text-[13.5px] font-black tracking-tight text-black">
              {financials.currency} {Number(financials.codAmount).toLocaleString()}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
