import React from "react";
import type { DueSlipData, PrinterPaperConfig } from "@/types/due-slip";

interface DueSlipThermalCardProps {
  slip: DueSlipData;
  config: PrinterPaperConfig;
  className?: string;
  isPrintMode?: boolean;
}

export function DueSlipThermalCard({
  slip,
  config,
  className = "",
  isPrintMode = false,
}: DueSlipThermalCardProps) {
  const storeName = (config.storeNameOverride?.trim() || slip.storeName || "STORE").toUpperCase();
  const currencySymbol = config.showCurrencySymbol ? (config.currencySymbol || slip.currency || "৳") : "";
  const formattedDueAmount = Number(slip.dueAmount || 0).toLocaleString();

  // Unit and dimensions
  const unit = config.unit || "in";
  const widthVal = `${config.width}${unit}`;
  const heightVal = `${config.height}${unit}`;

  // Font size adjustments based on config
  // For compact 1.49" x 0.98", we need precise microscopic sizing
  const isCompactLabel = (config.width <= 2.2 && config.height <= 1.5) || config.fontSize === "compact";
  const isLargeLabel = config.width >= 3.5 && config.height >= 4;

  const fontClasses = isCompactLabel
    ? {
        container: "p-1 leading-tight text-[9px]",
        store: "text-[10px] font-black tracking-tight",
        orderDate: "text-[8.5px] font-bold",
        customer: "text-[8.5px] font-semibold truncate",
        phone: "text-[9px] font-black tracking-tight",
        dueBox: "text-[11px] font-black",
        badge: "text-[8px] font-bold px-1 py-0.2",
      }
    : isLargeLabel
    ? {
        container: "p-4 leading-normal text-sm",
        store: "text-2xl font-black tracking-wider",
        orderDate: "text-base font-bold",
        customer: "text-base font-semibold",
        phone: "text-lg font-black",
        dueBox: "text-2xl font-black py-2",
        badge: "text-sm font-bold px-3 py-1",
      }
    : {
        container: "p-2 leading-tight text-xs",
        store: "text-sm font-black tracking-wide",
        orderDate: "text-xs font-bold",
        customer: "text-xs font-semibold truncate",
        phone: "text-xs font-black",
        dueBox: "text-base font-black py-1",
        badge: "text-[10px] font-bold px-1.5 py-0.5",
      };

  return (
    <div
      className={`due-slip box-border bg-white text-black font-sans flex flex-col justify-between overflow-hidden select-none ${
        isPrintMode
          ? "border-0 shadow-none m-0"
          : "border border-zinc-400 rounded-sm shadow-sm"
      } ${fontClasses.container} ${className}`}
      style={{
        width: widthVal,
        height: heightVal,
        maxWidth: widthVal,
        maxHeight: heightVal,
        pageBreakAfter: "always",
        breakAfter: "page",
        pageBreakInside: "avoid",
        breakInside: "avoid",
        WebkitPrintColorAdjust: "exact",
        printColorAdjust: "exact",
      }}
    >
      {/* Top Header: Store Name */}
      <div className="w-full text-center border-b border-black pb-0.5 mb-0.5 shrink-0 overflow-hidden">
        <h1 className={`${fontClasses.store} truncate`}>
          {storeName}
        </h1>
      </div>

      {/* Order Number & Date Row */}
      <div className="w-full flex items-center justify-between text-black shrink-0 px-0.5">
        <span className={`${fontClasses.orderDate} tracking-tighter`}>
          {slip.orderNumber}
        </span>
        {config.showDate && (
          <span className="text-[8px] font-medium opacity-90 truncate max-w-[55%] text-right">
            {slip.orderDate}
          </span>
        )}
      </div>

      {/* Customer Info */}
      <div className="w-full space-y-0.2 shrink-0 px-0.5 my-auto">
        {/* Customer Name */}
        <div className="flex items-center gap-1 overflow-hidden">
          <span className="text-[7.5px] uppercase font-bold shrink-0 opacity-70">
            To:
          </span>
          <span className={`${fontClasses.customer} truncate font-bold`}>
            {slip.customerName || "Guest"}
          </span>
        </div>

        {/* Customer Phone */}
        <div className="flex items-center gap-1 overflow-hidden">
          <span className="text-[7.5px] uppercase font-bold shrink-0 opacity-70">
            Ph:
          </span>
          <span className={`${fontClasses.phone} tracking-tight font-black`}>
            {slip.customerPhone || "N/A"}
          </span>
        </div>
      </div>

      {/* Bottom Payment / Due Amount Box */}
      <div className="w-full border-t border-black pt-0.5 mt-0.5 shrink-0">
        {slip.isPaid || slip.dueAmount <= 0 ? (
          <div className="w-full border border-black bg-white text-black py-0.5 px-1 text-center font-black flex items-center justify-between">
            <span className="text-[8px] uppercase tracking-wider font-bold">Status:</span>
            <span className={`${fontClasses.dueBox} uppercase`}>PAID ({currencySymbol}0)</span>
          </div>
        ) : (
          <div className="w-full border border-black bg-black text-white print:bg-black print:text-white py-0.5 px-1 text-center font-black flex items-center justify-between">
            <span className="text-[8px] uppercase tracking-wider font-bold text-white print:text-white">
              DUE AMT:
            </span>
            <span className={`${fontClasses.dueBox} text-white print:text-white tracking-tight`}>
              {currencySymbol} {formattedDueAmount}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

