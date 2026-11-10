import type { OrderStickerData, OrderStickerConfig } from "@/types/order-sticker";

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function generateOrderStickersHtml(
  stickers: OrderStickerData[],
  config: OrderStickerConfig
): string {
  const storeName = (config.storeNameOverride?.trim() || stickers[0]?.storeName || "UNIVERSES").toUpperCase();

  const stickersHtml = stickers
    .map((stk, index) => {
      const isPaid = stk.financials.isPrepaid || stk.financials.codAmount <= 0;
      const formattedTotal = Number(stk.financials.totalOrderValue || 0).toLocaleString();
      const formattedSubtotal = Number(stk.financials.subtotal || 0).toLocaleString();
      const formattedShipping = Number(stk.financials.shippingCharge || 0).toLocaleString();
      const formattedDiscount = Number(stk.financials.productDiscount || 0).toLocaleString();
      const formattedAdvance = Number(stk.financials.advancePaid || 0).toLocaleString();
      const formattedCod = Number(stk.financials.codAmount || 0).toLocaleString();

      const itemsHtml = stk.items
        .map((it) => `
          <div class="item-row">
            <div class="item-desc">
              <div class="item-title">${escapeHtml(it.title)}</div>
              <div class="item-variant">
                ${it.variantTitle ? `<span>${escapeHtml(it.variantTitle)}</span>` : ""}
                ${config.showSku && it.sku ? `<span class="sku">[SKU: ${escapeHtml(it.sku)}]</span>` : ""}
              </div>
            </div>
            <div class="item-qty">${it.quantity}x</div>
            <div class="item-price">${stk.financials.currency}${Number(it.lineTotal).toLocaleString()}</div>
          </div>
        `)
        .join("\n");

      return `
      <div class="order-sticker-page ${index === stickers.length - 1 ? "is-last" : ""}">
        <div class="sticker-inner">
          <!-- SECTION A: Store Header -->
          <div class="sticker-header">
            <div class="header-top">
              <span class="store-name">${escapeHtml(storeName)}</span>
              <span class="order-number">${escapeHtml(stk.orderNumber)}</span>
            </div>
            <div class="header-meta">
              <span>Date: ${escapeHtml(stk.orderDate)} ${stk.orderTime ? `• ${escapeHtml(stk.orderTime)}` : ""}</span>
              <span class="badge">Gprinter 203 DPI</span>
            </div>
          </div>

          <!-- SECTION B: Customer Information -->
          <div class="customer-section">
            <div class="customer-row">
              <div class="customer-name-wrap">
                <span class="label">Customer:</span>
                <span class="customer-name">${escapeHtml(stk.customerName)}</span>
              </div>
              <div class="customer-phone">${escapeHtml(stk.customerPhone)}</div>
            </div>
            ${
              config.showAltPhone && stk.altPhone
                ? `<div class="alt-phone-row">
                    <span class="label">Alt:</span>
                    <span class="alt-val">${escapeHtml(stk.altPhone)}</span>
                   </div>`
                : ""
            }
            <div class="address-row">
              <span class="label">Address:</span>
              <span class="address-val">${escapeHtml(stk.fullAddress)}</span>
            </div>
            ${
              stk.areaCityDistrict
                ? `<div class="area-row">${escapeHtml(stk.areaCityDistrict)}</div>`
                : ""
            }
          </div>

          <!-- SECTION C: Product Items Table -->
          <div class="products-section">
            <div class="table-header">
              <span class="col-desc">Product / Variant</span>
              <span class="col-qty">Qty</span>
              <span class="col-price">Price</span>
            </div>
            <div class="items-list">
              ${itemsHtml}
            </div>
          </div>

          <!-- SECTION D & E: Financial Breakdown & Discount -->
          <div class="financials-section">
            <div class="fin-row">
              <span>Subtotal (${stk.items.length} ${stk.items.length === 1 ? "item" : "items"}):</span>
              <span>${stk.financials.currency}${formattedSubtotal}</span>
            </div>
            ${
              stk.financials.productDiscount > 0
                ? `<div class="fin-row discount-row">
                    <span>Discount ${stk.financials.discountCode ? `[${escapeHtml(stk.financials.discountCode)}]` : ""} ${stk.financials.discountReason ? `(${escapeHtml(stk.financials.discountReason)})` : ""}:</span>
                    <span>-${stk.financials.currency}${formattedDiscount}</span>
                   </div>`
                : ""
            }
            <div class="fin-row">
              <span>Delivery Charge:</span>
              <span>${stk.financials.shippingCharge > 0 ? `${stk.financials.currency}${formattedShipping}` : "FREE"}</span>
            </div>
            <div class="fin-row total-row">
              <span>Total Order Value:</span>
              <span>${stk.financials.currency}${formattedTotal}</span>
            </div>
            ${
              stk.financials.advancePaid > 0
                ? `<div class="fin-row advance-row">
                    <span>Advance Payment Received:</span>
                    <span>-${stk.financials.currency}${formattedAdvance}</span>
                   </div>`
                : ""
            }
          </div>

          <!-- SECTION F: Prominent Payment Highlight -->
          <div class="payment-highlight">
            ${
              isPaid
                ? `<div class="prepaid-box">
                    <span>PREPAID ORDER — PAID IN FULL (NO COD)</span>
                   </div>`
                : `<div class="cod-box">
                    <span class="cod-label">CASH TO COLLECT:</span>
                    <span class="cod-amount">${stk.financials.currency} ${formattedCod}</span>
                   </div>`
            }
          </div>
        </div>
      </div>
      `;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>MiBx Dispatch - 80x100mm Order Stickers (${stickers.length} Orders)</title>
  <style>
    @page {
      size: 80mm 100mm;
      margin: 0 !important;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #000000;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      width: 80mm;
      height: 100mm;
    }
    .order-sticker-page {
      width: 80mm;
      height: 100mm;
      max-height: 100mm;
      page-break-after: always;
      break-after: page;
      page-break-inside: avoid;
      break-inside: avoid;
      overflow: hidden;
      background: #ffffff;
      color: #000000;
      margin: 0 auto;
      padding: 0;
      box-sizing: border-box;
    }
    .order-sticker-page.is-last {
      page-break-after: auto;
      break-after: auto;
    }
    .sticker-inner {
      width: 100%;
      height: 100%;
      padding: 2.5mm 2.5mm;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      overflow: hidden;
      box-sizing: border-box;
    }

    /* HEADER */
    .sticker-header {
      width: 100%;
      border-bottom: 1.5px solid #000000;
      padding-bottom: 1mm;
      flex-shrink: 0;
    }
    .header-top {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
    }
    .store-name {
      font-size: 13px;
      font-weight: 900;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .order-number {
      font-size: 15px;
      font-weight: 900;
      letter-spacing: -0.2px;
    }
    .header-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 8px;
      color: #333333;
      margin-top: 1px;
    }
    .badge {
      font-weight: 700;
      text-transform: uppercase;
      font-size: 7px;
    }

    /* CUSTOMER */
    .customer-section {
      width: 100%;
      border-bottom: 1px solid #000000;
      padding: 1mm 0;
      flex-shrink: 0;
      font-size: 9px;
      line-height: 1.2;
    }
    .customer-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .customer-name-wrap {
      display: flex;
      gap: 3px;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .customer-name {
      font-weight: 800;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .customer-phone {
      font-size: 10px;
      font-weight: 900;
      letter-spacing: -0.2px;
      white-space: nowrap;
    }
    .alt-phone-row {
      display: flex;
      justify-content: flex-end;
      gap: 3px;
      font-size: 8.5px;
      font-weight: 800;
      color: #222222;
    }
    .address-row {
      display: flex;
      gap: 3px;
      font-size: 8.5px;
      margin-top: 1px;
      line-height: 1.15;
    }
    .address-val {
      font-weight: 500;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }
    .area-row {
      font-size: 8px;
      font-weight: 700;
      color: #444444;
      padding-left: 12mm;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .label {
      font-size: 7.5px;
      text-transform: uppercase;
      font-weight: 800;
      color: #555555;
      flex-shrink: 0;
    }

    /* PRODUCTS TABLE */
    .products-section {
      width: 100%;
      flex: 1;
      overflow: hidden;
      padding: 1mm 0;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .table-header {
      display: flex;
      justify-content: space-between;
      font-size: 7.5px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      border-bottom: 0.75px solid #cccccc;
      padding-bottom: 0.5mm;
      margin-bottom: 0.5mm;
    }
    .col-desc { width: 62%; }
    .col-qty { width: 12%; text-align: center; }
    .col-price { width: 26%; text-align: right; }

    .items-list {
      display: flex;
      flex-direction: column;
      gap: 1mm;
      overflow: hidden;
    }
    .item-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      font-size: 8.5px;
      line-height: 1.15;
    }
    .item-desc {
      width: 62%;
      padding-right: 1mm;
    }
    .item-title {
      font-weight: 800;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .item-variant {
      font-size: 7.5px;
      color: #444444;
      display: flex;
      gap: 3px;
      flex-wrap: wrap;
    }
    .item-variant span {
      font-weight: 600;
    }
    .sku {
      color: #666666;
      font-size: 7px;
    }
    .item-qty {
      width: 12%;
      text-align: center;
      font-weight: 800;
    }
    .item-price {
      width: 26%;
      text-align: right;
      font-weight: 900;
    }

    /* FINANCIALS */
    .financials-section {
      width: 100%;
      border-top: 1px solid #000000;
      padding-top: 0.8mm;
      font-size: 8.5px;
      line-height: 1.2;
      flex-shrink: 0;
    }
    .fin-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      color: #333333;
    }
    .discount-row {
      font-weight: 700;
      color: #000000;
    }
    .total-row {
      font-weight: 900;
      color: #000000;
      border-top: 0.5px dashed #666666;
      padding-top: 0.5mm;
      margin-top: 0.5mm;
    }
    .advance-row {
      font-size: 8px;
      font-weight: 700;
    }

    /* PAYMENT HIGHLIGHT */
    .payment-highlight {
      width: 100%;
      border-top: 1.5px solid #000000;
      padding-top: 1mm;
      margin-top: 0.5mm;
      flex-shrink: 0;
    }
    .prepaid-box {
      border: 1.5px solid #000000;
      padding: 1.5mm 2mm;
      text-align: center;
      font-size: 11px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .cod-box {
      border: 1.5px solid #000000;
      padding: 1mm 2mm;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .cod-label {
      font-size: 10px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .cod-amount {
      font-size: 15px;
      font-weight: 900;
      letter-spacing: -0.3px;
    }

    @media screen {
      body {
        background: #f4f4f5;
        padding: 20px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 20px;
      }
      .order-sticker-page {
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        border: 1px solid #d4d4d8;
      }
    }
  </style>
</head>
<body>
  ${stickersHtml}
</body>
</html>`;
}

/**
 * Generates an 80x100mm alignment and gap calibration sticker for Gprinter GP-3120TU
 */
export function generateTestCalibrationStickerHtml(config: OrderStickerConfig): string {
  const storeName = (config.storeNameOverride?.trim() || "UNIVERSES").toUpperCase();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>GP-3120TU 80x100mm Calibration Test</title>
  <style>
    @page {
      size: 80mm 100mm;
      margin: 0 !important;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      width: 80mm;
      height: 100mm;
      background: #ffffff;
      color: #000000;
      font-family: monospace;
    }
    .calib-page {
      width: 80mm;
      height: 100mm;
      border: 1.5px solid #000000;
      margin: 0;
      padding: 3mm;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      align-items: center;
      text-align: center;
      box-sizing: border-box;
      position: relative;
    }
    /* Corner Marks */
    .c-tl { position: absolute; top: 1mm; left: 1mm; font-size: 8px; font-weight: bold; }
    .c-tr { position: absolute; top: 1mm; right: 1mm; font-size: 8px; font-weight: bold; }
    .c-bl { position: absolute; bottom: 1mm; left: 1mm; font-size: 8px; font-weight: bold; }
    .c-br { position: absolute; bottom: 1mm; right: 1mm; font-size: 8px; font-weight: bold; }
  </style>
</head>
<body>
  <div class="calib-page">
    <div class="c-tl">+ 0,0</div>
    <div class="c-tr">+ 80,0</div>
    <div class="c-bl">+ 0,100</div>
    <div class="c-br">+ 80,100</div>

    <div style="margin-top: 4mm;">
      <h2 style="margin:0; font-size: 14px; font-weight: 900;">${escapeHtml(storeName)}</h2>
      <p style="margin:2px 0 0 0; font-size: 9px;">GP-3120TU 80x100mm TEST PRINT</p>
    </div>

    <div style="border: 1px dashed #000; padding: 4mm; width: 90%;">
      <p style="margin: 0; font-size: 10px; font-weight: bold;">RULER BOUNDARY</p>
      <p style="margin: 3px 0; font-size: 8px;">WIDTH: 80mm | HEIGHT: 100mm</p>
      <p style="margin: 0; font-size: 8px;">Resolution: 203 DPI (640x800 dots)</p>
    </div>

    <div style="margin-bottom: 4mm;">
      <p style="margin: 0; font-size: 9px; font-weight: bold;">[GAP SENSOR CALIBRATION OK]</p>
      <p style="margin: 2px 0 0 0; font-size: 7.5px;">If borders are cut off, adjust Windows Driver Margins</p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Triggers printing using a hidden iframe to ensure seamless browser-based printing
 * directly into the installed Windows printer driver (Gprinter GP-3120TU 80x100mm).
 */
export async function printOrderStickersViaIframe(
  stickers: OrderStickerData[],
  config: OrderStickerConfig
): Promise<boolean> {
  if (typeof window === "undefined" || stickers.length === 0) return false;

  return new Promise((resolve) => {
    try {
      const existing = document.getElementById("mibx-order-sticker-print-frame");
      if (existing) {
        existing.remove();
      }

      const iframe = document.createElement("iframe");
      iframe.id = "mibx-order-sticker-print-frame";
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "0";
      iframe.style.visibility = "hidden";

      document.body.appendChild(iframe);

      const html = generateOrderStickersHtml(stickers, config);
      iframe.srcdoc = html;

      iframe.onload = () => {
        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
            resolve(true);
          } catch (e) {
            console.error("[OrderStickers] Frame print execution failed:", e);
            resolve(false);
          } finally {
            setTimeout(() => {
              iframe.remove();
            }, 3000);
          }
        }, 400);
      };
    } catch (err) {
      console.error("[OrderStickers] Failed to setup print iframe:", err);
      resolve(false);
    }
  });
}

/**
 * Prints test calibration sticker
 */
export async function printTestCalibrationSticker(config: OrderStickerConfig): Promise<boolean> {
  if (typeof window === "undefined") return false;

  return new Promise((resolve) => {
    try {
      const existing = document.getElementById("mibx-order-sticker-calib-frame");
      if (existing) existing.remove();

      const iframe = document.createElement("iframe");
      iframe.id = "mibx-order-sticker-calib-frame";
      iframe.style.position = "fixed";
      iframe.style.visibility = "hidden";
      document.body.appendChild(iframe);

      const html = generateTestCalibrationStickerHtml(config);
      iframe.srcdoc = html;

      iframe.onload = () => {
        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
            resolve(true);
          } catch {
            resolve(false);
          } finally {
            setTimeout(() => iframe.remove(), 3000);
          }
        }, 300);
      };
    } catch {
      resolve(false);
    }
  });
}

