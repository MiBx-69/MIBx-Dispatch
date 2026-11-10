import type { DueSlipData, PrinterPaperConfig } from "@/types/due-slip";

/**
 * Generates self-contained standalone HTML and CSS for direct thermal printing.
 * Zero external font or CSS dependencies to guarantee instant, 100% offline rendering.
 */
export function generateDueSlipsHtml(
  slips: DueSlipData[],
  config: PrinterPaperConfig
): string {
  const unit = config.unit || "in";
  const widthVal = `${config.width}${unit}`;
  const heightVal = `${config.height}${unit}`;
  const storeName = (config.storeNameOverride?.trim() || slips[0]?.storeName || "STORE").toUpperCase();
  const currencySymbol = config.showCurrencySymbol ? (config.currencySymbol || "৳") : "";

  // Dynamic font sizing based on paper format
  const isCompact = (config.width <= 2.2 && config.height <= 1.5) || config.fontSize === "compact";
  const isLarge = config.width >= 3.5 && config.height >= 4;

  const fontSizes = isCompact
    ? {
        containerPadding: "2px 4px",
        store: "10px",
        orderDate: "8.5px",
        customer: "8.5px",
        phone: "9.5px",
        dueBox: "11px",
        dueLabel: "8px",
        lineHeight: "1.15",
      }
    : isLarge
    ? {
        containerPadding: "12px 16px",
        store: "20px",
        orderDate: "14px",
        customer: "14px",
        phone: "16px",
        dueBox: "20px",
        dueLabel: "12px",
        lineHeight: "1.3",
      }
    : {
        containerPadding: "6px 8px",
        store: "13px",
        orderDate: "10.5px",
        customer: "10.5px",
        phone: "12px",
        dueBox: "14px",
        dueLabel: "9px",
        lineHeight: "1.2",
      };

  const slipsHtml = slips
    .map((slip, index) => {
      const isPaid = slip.isPaid || slip.dueAmount <= 0;
      const formattedDue = Number(slip.dueAmount || 0).toLocaleString();
      const currentStore = (config.storeNameOverride?.trim() || slip.storeName || storeName).toUpperCase();

      return `
      <div class="due-slip-page ${index === slips.length - 1 ? 'is-last' : ''}">
        <div class="slip-inner">
          <!-- Store Header -->
          <div class="slip-header">
            <div class="store-name">${escapeHtml(currentStore)}</div>
          </div>

          <!-- Order & Date -->
          <div class="slip-row order-date-row">
            <span class="order-number">${escapeHtml(slip.orderNumber)}</span>
            ${config.showDate ? `<span class="order-date">${escapeHtml(slip.orderDate)}</span>` : ""}
          </div>

          <!-- Customer Info -->
          <div class="customer-info">
            <div class="info-line truncate">
              <span class="field-label">To:</span>
              <span class="field-value font-bold">${escapeHtml(slip.customerName || "Guest")}</span>
            </div>
            <div class="info-line truncate">
              <span class="field-label">Ph:</span>
              <span class="field-value font-bold phone-value">${escapeHtml(slip.customerPhone || "N/A")}</span>
            </div>
          </div>

          <!-- Due Amount Footer -->
          <div class="slip-footer">
            ${
              isPaid
                ? `<div class="due-box paid-box">
                    <span class="due-label">STATUS:</span>
                    <span class="due-val">PAID (${currencySymbol}0)</span>
                  </div>`
                : `<div class="due-box due-unpaid-box">
                    <span class="due-label">DUE AMT:</span>
                    <span class="due-val">${currencySymbol} ${formattedDue}</span>
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
  <title>Customer Due Slips - ${slips.length} Orders</title>
  <style>
    @page {
      size: ${widthVal} ${heightVal};
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
      width: 100%;
      height: 100%;
    }
    .due-slip-page {
      width: ${widthVal};
      height: ${heightVal};
      max-height: ${heightVal};
      page-break-after: always;
      break-after: page;
      page-break-inside: avoid;
      break-inside: avoid;
      overflow: hidden;
      background: #ffffff;
      color: #000000;
      margin: 0 auto;
      padding: 0;
      display: flex;
      flex-direction: column;
    }
    .due-slip-page.is-last {
      page-break-after: auto;
      break-after: auto;
    }
    .slip-inner {
      width: 100%;
      height: 100%;
      padding: ${fontSizes.containerPadding};
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      overflow: hidden;
    }
    .slip-header {
      width: 100%;
      text-align: center;
      border-bottom: 1.5px solid #000000;
      padding-bottom: 1px;
      margin-bottom: 1px;
    }
    .store-name {
      font-size: ${fontSizes.store};
      font-weight: 900;
      letter-spacing: -0.2px;
      text-transform: uppercase;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .slip-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      width: 100%;
    }
    .order-date-row {
      font-size: ${fontSizes.orderDate};
      font-weight: 700;
      margin-bottom: 1px;
    }
    .order-number {
      font-weight: 900;
      letter-spacing: -0.2px;
    }
    .order-date {
      font-weight: 500;
      font-size: 8px;
      opacity: 0.9;
    }
    .customer-info {
      display: flex;
      flex-direction: column;
      gap: 1px;
      margin: auto 0;
      line-height: ${fontSizes.lineHeight};
      overflow: hidden;
    }
    .info-line {
      display: flex;
      align-items: center;
      gap: 3px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: ${fontSizes.customer};
    }
    .field-label {
      font-size: 7.5px;
      text-transform: uppercase;
      font-weight: 800;
      opacity: 0.75;
      flex-shrink: 0;
    }
    .field-value {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .font-bold {
      font-weight: 700;
    }
    .phone-value {
      font-size: ${fontSizes.phone};
      font-weight: 900;
      letter-spacing: -0.2px;
    }
    .slip-footer {
      width: 100%;
      border-top: 1.5px solid #000000;
      padding-top: 1px;
      margin-top: 1px;
    }
    .due-box {
      width: 100%;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1px 3px;
      font-weight: 900;
      border: 1px solid #000000;
      box-sizing: border-box;
    }
    .due-unpaid-box {
      background-color: #000000 !important;
      color: #ffffff !important;
    }
    .due-unpaid-box .due-label,
    .due-unpaid-box .due-val {
      color: #ffffff !important;
    }
    .paid-box {
      background-color: #ffffff !important;
      color: #000000 !important;
    }
    .due-label {
      font-size: ${fontSizes.dueLabel};
      text-transform: uppercase;
      font-weight: 800;
      letter-spacing: 0.3px;
    }
    .due-val {
      font-size: ${fontSizes.dueBox};
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
        gap: 15px;
      }
      .due-slip-page {
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        border: 1px solid #d4d4d8;
      }
    }
  </style>
</head>
<body>
  ${slipsHtml}
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Triggers printing using a hidden iframe to ensure seamless browser-based printing
 * directly into the installed Windows printer driver (Gprinter GP-3120TU).
 */
export async function printDueSlipsViaIframe(
  slips: DueSlipData[],
  config: PrinterPaperConfig
): Promise<boolean> {
  if (typeof window === "undefined" || slips.length === 0) return false;

  return new Promise((resolve) => {
    try {
      // Remove any existing print iframes
      const existing = document.getElementById("mibx-due-slip-print-frame");
      if (existing) {
        existing.remove();
      }

      const iframe = document.createElement("iframe");
      iframe.id = "mibx-due-slip-print-frame";
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "0";
      iframe.style.visibility = "hidden";

      document.body.appendChild(iframe);

      const html = generateDueSlipsHtml(slips, config);

      iframe.srcdoc = html;

      iframe.onload = () => {
        // Allow brief time for rendering before printing
        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
            resolve(true);
          } catch (e) {
            console.error("[Printer] Frame print execution failed:", e);
            resolve(false);
          } finally {
            // Clean up iframe after user completes print dialog
            setTimeout(() => {
              iframe.remove();
            }, 3000);
          }
        }, 350);
      };
    } catch (err) {
      console.error("[Printer] Failed to setup print iframe:", err);
      resolve(false);
    }
  });
}

