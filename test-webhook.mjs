async function run() {
  const payload = {
    event: "Picked",
    consignment_id: "DU3108264NEX26",
    merchant_order_id: "#1493",
    updated_at: "2026-09-01T01:30:00Z",
    reason: null
  };

  const res = await fetch("http://localhost:3000/api/webhooks/pathao", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Pathao-Merchant-Webhook-Integration-Secret": "f3992ecc-59da-4cbe-a049-a13da2018d51"
    },
    body: JSON.stringify(payload)
  });
  const text = await res.text();
  console.log(res.status, text);
}

run().catch(console.error);
