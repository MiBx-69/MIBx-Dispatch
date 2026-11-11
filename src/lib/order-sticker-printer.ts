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
  const additionalNote = (config.additionalNote !== undefined ? config.additionalNote : "রাইডারের সামনে চেক করে নিবেন")?.trim();
  const topOffset = config.topOffsetMm || 0;
  const leftOffset = config.leftOffsetMm || 0;

  // Balanced centered margins with tear-off safety: 3.0mm horizontal, 2.0mm top, 3.5mm bottom
  const padTop = Math.max(0.5, 2.0 + topOffset);
  const padBottom = Math.max(1.0, 3.5 - topOffset);
  const padLeft = Math.max(0.5, 3.0 + leftOffset);
  const padRight = Math.max(0.5, 3.0 - leftOffset);

  const stickersHtml = stickers
    .map((stk, index) => {
      const isPaid = stk.financials.isPrepaid || stk.financials.codAmount <= 0;
      const formattedTotal = Number(stk.financials.totalOrderValue || 0).toLocaleString();
      const formattedSubtotal = Number(stk.financials.subtotal || 0).toLocaleString();
      const formattedShipping = Number(stk.financials.shippingCharge || 0).toLocaleString();
      const formattedDiscount = Number(stk.financials.productDiscount || 0).toLocaleString();
      const formattedAdvance = Number(stk.financials.advancePaid || 0).toLocaleString();
      const formattedCod = Number(stk.financials.codAmount || 0).toLocaleString();

      const itemCount = stk.items.length;
      const pRowClass =
        itemCount === 1
          ? "p-row-lg"
          : itemCount === 2
          ? "p-row-md"
          : itemCount <= 4
          ? "p-row-sm"
          : "p-row-xs";

      const itemsHtml = stk.items
        .map((it, idx) => `
          <div class="product-item ${pRowClass} ${idx > 0 ? "has-divider" : ""}">
            <!-- Line 1: Product Name & Price -->
            <div class="p-line-1">
              <span class="p-title">${escapeHtml(it.title)}</span>
              <span class="p-price">${stk.financials.currency}${Number(it.lineTotal).toLocaleString()}</span>
            </div>
            <!-- Line 2: Size / Variant, SKU & Quantity -->
            <div class="p-line-2">
              <div class="p-meta-left">
                ${
                  it.variantTitle || it.size
                    ? `<span class="p-variant">${escapeHtml(it.variantTitle || it.size || "")}</span>`
                    : ""
                }
                ${
                  config.showSku && it.sku
                    ? `<span class="p-sku">[SKU: ${escapeHtml(it.sku)}]</span>`
                    : ""
                }
              </div>
              <div class="p-qty">QTY: ${it.quantity} (${it.quantity}x)</div>
            </div>
          </div>
        `)
        .join("\n");

      return `
      <div class="order-sticker-page ${index === stickers.length - 1 ? "is-last" : ""}">
        <div class="sticker-inner">
          <!-- SECTION A: Store Header -->
          <div class="sticker-header">
            <div class="header-top">
              <div class="header-brand">
                <span class="store-name">${escapeHtml(storeName)}</span>
                <span class="parcel-badge">DISPATCH</span>
              </div>
              <span class="order-number">${escapeHtml(stk.orderNumber)}</span>
            </div>
            <div class="header-meta">
              <span class="meta-date">Date: ${escapeHtml(stk.orderDate)} ${stk.orderTime ? `• ${escapeHtml(stk.orderTime)}` : ""}</span>
              ${
                stk.pathaoTrackingCode || stk.pathaoConsignmentId
                  ? `<span class="pathao-badge">PATHAO: ${escapeHtml(stk.pathaoTrackingCode || stk.pathaoConsignmentId || "")}</span>`
                  : `<span class="badge">75×100mm</span>`
              }
            </div>
          </div>

          <!-- SECTION B: Customer Information (Clean & Professional) -->
          <div class="customer-section">
            <div class="customer-row">
              <div class="customer-name-wrap">
                <span class="label">TO:</span>
                <span class="customer-name">${escapeHtml(stk.customerName)}</span>
              </div>
              <div class="customer-phone">${escapeHtml(stk.customerPhone)}</div>
            </div>
            ${
              config.showAltPhone && stk.altPhone
                ? `<div class="alt-phone-row">
                    <span class="label">ALT PHONE:</span>
                    <span class="alt-val">${escapeHtml(stk.altPhone)}</span>
                   </div>`
                : ""
            }
            <div class="address-row">
              <span class="label">ADDR:</span>
              <span class="address-val">${escapeHtml(stk.fullAddress)}</span>
            </div>
            ${
              stk.areaCityDistrict
                ? `<div class="area-row">${escapeHtml(stk.areaCityDistrict)}</div>`
                : ""
            }
            ${
              stk.customerNote
                ? `<div class="note-row">
                    <span class="label">NOTE:</span>
                    <span class="note-val">${escapeHtml(stk.customerNote)}</span>
                   </div>`
                : ""
            }
          </div>

          <!-- SECTION C: Product Items Table (Adaptive Layout) -->
          <div class="products-section">
            <div class="table-header">
              <span>ITEMS &amp; DETAILS</span>
              <span class="pack-badge">TOTAL: ${stk.items.length} ${stk.items.length === 1 ? "ITEM" : "ITEMS"} (${stk.totalPcs || stk.items.length} PCS)</span>
            </div>
            <div class="items-list">
              ${itemsHtml}
            </div>
          </div>

          <!-- SECTION D: Financial Breakdown & Discount (Clean & Aligned) -->
          <div class="financials-section">
            <div class="fin-row">
              <span>Subtotal (${stk.items.length} ${stk.items.length === 1 ? "item" : "items"}):</span>
              <span class="fin-val">${stk.financials.currency}${formattedSubtotal}</span>
            </div>
            ${
              stk.financials.productDiscount > 0
                ? `<div class="fin-row discount-row">
                    <span>Discount ${stk.financials.discountCode ? `[${escapeHtml(stk.financials.discountCode)}]` : ""} ${stk.financials.discountReason ? `(${escapeHtml(stk.financials.discountReason)})` : ""}:</span>
                    <span class="fin-val">-${stk.financials.currency}${formattedDiscount}</span>
                   </div>`
                : ""
            }
            <div class="fin-row">
              <span>Delivery Charge:</span>
              <span class="fin-val">${stk.financials.shippingCharge > 0 ? `${stk.financials.currency}${formattedShipping}` : "FREE"}</span>
            </div>
            ${
              stk.financials.advancePaid > 0
                ? `<div class="fin-row advance-row">
                    <span>Advance Payment Received:</span>
                    <span class="fin-val">-${stk.financials.currency}${formattedAdvance}</span>
                   </div>`
                : ""
            }
            <div class="fin-row total-row">
              <span>Total Order Value:</span>
              <span class="fin-val">${stk.financials.currency}${formattedTotal}</span>
            </div>
          </div>

          <!-- SECTION E: Prominent Total Due / COD Highlight & Delivery Notice -->
          <div class="payment-highlight">
            ${
              isPaid
                ? `<div class="prepaid-box">
                    <span>PAID – NO COD</span>
                   </div>`
                : `<div class="cod-box">
                    <span class="cod-label">CASH TO COLLECT:</span>
                    <span class="cod-amount">${stk.financials.currency} ${formattedCod}</span>
                   </div>`
            }
            ${
              additionalNote
                ? `<div class="delivery-notice">
                    <span>* ${escapeHtml(additionalNote)} *</span>
                   </div>`
                : ""
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
  <title>MiBx Dispatch - 75x100mm Order Stickers (${stickers.length} Orders)</title>
  <style>
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      margin: 0;
      padding: 0;
      background: #f4f4f5;
      color: #000000;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    }
    .order-sticker-page {
      width: 75mm;
      height: 100mm;
      min-width: 75mm;
      min-height: 100mm;
      max-height: 100mm;
      flex-shrink: 0;
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
      min-height: 100%;
      padding: ${padTop}mm ${padRight}mm ${padBottom}mm ${padLeft}mm;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      overflow: hidden;
      box-sizing: border-box;
    }

    /* HEADER */
    .sticker-header {
      width: 100%;
      border-bottom: 1px solid #000000;
      padding-bottom: 0.8mm;
      flex-shrink: 0;
    }
    .header-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .header-brand {
      display: flex;
      align-items: center;
      gap: 1.5mm;
      overflow: hidden;
    }
    .store-name {
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      line-height: 1;
    }
    .parcel-badge {
      font-size: 8px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border: 1px solid #000000;
      padding: 0.2mm 0.8mm;
      line-height: 1;
      flex-shrink: 0;
    }
    .order-number {
      font-size: 15px;
      font-weight: 700;
      font-family: monospace;
      letter-spacing: -0.2px;
      flex-shrink: 0;
      line-height: 1;
    }
    .header-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 7.5px;
      font-weight: 600;
      color: #222222;
      margin-top: 0.8mm;
    }
    .meta-date {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .pathao-badge {
      font-size: 7.5px;
      font-weight: 700;
      text-transform: uppercase;
      border: 1px solid #000000;
      padding: 0.2mm 1mm;
      line-height: 1;
      letter-spacing: 0.3px;
      font-family: monospace;
      flex-shrink: 0;
      white-space: nowrap;
    }
    .badge {
      font-weight: 600;
      text-transform: uppercase;
      font-size: 7.5px;
    }

    /* CUSTOMER */
    .customer-section {
      width: 100%;
      border-bottom: 1px solid #000000;
      padding: 0.8mm 0;
      flex-shrink: 0;
      font-size: 9px;
      line-height: 1.2;
    }
    .customer-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
    }
    .customer-name-wrap {
      display: flex;
      gap: 1mm;
      overflow: hidden;
    }
    .customer-name {
      font-size: 12px;
      font-weight: 700;
      color: #000000;
      line-height: 1.15;
    }
    .customer-phone {
      font-size: 12.5px;
      font-weight: 700;
      letter-spacing: -0.2px;
      white-space: nowrap;
      flex-shrink: 0;
      line-height: 1;
    }
    .alt-phone-row {
      display: flex;
      justify-content: flex-end;
      gap: 1mm;
      font-size: 8.5px;
      font-weight: 600;
      color: #222222;
      margin-top: 0.2mm;
    }
    .address-row {
      display: flex;
      gap: 1mm;
      font-size: 9px;
      margin-top: 0.4mm;
      line-height: 1.25;
    }
    .address-val {
      font-weight: 500;
      color: #000000;
      word-break: break-word;
    }
    .area-row {
      font-size: 8.5px;
      font-weight: 600;
      color: #333333;
      padding-left: 5.5mm;
      margin-top: 0.2mm;
    }
    .note-row {
      display: flex;
      gap: 1mm;
      font-size: 8.5px;
      font-weight: 700;
      color: #000000;
      margin-top: 0.4mm;
      background: #f4f4f5;
      padding: 0.4mm 0.8mm;
      border-left: 2px solid #000000;
      line-height: 1.2;
    }
    .note-val {
      font-weight: 700;
      color: #000000;
      word-break: break-word;
    }
    .label {
      font-size: 8.5px;
      text-transform: uppercase;
      font-weight: 700;
      color: #444444;
      flex-shrink: 0;
    }

    /* PRODUCTS TABLE */
    .products-section {
      width: 100%;
      flex: 1;
      overflow: hidden;
      padding: 0.6mm 0;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .table-header {
      display: flex;
      justify-content: space-between;
      font-size: 7.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      color: #555555;
      border-bottom: 0.5px solid #888888;
      padding-bottom: 0.3mm;
      margin-bottom: 0.3mm;
    }
    .pack-badge {
      font-weight: 800;
      letter-spacing: 0.2px;
      color: #000000;
      font-size: 7.5px;
    }
    .items-list {
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .product-item {
      width: 100%;
      display: flex;
      flex-direction: column;
    }
    .product-item.has-divider {
      border-top: 0.5px solid rgba(0, 0, 0, 0.2);
      margin-top: 0.4mm;
      padding-top: 0.4mm;
    }
    .p-row-lg { padding: 1mm 0; }
    .p-row-md { padding: 0.8mm 0; }
    .p-row-sm { padding: 0.4mm 0; }
    .p-row-xs { padding: 0.2mm 0; }

    .p-line-1 {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 1.5mm;
    }
    .p-title {
      font-weight: 700;
      color: #000000;
      line-height: 1.15;
      word-break: break-word;
      flex: 1;
    }
    .p-row-lg .p-title { font-size: 12.5px; }
    .p-row-md .p-title { font-size: 11.5px; }
    .p-row-sm .p-title { font-size: 10px; }
    .p-row-xs .p-title { font-size: 9px; }

    .p-price {
      font-weight: 700;
      color: #000000;
      text-align: right;
      white-space: nowrap;
      flex-shrink: 0;
      line-height: 1;
      padding-left: 1mm;
    }
    .p-row-lg .p-price { font-size: 13px; }
    .p-row-md .p-price { font-size: 12px; }
    .p-row-sm .p-price { font-size: 10.5px; }
    .p-row-xs .p-price { font-size: 9.5px; }

    .p-line-2 {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 0.2mm;
      font-size: 8.5px;
      color: #444444;
    }
    .p-row-lg .p-line-2 { font-size: 10px; }
    .p-row-md .p-line-2 { font-size: 9px; }
    .p-row-sm .p-line-2 { font-size: 8px; }
    .p-row-xs .p-line-2 { font-size: 7.5px; }

    .p-meta-left {
      display: flex;
      align-items: center;
      gap: 1.5mm;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1;
      padding-right: 1mm;
    }
    .p-variant {
      font-weight: 600;
      color: #000000;
    }
    .p-sku {
      font-family: monospace;
      font-weight: 600;
      color: #555555;
    }
    .p-qty {
      font-weight: 700;
      color: #000000;
      text-align: right;
      white-space: nowrap;
      flex-shrink: 0;
    }

    /* FINANCIALS */
    .financials-section {
      width: 100%;
      border-top: 1px solid #000000;
      padding-top: 0.6mm;
      font-size: 8.5px;
      line-height: 1.25;
      flex-shrink: 0;
    }
    .fin-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      color: #333333;
    }
    .fin-val {
      font-weight: 700;
      color: #000000;
    }
    .discount-row {
      color: #000000;
    }
    .total-row {
      font-size: 9.5px;
      font-weight: 700;
      color: #000000;
      border-top: 0.5px dashed #444444;
      padding-top: 0.4mm;
      margin-top: 0.4mm;
    }
    .total-row .fin-val {
      font-size: 10px;
    }
    .advance-row {
      font-size: 8.5px;
    }

    /* PAYMENT HIGHLIGHT */
    .payment-highlight {
      width: 100%;
      border-top: 1px solid #000000;
      padding-top: 0.6mm;
      margin-top: 0.4mm;
      flex-shrink: 0;
    }
    .prepaid-box {
      border: 1.5px solid #000000;
      padding: 1.5mm 2mm;
      text-align: center;
      font-size: 13px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
      line-height: 1;
    }
    .cod-box {
      border: 1.5px solid #000000;
      padding: 1mm 2mm;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .cod-label {
      font-size: 8.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #222222;
      line-height: 1;
    }
    .cod-amount {
      font-size: 17px;
      font-weight: 900;
      font-family: monospace;
      letter-spacing: -0.3px;
      line-height: 1;
      color: #000000;
    }
    .delivery-notice {
      text-align: center;
      font-size: 8px;
      font-weight: 700;
      color: #000000;
      margin-top: 0.5mm;
      letter-spacing: 0.2px;
      line-height: 1;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Kalpurush", "SolaimanLipi", sans-serif;
    }

    @media screen {
      html, body {
        width: 100% !important;
        min-height: 100% !important;
        background: #e4e4e7 !important;
      }
      body {
        padding: 24px 10px !important;
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        gap: 24px !important;
        overflow-y: auto !important;
      }
      .order-sticker-page {
        width: 75mm !important;
        height: 100mm !important;
        min-width: 75mm !important;
        min-height: 100mm !important;
        max-height: 100mm !important;
        flex-shrink: 0 !important;
        background: #ffffff !important;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
        border: 1px solid #a1a1aa !important;
        border-radius: 3px !important;
      }
    }

    @media print {
      @page {
        size: 75mm 100mm;
        margin: 0 !important;
      }
      html, body {
        width: 75mm !important;
        height: 100mm !important;
        margin: 0 !important;
        padding: 0 !important;
        background: #ffffff !important;
      }
      .order-sticker-page {
        width: 75mm !important;
        height: 100mm !important;
        min-height: 100mm !important;
        max-height: 100mm !important;
        page-break-after: always !important;
        break-after: page !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        overflow: hidden !important;
        background: #ffffff !important;
        color: #000000 !important;
        margin: 0 !important;
        padding: 0 !important;
        box-sizing: border-box !important;
        border: none !important;
        box-shadow: none !important;
      }
      .order-sticker-page.is-last {
        page-break-after: auto !important;
        break-after: auto !important;
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
 * Generates an exact 75x100mm alignment and gap calibration sticker for Gprinter GP-3120TU
 * Uses safe printable frame so all 4 borders and corner crosshairs are 100% visible on the physical label.
 */
export function generateTestCalibrationStickerHtml(config: OrderStickerConfig): string {
  const storeName = (config.storeNameOverride?.trim() || "UNIVERSES").toUpperCase();
  const topOffset = config.topOffsetMm || 0;
  const leftOffset = config.leftOffsetMm || 0;

  // Balanced centered margins: 3.0mm horizontal, 2.5mm vertical
  const padTop = Math.max(0.5, 2.5 + topOffset);
  const padBottom = Math.max(0.5, 2.5 - topOffset);
  const padLeft = Math.max(0.5, 3.0 + leftOffset);
  const padRight = Math.max(0.5, 3.0 - leftOffset);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>GP-3120TU 75x100mm Calibration Test</title>
  <style>
    @page {
      size: 75mm 100mm;
      margin: 0 !important;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      width: 75mm;
      height: 100mm;
      background: #ffffff;
      color: #000000;
      font-family: monospace;
    }
    .calib-page {
      width: 75mm;
      height: 100mm;
      margin: 0;
      padding: ${padTop}mm ${padRight}mm ${padBottom}mm ${padLeft}mm;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      box-sizing: border-box;
      position: relative;
    }
    .safe-frame {
      width: 100%;
      height: 100%;
      border: 1.5px solid #000000;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      align-items: center;
      text-align: center;
      box-sizing: border-box;
      position: relative;
      padding: 3mm 2mm;
    }
    /* Corner Marks inside the safe frame */
    .c-tl { position: absolute; top: 1mm; left: 1mm; font-size: 8px; font-weight: bold; }
    .c-tr { position: absolute; top: 1mm; right: 1mm; font-size: 8px; font-weight: bold; }
    .c-bl { position: absolute; bottom: 1mm; left: 1mm; font-size: 8px; font-weight: bold; }
    .c-br { position: absolute; bottom: 1mm; right: 1mm; font-size: 8px; font-weight: bold; }
  </style>
</head>
<body>
  <div class="calib-page">
    <div class="safe-frame">
      <div class="c-tl">+ 0,0</div>
      <div class="c-tr">+ 75,0</div>
      <div class="c-bl">+ 0,100</div>
      <div class="c-br">+ 75,100</div>

      <div style="margin-top: 3mm;">
        <h2 style="margin:0; font-size: 14px; font-weight: 700;">${escapeHtml(storeName)}</h2>
        <p style="margin:2px 0 0 0; font-size: 8.5px; font-weight: bold;">GP-3120TU 75x100mm TEST PRINT</p>
      </div>

      <div style="border: 1px dashed #000; padding: 2.5mm; width: 94%;">
        <p style="margin: 0; font-size: 9.5px; font-weight: bold;">RULER BOUNDARY</p>
        <p style="margin: 2px 0; font-size: 8px;">WIDTH: 75mm | HEIGHT: 100mm</p>
        <p style="margin: 0; font-size: 7.5px;">Resolution: 203 DPI (~600x800 dots)</p>
        <p style="margin: 2px 0 0 0; font-size: 7px; color: #222;">Printable Width: ~69mm (Centered Margins)</p>
      </div>

      <div style="margin-bottom: 2mm;">
        <p style="margin: 0; font-size: 8.5px; font-weight: bold;">[GAP SENSOR CALIBRATION OK]</p>
        <p style="margin: 2px 0 0 0; font-size: 7px;">All 4 outer borders must be fully visible inside paper</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Triggers printing using a hidden iframe to ensure seamless browser-based printing
 * directly into the installed Windows printer driver (Gprinter GP-3120TU 75x100mm).
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
 * Prints test calibration sticker (75x100mm)
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
