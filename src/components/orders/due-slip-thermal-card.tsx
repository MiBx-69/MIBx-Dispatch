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
  // For compact 1.49" x 0.98", we need clean microscopic sizing
  const isCompactLabel = (config.width <= 2.2 && config.height <= 1.5) || config.fontSize === "compact";
  const isLargeLabel = config.width >= 3.5 && config.height >= 4;

  const fontClasses = isCompactLabel
    ? {
        container: "p-1.5 leading-tight text-[9px]",
        store: "text-[10px] font-black tracking-tight",
        orderMeta: "text-[8.5px] font-semibold",
        customer: "text-[9px] font-bold",
        phone: "text-[10px] font-black tracking-normal",
        dueAmount: "text-[11.5px] font-black",
      }
    : isLargeLabel
    ? {
        container: "p-4 leading-normal text-sm",
        store: "text-2xl font-black tracking-wider",
        orderMeta: "text-base font-semibold",
        customer: "text-lg font-bold",
        phone: "text-xl font-black",
        dueAmount: "text-2xl font-black",
      }
    : {
        container: "p-2.5 leading-tight text-xs",
        store: "text-sm font-black tracking-wide",
        orderMeta: "text-xs font-semibold",
        customer: "text-xs font-bold",
        phone: "text-sm font-black",
        dueAmount: "text-base font-black",
      };

  const isPaid = slip.isPaid || slip.dueAmount <= 0;

  return (
    <div
      className={`due-slip box-border bg-white text-black font-sans flex flex-col items-center justify-between text-center overflow-hidden select-none ${
        isPrintMode
          ? "border-0 shadow-none m-0"
          : "border border-zinc-300 rounded-sm shadow-sm"
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
      {/* 1. Store Header (Centered) */}
      <div className="w-full text-center border-b border-black pb-0.5 shrink-0 overflow-hidden px-1">
        <h1 className={`${fontClasses.store} truncate uppercase`}>
          {storeName}
        </h1>
      </div>

      {/* 2. Order # & Date (Centered) */}
      <div className="w-full text-center shrink-0 px-1">
        <p className={`${fontClasses.orderMeta} truncate`}>
          <span className="font-bold">{slip.orderNumber}</span>
          {config.showDate && slip.orderDate && (
            <span className="opacity-80"> • {slip.orderDate}</span>
          )}
        </p>
      </div>

      {/* 3. Customer Name & 4. Customer Phone (Centered away from borders) */}
      <div className="w-full flex flex-col items-center justify-center shrink-0 px-1.5 my-auto overflow-hidden">
        <p className={`${fontClasses.customer} w-full text-center truncate`}>
          {slip.customerName || "Guest"}
        </p>
        <p className={`${fontClasses.phone} w-full text-center truncate`}>
          {slip.customerPhone || "N/A"}
        </p>
      </div>

      {/* 5. Due / Payable Amount (Centered, clean text without heavy black fills or thick boxes) */}
      <div className="w-full border-t border-black pt-0.5 shrink-0 text-center px-1">
        {isPaid ? (
          <p className={`${fontClasses.dueAmount} uppercase tracking-tight`}>
            STATUS: PAID ({currencySymbol}0)
          </p>
        ) : (
          <p className={`${fontClasses.dueAmount} tracking-tight font-black`}>
            DUE: {currencySymbol} {formattedDueAmount}
          </p>
        )}
      </div>
    </div>
  );
}
