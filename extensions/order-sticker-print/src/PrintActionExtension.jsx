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
  const [orderSummary, setOrderSummary] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function initPrint() {
      try {
        setLoading(true);
        setError(null);

        // 1. Extract selected order identifier
        const selectedOrder = data.selected && data.selected[0];
        if (!selectedOrder?.id) {
          throw new Error("No order selected for sticker printing");
        }

        const rawId = selectedOrder.id;
        const cleanId = String(rawId).replace(/^gid:\/\/shopify\/Order\//, "");

        // 2. Obtain authenticated session token
        let token = "";
        try {
          if (auth && typeof auth.idToken === "function") {
            token = (await auth.idToken()) || "";
          }
        } catch (authErr) {
          console.warn("[OrderStickerPrint] Could not retrieve session token:", authErr);
        }

        // 3. Build printable document URL for <s-admin-print-action src="...">
        const APP_ORIGIN = "https://orders.universesraw.com";
        const params = new URLSearchParams({
          ids: cleanId,
          embedded: "1",
        });
        if (token) {
          params.set("token", token);
        }

        const printUrl = `${APP_ORIGIN}/print/order-stickers?${params.toString()}`;
        setSrc(printUrl);

        // 4. Fetch validated sticker summary from backend
        try {
          const fetchHeaders = { "Content-Type": "application/json" };
          if (token) {
            fetchHeaders["Authorization"] = `Bearer ${token}`;
          }

          const res = await fetch(`${APP_ORIGIN}/api/orders/stickers`, {
            method: "POST",
            headers: fetchHeaders,
            body: JSON.stringify({
              orderIds: [cleanId],
              token: token || undefined,
            }),
          });

          if (res.ok) {
            const resData = await res.json();
            if (resData.stickers && resData.stickers.length > 0) {
              setOrderSummary(resData.stickers[0]);
            }
          }
        } catch (fetchErr) {
          console.warn("[OrderStickerPrint] Background details fetch error:", fetchErr);
        }
      } catch (err) {
        console.error("[OrderStickerPrint] Extension init error:", err);
        setError(err.message || "Failed to initialize order sticker");
      } finally {
        setLoading(false);
      }
    }

    initPrint();
  }, [data.selected]);

  return (
    <s-admin-print-action src={src}>
      <s-stack direction="block" gap="base">
        {loading && (
          <s-banner tone="info" heading="Preparing 75×100mm Thermal Sticker">
            Validating order line items, customer details, and verified COD amount...
          </s-banner>
        )}

        {error && (
          <s-banner tone="critical" heading="Sticker Generation Error">
            {error}
          </s-banner>
        )}

        {!loading && !error && orderSummary && (
          <s-stack direction="block" gap="base">
            <s-banner tone="success" heading="Sticker Ready">
              Order {orderSummary.orderNumber} prepared for 75mm × 100mm thermal printing.
            </s-banner>

            <s-section heading="Order & Customer Details">
              <s-stack direction="block" gap="small">
                <s-box>
                  <s-text type="strong">Order: </s-text>
                  <s-text>{orderSummary.orderNumber} ({orderSummary.orderDate})</s-text>
                </s-box>
                <s-box>
                  <s-text type="strong">Customer: </s-text>
                  <s-text>{orderSummary.customerName}</s-text>
                </s-box>
                <s-box>
                  <s-text type="strong">Phone: </s-text>
                  <s-text>{orderSummary.customerPhone || "No Phone"}</s-text>
                  {orderSummary.altPhone && (
                    <s-text> • Alt: {orderSummary.altPhone}</s-text>
                  )}
                </s-box>
                <s-box>
                  <s-text type="strong">Address: </s-text>
                  <s-text>{orderSummary.fullAddress}</s-text>
                </s-box>
              </s-stack>
            </s-section>

            <s-section heading="Product & Payment Summary">
              <s-stack direction="block" gap="small">
                <s-box>
                  <s-text type="strong">Items in Order: </s-text>
                  <s-text>{orderSummary.items.length} line item(s)</s-text>
                </s-box>
                <s-box>
                  <s-text type="strong">Total Order Value: </s-text>
                  <s-text>
                    {orderSummary.financials.currency}
                    {Number(orderSummary.financials.totalOrderValue).toLocaleString()}
                  </s-text>
                </s-box>
                <s-box>
                  <s-text type="strong">Payment Status: </s-text>
                  {orderSummary.financials.isPrepaid || orderSummary.financials.codAmount <= 0 ? (
                    <s-badge tone="success">PAID – NO COD</s-badge>
                  ) : (
                    <s-badge tone="warning">
                      CASH TO COLLECT: {orderSummary.financials.currency}{" "}
                      {Number(orderSummary.financials.codAmount).toLocaleString()}
                    </s-badge>
                  )}
                </s-box>
              </s-stack>
            </s-section>

            {orderSummary.warnings && orderSummary.warnings.length > 0 && (
              <s-banner tone="warning" heading="Verification Warning">
                {orderSummary.warnings.join(", ")}
              </s-banner>
            )}

            <s-section heading="Printer Instructions">
              <s-stack direction="block" gap="small">
                <s-text>
                  Review the sticker layout in the preview on the right. When ready, click
                  the Continue to print button below to print your thermal sticker.
                </s-text>
              </s-stack>
            </s-section>
          </s-stack>
        )}
      </s-stack>
    </s-admin-print-action>
  );
}
