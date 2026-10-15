import { type NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getShopifyOrders } from "@/lib/shopify/client";
import { deleteCachePattern } from "@/lib/redis";

export async function POST(request: NextRequest) {
  const supabase = createServiceClient();
  const url = new URL(request.url);
  const fullSync = url.searchParams.get("fullSync") === "true";

  // Only admins can trigger sync
  const { data: { user } } = await (await import("@/lib/supabase/server")).createClient().then(c => c.auth.getUser()).catch(() => ({ data: { user: null } }));

  // Insert sync log
  const { data: syncLog } = await supabase
    .from("sync_logs")
    .insert({
      sync_type: fullSync ? "full_shopify" : "delta_shopify",
      status: "running",
      orders_synced: 0,
      customers_synced: 0,
      errors: 0,
    })
    .select()
    .single();

  const logId = syncLog?.id;

  // Wait for sync to complete (Vercel kills unawaited promises)
  await runShopifySync(supabase, logId, fullSync).catch(console.error);

  return NextResponse.json({
    message: "Sync completed",
    sync_log_id: logId,
  });
}

export async function GET(request: NextRequest) {
  const supabase = createServiceClient();
  const { data: logs } = await supabase
    .from("sync_logs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(10);
  return NextResponse.json({ logs });
}

async function runShopifySync(supabase: any, logId?: string, fullSync = false) {
  let ordersCount = 0;
  let customersCount = 0;
  let errors = 0;
  let cursor: string | undefined;

  let query: string;
  if (fullSync) {
    query = `created_at:>='2026-08-31T18:00:00Z'`;
  } else {
    const { data: lastLog } = await supabase
      .from("sync_logs")
      .select("started_at")
      .eq("status", "completed")
      .eq("sync_type", "delta_shopify")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastLog?.started_at) {
      query = `updated_at:>='${lastLog.started_at}'`;
    } else {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      query = `updated_at:>='${yesterday}'`;
    }
  }

  try {
    const { data: settings } = await supabase
      .from("app_settings")
      .select("fraud_check_enabled, fraudspy_api_key, sms_auto_order_enabled, sms_auto_order_template")
      .single();

    // Paginate through Shopify orders
    do {
      const result = await getShopifyOrders({
        first: 250,
        after: cursor,
        query
      });

      const orders = result.edges.map((e: any) => e.node);

      // Process in chunks of 10 to avoid rate limits while being fast
      const chunkSize = 10;
      for (let i = 0; i < orders.length; i += chunkSize) {
        const chunk = orders.slice(i, i + chunkSize);
        await Promise.all(
          chunk.map(async (shopifyOrder: any) => {
            try {
              await upsertShopifyOrder(supabase, shopifyOrder, fullSync, settings);
              ordersCount++;

              if (shopifyOrder.customer) {
                await upsertShopifyCustomer(supabase, shopifyOrder.customer);
                customersCount++;
              }
            } catch (err) {
              console.error(`[Sync] Error for order ${shopifyOrder.name}:`, err);
              errors++;
            }
          })
        );
      }

      cursor = result.pageInfo.hasNextPage ? result.pageInfo.endCursor : undefined;
    } while (cursor);

    // Clear relevant caches
    await deleteCachePattern("shopify:orders:*");
    await deleteCachePattern("dashboard:stats");

    // Update sync log as completed
    if (logId) {
      await supabase
        .from("sync_logs")
        .update({
          status: "completed",
          orders_synced: ordersCount,
          customers_synced: customersCount,
          errors,
          completed_at: new Date().toISOString(),
        })
        .eq("id", logId);
    }

    console.log(`[Sync] Completed: ${ordersCount} orders, ${customersCount} customers, ${errors} errors`);
  } catch (err: any) {
    console.error("[Sync] Fatal error:", err);
    if (logId) {
      await supabase
        .from("sync_logs")
        .update({
          status: "failed",
          error_details: err.message,
          completed_at: new Date().toISOString(),
        })
        .eq("id", logId);
    }
  }
}

async function upsertShopifyOrder(supabase: any, shopifyOrder: any, isFullSync: boolean = false, settings: any = null) {
  const shippingAddr = shopifyOrder.shippingAddress;
  const customer = shopifyOrder.customer;

  const lineItems = shopifyOrder.lineItems.edges
    .map((e: any) => ({
      title: e.node.title,
      quantity: typeof e.node.currentQuantity === "number" ? e.node.currentQuantity : e.node.quantity,
      original_quantity: e.node.quantity,
      price: parseFloat(e.node.originalUnitPriceSet?.shopMoney?.amount || "0"),
      sku: e.node.sku,
      variant_title: e.node.variantTitle,
      weight: null,
      weight_unit: null,
      image: e.node.image?.url,
    }));

  const fulfillments = shopifyOrder.fulfillments || [];
  const lastFulfillment = fulfillments[fulfillments.length - 1];
  
  // orderName is usually like #1001, so we strip non-digits to get a number if possible
  const parsedOrderNumber = parseInt(shopifyOrder.name.replace(/\\D/g, ""), 10);

  const orderPayload: any = {
    shopify_order_id: parseInt(shopifyOrder.id.split("/").pop()!),
    shopify_order_name: shopifyOrder.name,
    shopify_order_number: isNaN(parsedOrderNumber) ? null : parsedOrderNumber,
    customer_shopify_id: customer ? parseInt(customer.id.split("/").pop()!) : null,
    customer_name: shippingAddr?.name || (customer ? `${customer.firstName} ${customer.lastName}`.trim() : "Unknown"),
    customer_phone: shippingAddr?.phone || customer?.phone || null,
    customer_email: customer?.email || shopifyOrder.email,
    shipping_address: shippingAddr,
    line_items: lineItems,
    total_price: parseFloat(shopifyOrder.currentTotalPriceSet?.shopMoney?.amount || shopifyOrder.totalPriceSet?.shopMoney?.amount || "0"),
    subtotal_price: parseFloat(shopifyOrder.currentSubtotalPriceSet?.shopMoney?.amount || shopifyOrder.subtotalPriceSet?.shopMoney?.amount || "0"),
    total_tax: parseFloat(shopifyOrder.totalTaxSet?.shopMoney?.amount || "0"),
    currency: shopifyOrder.totalPriceSet?.shopMoney?.currencyCode || "BDT",
    financial_status: shopifyOrder.displayFinancialStatus?.toLowerCase(),
    fulfillment_status: shopifyOrder.displayFulfillmentStatus?.toLowerCase() || null,
    shopify_tags: shopifyOrder.tags || [],
    note: shopifyOrder.note,
    shopify_created_at: shopifyOrder.createdAt,
    shopify_updated_at: shopifyOrder.updatedAt,
    shopify_fulfillment_id: lastFulfillment?.id
      ? parseInt(lastFulfillment.id.split("/").pop()!).toString()
      : null,
    synced_at: new Date().toISOString(),
  };

  const { data: existingOrder } = await supabase
    .from("orders")
    .select("id, internal_status, pathao_consignment_id")
    .eq("shopify_order_id", orderPayload.shopify_order_id)
    .maybeSingle();

  const fs = (orderPayload.fulfillment_status || "").toLowerCase();
  const tagsStr = (shopifyOrder.tags || []).join(" ").toLowerCase();
  const isShopifyHold = fs === "on_hold" || fs === "hold" || tagsStr.includes("hold");

  if (shopifyOrder.cancelledAt) {
    orderPayload.internal_status = "cancelled";
    orderPayload.cancel_reason = shopifyOrder.cancelReason || "Cancelled via Shopify";
  } else if (isShopifyHold) {
    orderPayload.internal_status = "hold";
    orderPayload.fulfillment_status = "on_hold";
  } else if (
    !existingOrder ||
    (!["delivered", "returned", "cancelled"].includes(existingOrder.internal_status))
  ) {
    if (fs === "in_progress" || fs === "partial" || fs === "partially_fulfilled") {
      orderPayload.internal_status = "preparing";
    } else if (fs === "fulfilled") {
      // ONLY mark as dispatched if it was really dispatched via the Dispatch web app (has Pathao consignment)
      if (existingOrder?.pathao_consignment_id) {
        orderPayload.internal_status = "dispatched";
      } else {
        // Not dispatched from Dispatch app: keep existing status, or revert to pending if falsely marked dispatched
        orderPayload.internal_status = existingOrder?.internal_status === "dispatched"
          ? "pending"
          : (existingOrder?.internal_status || "pending");
      }
    } else if (existingOrder?.internal_status === "hold" && !isShopifyHold) {
      // Hold was released in Shopify
      orderPayload.internal_status = existingOrder.pathao_consignment_id ? "dispatched" : "pending";
    } else if (!existingOrder) {
      orderPayload.internal_status = "pending";
    }
  }

  // If order is marked on hold, update any active dispatches row as well
  if (isShopifyHold && existingOrder?.id) {
    await supabase
      .from("dispatches")
      .update({ pathao_order_status: "Hold", updated_at: new Date().toISOString() })
      .eq("order_id", existingOrder.id)
      .not("pathao_order_status", "in", '("Delivered","Returned","Return","Paid Return","Return Completed","Cancelled")');
  }

  if (!existingOrder) {
    if (!settings) {
      const { data } = await supabase.from("app_settings").select("fraud_check_enabled, fraudspy_api_key, mr_fraud_checker_enabled, mr_fraud_checker_api_key, sms_auto_order_enabled, sms_auto_order_template").single();
      settings = data;
    }
    
    let fraudRes: any = null;
    let mrFraudRes: any = null;
    const isFraudSpyActive = Boolean(settings?.fraud_check_enabled && settings?.fraudspy_api_key);
    const isMrFraudActive = Boolean(settings?.mr_fraud_checker_enabled && settings?.mr_fraud_checker_api_key);
    const hasPhone = Boolean(orderPayload.customer_phone);
    const canRunFraudSpy = isFraudSpyActive && hasPhone;
    const canRunMrFraud = isMrFraudActive && hasPhone;

    if (canRunFraudSpy || canRunMrFraud) {
      const { searchFraud } = await import("@/lib/fraudspy");
      const { checkMrFraud } = await import("@/lib/mr-fraud-checker");

      const [fraudSpyResult, mrFraudResult] = await Promise.allSettled([
        canRunFraudSpy ? searchFraud(orderPayload.customer_phone!, settings.fraudspy_api_key!) : Promise.resolve(null),
        canRunMrFraud ? checkMrFraud(orderPayload.customer_phone!, settings.mr_fraud_checker_api_key!) : Promise.resolve(null),
      ]);

      if (fraudSpyResult.status === "fulfilled" && fraudSpyResult.value?.ok) {
        fraudRes = fraudSpyResult.value;
      }
      if (mrFraudResult.status === "fulfilled" && mrFraudResult.value?.ok) {
        mrFraudRes = mrFraudResult.value;
      }

      if (fraudRes || mrFraudRes) {
        const { analyzeCustomerRisk } = await import("@/lib/risk-analytics");

        let primaryAnalysis = fraudRes?.ok
          ? analyzeCustomerRisk(fraudRes)
          : analyzeCustomerRisk({
              overall: {
                total: mrFraudRes.total_parcel,
                delivered: mrFraudRes.success_parcel,
                returned: mrFraudRes.cancel_parcel,
                success_ratio: mrFraudRes.total_parcel > 0
                  ? Math.round((mrFraudRes.success_parcel / mrFraudRes.total_parcel) * 100) : 0,
              },
              fraud_reports: { count: 0, risk: { level: "low", score: 0 }, reports: [] },
              ok: true,
            });

        if (fraudRes?.ok && mrFraudRes) {
          const mrAnalysis = analyzeCustomerRisk({
            overall: {
              total: mrFraudRes.total_parcel,
              delivered: mrFraudRes.success_parcel,
              returned: mrFraudRes.cancel_parcel,
              success_ratio: mrFraudRes.total_parcel > 0
                ? Math.round((mrFraudRes.success_parcel / mrFraudRes.total_parcel) * 100) : 0,
            },
            fraud_reports: { count: 0, risk: { level: "low", score: 0 }, reports: [] },
            ok: true,
          });
          const combinedScore = Math.round((primaryAnalysis.riskScore * 0.6) + (mrAnalysis.riskScore * 0.4));
          if (combinedScore > primaryAnalysis.riskScore) {
            primaryAnalysis = { ...primaryAnalysis, riskScore: combinedScore };
          }
        }

        if (fraudRes?.ok) orderPayload.fraud_data = fraudRes;
        orderPayload.fraud_status = primaryAnalysis.riskLevel;
        orderPayload.fraud_score = primaryAnalysis.riskScore;
      }
    }

    // Add mr_fraud_data to orderPayload before upsert
    if (mrFraudRes?.ok) {
      (orderPayload as any).mr_fraud_data = mrFraudRes;
    }

    const { data: upsertedOrder } = await supabase.from("orders").upsert(
      orderPayload,
      { onConflict: "shopify_order_id" }
    ).select().single();

    // Fire off async side effects concurrently after saving to DB to avoid blocking
    const sideEffects = [];
    
    if (fraudRes?.ok || mrFraudRes?.ok) {
      const providerParts: string[] = [];
      if (fraudRes?.ok) providerParts.push("FraudSpy");
      if (mrFraudRes?.ok) providerParts.push("MrFraud");
      const providerTag = providerParts.join("+") || "FraudSpy";
      const riskLabel = orderPayload.fraud_status === 'fraud' ? 'High Risk' : orderPayload.fraud_status === 'risky' ? 'Medium Risk' : 'Safe';
      const tag = `${providerTag}: ${riskLabel}`;
      const verifiedTag = providerParts.length > 1 ? "Fraud Checked" : `${providerTag} Verified`;

      const { updateShopifyCustomer, updateShopifyOrder } = await import("@/lib/shopify/client");
      
      if (orderPayload.customer_shopify_id) {
        sideEffects.push(
          supabase.from("customers").select("shopify_tags").eq("shopify_customer_id", orderPayload.customer_shopify_id).single()
            .then(async ({ data: customerData }: any) => {
              const existingTags = customerData?.shopify_tags || [];
              const mergedTags = Array.from(new Set([...existingTags, tag, verifiedTag]));
              await updateShopifyCustomer({
                id: `gid://shopify/Customer/${orderPayload.customer_shopify_id}`,
                tags: mergedTags
              });
            })
            .catch((e: any) => console.error("Failed to update Shopify customer during sync:", e))
        );
      }

      if (orderPayload.shopify_order_id) {
        const customAttributes: Array<{ key: string; value: string }> = [];
        if (fraudRes?.ok) {
          customAttributes.push(
            { key: "FraudSpy Status", value: (orderPayload.fraud_status || "").toUpperCase() },
            { key: "FraudSpy Score", value: (orderPayload.fraud_score || 0).toString() },
            { key: "FraudSpy Delivered", value: (fraudRes.overall?.delivered || 0).toString() },
            { key: "FraudSpy Returned", value: (fraudRes.overall?.returned || 0).toString() },
            { key: "FraudSpy Success Ratio", value: `${fraudRes.overall?.success_ratio || 0}%` },
            { key: "FraudSpy Last Checked", value: new Date().toLocaleString() }
          );
        }
        if (mrFraudRes?.ok) {
          customAttributes.push(
            { key: "MrFraud Status", value: mrFraudRes.status },
            { key: "MrFraud Delivered", value: mrFraudRes.success_parcel.toString() },
            { key: "MrFraud Returned", value: mrFraudRes.cancel_parcel.toString() },
          );
        }
        sideEffects.push(
          updateShopifyOrder({
            id: `gid://shopify/Order/${orderPayload.shopify_order_id}`,
            tags: [tag, verifiedTag],
            customAttributes,
          }).catch((e: any) => console.error("Failed to update Shopify order during sync:", e))
        );
      }
    }

    // Send auto SMS if not a full sync
    if (!isFullSync && settings?.sms_auto_order_enabled && settings?.sms_auto_order_template && orderPayload.customer_phone) {
      const { sendSMS } = await import("@/lib/sms");
      const msg = settings.sms_auto_order_template
        .replace("{{order_id}}", orderPayload.shopify_order_name || orderPayload.shopify_order_id.toString())
        .replace("{{customer_name}}", orderPayload.customer_name || "Customer");
      sideEffects.push(
        sendSMS(orderPayload.customer_phone, msg, false, `order_confirmation_${orderPayload.shopify_order_id}`).catch(e => console.error("Sync SMS Error:", e))
      );
    }

    await Promise.all(sideEffects);
    
    if (upsertedOrder) {
      const { logOrderEvent } = await import("@/lib/audit");
      await logOrderEvent(upsertedOrder.id, "SYNCED", "Order synced manually from Shopify");
    }
  }

  let targetOrderId = existingOrder?.id;
  if (existingOrder) {
    const { data: updateRes } = await supabase.from("orders").upsert(
      orderPayload,
      { onConflict: "shopify_order_id" }
    ).select("id").single();
    if (updateRes) targetOrderId = updateRes.id;
  } else {
    const { data: newRes } = await supabase.from("orders").select("id").eq("shopify_order_id", orderPayload.shopify_order_id).single();
    if (newRes) targetOrderId = newRes.id;
  }

  // Check if order has been returned/refunded on Shopify (only for non-cancelled orders)
  if (shopifyOrder.cancelledAt) {
    // Ensure cancelled order has no returns table records
    if (targetOrderId) {
      await supabase.from("returns").delete().eq("order_id", targetOrderId);
      await supabase.from("dispatches").update({
        is_cancelled: true,
        cancelled_at: shopifyOrder.cancelledAt,
        cancel_reason: shopifyOrder.cancelReason || "Cancelled on Shopify",
      }).eq("order_id", targetOrderId);
    }
  } else {
    const finStatus = (orderPayload.financial_status || "").toLowerCase();
    if (finStatus === "refunded" || finStatus === "partially_refunded") {
      try {
        const { handleShopifyRefundOrReturn, isShopifyExchange } = await import("@/lib/shopify-returns");
        if (isShopifyExchange({ order: orderPayload, payload: shopifyOrder })) {
          console.log(`[Sync] Order ${orderPayload.shopify_order_name} is an exchange. Skipping return creation.`);
        } else {
          await handleShopifyRefundOrReturn({
            shopifyOrderId: orderPayload.shopify_order_id,
            refundData: {
              financial_status: finStatus,
              note: orderPayload.note,
            },
            topic: "sync/orders",
          });
        }
      } catch (refundErr) {
        console.error("[Sync] Error syncing return for order:", refundErr);
      }
    }
  }
}

async function upsertShopifyCustomer(supabase: any, customer: any) {
  await supabase.from("customers").upsert(
    {
      shopify_customer_id: parseInt(customer.id.split("/").pop()!),
      name: `${customer.firstName} ${customer.lastName}`.trim(),
      email: customer.email,
      phone: customer.phone,
      total_orders: customer.numberOfOrders || 0,
      total_spent: parseFloat(customer.amountSpent?.amount || "0"),
      synced_at: new Date().toISOString(),
    },
    { onConflict: "shopify_customer_id" }
  );
}
