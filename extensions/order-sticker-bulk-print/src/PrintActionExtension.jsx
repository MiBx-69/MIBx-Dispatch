import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";

export default async () => {
  render(<Extension />, document.body);
};

function Extension() {
  const { data, auth } = shopify;
  const [src, setSrc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stickers, setStickers] = useState([]);
  const [failedCount, setFailedCount] = useState(0);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function initBulkPrint() {
      try {
        setLoading(true);
        setError(null);

        // 1. Extract all selected order IDs from Shopify selection context
        const selectedList = data.selected || [];
        if (selectedList.length === 0) {
          throw new Error("No orders selected for bulk sticker printing");
        }

        const cleanIds = selectedList
          .map((item) => String(item.id).replace(/^gid:\/\/shopify\/Order\//, "").trim())
          .filter(Boolean);

        // 2. Obtain authenticated session token
        let token = "";
        try {
          if (auth && typeof auth.idToken === "function") {
            token = (await auth.idToken()) || "";
          }
        } catch (authErr) {
          console.warn("[OrderStickerBulkPrint] Could not retrieve session token:", authErr);
        }

        // 3. Build printable document URL for <s-admin-print-action src="...">
        const params = new URLSearchParams({
          ids: cleanIds.join(","),
          embedded: "1",
        });
        if (token) {
          params.set("token", token);
        }

        const printUrl = `/print/order-stickers?${params.toString()}`;
        setSrc(printUrl);

        // 4. Fetch validated sticker batch from backend
        try {
          const fetchHeaders = { "Content-Type": "application/json" };
          if (token) {
            fetchHeaders["Authorization"] = `Bearer ${token}`;
          }

          const res = await fetch("/api/orders/stickers", {
            method: "POST",
            headers: fetchHeaders,
            body: JSON.stringify({
              orderIds: cleanIds,
              token: token || undefined,
            }),
          });

          if (res.ok) {
            const resData = await res.json();
            setStickers(resData.stickers || []);
            setFailedCount(resData.failedCount || 0);
          }
        } catch (fetchErr) {
          console.warn("[OrderStickerBulkPrint] Background batch details fetch error:", fetchErr);
        }
      } catch (err) {
        console.error("[OrderStickerBulkPrint] Extension init error:", err);
        setError(err.message || "Failed to initialize bulk order stickers");
      } finally {
        setLoading(false);
      }
    }

    initBulkPrint();
  }, [data.selected]);

  const selectedCount = (data.selected || []).length;
  const validCount = stickers.filter((s) => s.isValid).length;

  return (
    <s-admin-print-action src={src}>
      <s-stack direction="block" gap="base">
        {loading && (
          <s-banner tone="info" heading="Preparing Batch Order Stickers">
            Validating {selectedCount} selected order(s) for Gprinter GP-3120TU printing...
          </s-banner>
        )}

        {error && (
          <s-banner tone="critical" heading="Bulk Print Error">
            {error}
          </s-banner>
        )}

        {!loading && !error && (
          <s-stack direction="block" gap="base">
            <s-banner tone="success" heading="Sticker Batch Ready">
              {validCount} sticker(s) generated sequentially from {selectedCount} selected order(s).
            </s-banner>

            {failedCount > 0 && (
              <s-banner tone="warning" heading="Unverified Orders">
                {failedCount} order(s) could not be retrieved or verified from Shopify.
              </s-banner>
            )}

            <s-section heading="Batch Summary">
              <s-stack direction="block" gap="small">
                <s-box>
                  <s-text type="strong">Selected Orders: </s-text>
                  <s-text>{selectedCount}</s-text>
                </s-box>
                <s-box>
                  <s-text type="strong">Valid Stickers Ready: </s-text>
                  <s-text>{validCount}</s-text>
                </s-box>
                <s-box>
                  <s-text type="strong">Label Dimensions: </s-text>
                  <s-text>75mm × 100mm (Direct Thermal Portrait)</s-text>
                </s-box>
                <s-box>
                  <s-text type="strong">Printer: </s-text>
                  <s-text>Gprinter GP-3120TU (203 DPI)</s-text>
                </s-box>
              </s-stack>
            </s-section>

            {stickers.length > 0 && (
              <s-section heading="Order Sequence Preview">
                <s-stack direction="block" gap="small">
                  {stickers.slice(0, 5).map((stk, idx) => (
                    <s-box key={stk.orderId || idx}>
                      <s-text type="strong">{idx + 1}. {stk.orderNumber}: </s-text>
                      <s-text>{stk.customerName} • </s-text>
                      {stk.financials.isPrepaid || stk.financials.codAmount <= 0 ? (
                        <s-badge tone="success">PAID</s-badge>
                      ) : (
                        <s-badge tone="warning">
                          COD {stk.financials.currency}{Number(stk.financials.codAmount).toLocaleString()}
                        </s-badge>
                      )}
                    </s-box>
                  ))}
                  {stickers.length > 5 && (
                    <s-box>
                      <s-text>...and {stickers.length - 5} more orders in sequence</s-text>
                    </s-box>
                  )}
                </s-stack>
              </s-section>
            )}

            <s-section heading="Printing Instructions">
              <s-stack direction="block" gap="small">
                <s-text>
                  Each order has an independent 75×100mm label with automatic page breaks.
                  Click the Print button below to output the entire batch to your Windows printer driver.
                </s-text>
              </s-stack>
            </s-section>
          </s-stack>
        )}
      </s-stack>
    </s-admin-print-action>
  );
}
