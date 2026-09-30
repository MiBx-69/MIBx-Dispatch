import { NextRequest, NextResponse } from "next/server";
import { createServiceClient, createClient } from "@/lib/supabase/server";
import { createPathaoOrder, getPathaoCities, getPathaoZones } from "@/lib/pathao/client";
import { createShopifyFulfillment, updateShopifyOrder } from "@/lib/shopify/client";
import { logOrderEvent } from "@/lib/audit";

export interface DispatchParams {
  order_id: string;
  store_id?: number;
  recipient_name?: string;
  recipient_phone?: string;
  recipient_address?: string;
  recipient_city?: string | number;
  recipient_zone?: string | number;
  recipient_area?: string | number;
  delivery_type?: number;
  item_type?: number;
  item_quantity?: number;
  item_weight?: number;
  amount_to_collect?: number | string;
  item_description?: string;
  special_instruction?: string;
  force?: boolean;
}

export async function executeDispatchOrder(params: DispatchParams, profileId?: string) {
  const supabase = createServiceClient();
  const {
    order_id,
    store_id,
    recipient_name,
    recipient_phone,
    recipient_address,
    recipient_city,
    recipient_zone,
    recipient_area,
    delivery_type = 48,
    item_type = 2,
    item_quantity = 1,
    item_weight = 0.5,
    amount_to_collect,
    item_description,
    special_instruction,
    force = false,
  } = params;

  if (!order_id) {
    throw new Error("order_id is required");
  }

  // Fetch order from DB
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("*")
    .eq("id", order_id)
    .single();

  if (orderError || !order) {
    const error: any = new Error("Order not found");
    error.statusCode = 404;
    throw error;
  }

  // Prevent dispatching cancelled orders
  if (order.internal_status === "cancelled") {
    const error: any = new Error(`Cannot dispatch cancelled order ${order.shopify_order_name || order.id}`);
    error.statusCode = 400;
    throw error;
  }

  // Prevent duplicate dispatch & double billing unless force flag is explicitly true
  if ((order.internal_status === "dispatched" || order.pathao_consignment_id) && !force) {
    const error: any = new Error(
      `Order ${order.shopify_order_name || order.id} is already dispatched with consignment ${order.pathao_consignment_id || "assigned"}. Use force=true to override.`
    );
    error.statusCode = 409;
    error.consignment_id = order.pathao_consignment_id;
    throw error;
  }

  // Get settings for store_id and special instructions
  const { data: settings } = await supabase
    .from("app_settings")
    .select("pathao_store_id, pathao_special_instruction")
    .single();

  const pathaoStoreId = store_id || settings?.pathao_store_id;
  if (!pathaoStoreId) {
    const error: any = new Error("Pathao store_id not configured. Check Settings.");
    error.statusCode = 400;
    throw error;
  }

  // Keep default store in sync with active usage
  if (pathaoStoreId && (!settings?.pathao_store_id || settings.pathao_store_id !== pathaoStoreId)) {
    supabase
      .from("app_settings")
      .update({ pathao_store_id: pathaoStoreId })
      .neq("id", "00000000-0000-0000-0000-000000000000")
      .then(() => {});
  }

  let finalAddress = recipient_address || (order.shipping_address as any)?.address1 || "";
  const cityProv = `${(order.shipping_address as any)?.city || ""} ${(order.shipping_address as any)?.province || ""}`.trim();
  if (finalAddress.length < 10) {
    finalAddress = `${finalAddress}, ${cityProv}`.trim();
    if (finalAddress.length < 10) {
      finalAddress = finalAddress.padEnd(10, ".");
    }
  }

  // Auto-resolve City & Zone if missing
  let finalCity = recipient_city ? parseInt(String(recipient_city), 10) : undefined;
  let finalZone = recipient_zone ? parseInt(String(recipient_zone), 10) : undefined;
  let finalArea = recipient_area ? parseInt(String(recipient_area), 10) : undefined;

  if (!finalCity) {
    const addressString = `${finalAddress} ${cityProv}`.toLowerCase();
    const cities = await getPathaoCities();
    const dhaka = cities.find((c: any) => c.city_name.toLowerCase().includes("dhaka"));

    const matchedCity = cities.find((c: any) => addressString.includes(c.city_name.toLowerCase()));
    finalCity = matchedCity ? matchedCity.city_id : (dhaka ? dhaka.city_id : (cities[0]?.city_id || 1));

    if (!finalZone && finalCity) {
      const zones = await getPathaoZones(finalCity);
      const matchedZone = zones.find((z: any) => addressString.includes(z.zone_name.toLowerCase()));
      finalZone = matchedZone ? matchedZone.zone_id : (zones[0]?.zone_id || 1);
    }
  }

  let finalPhone = recipient_phone || order.customer_phone || "";
  // Sanitize phone for BD format
  finalPhone = finalPhone.replace(/\D/g, "");
  if (finalPhone.startsWith("880")) finalPhone = finalPhone.substring(2);
  if (finalPhone.startsWith("80")) finalPhone = finalPhone.substring(1);
  if (!finalPhone.startsWith("0")) finalPhone = "0" + finalPhone;
  if (finalPhone.length > 11) finalPhone = finalPhone.substring(finalPhone.length - 11);

  const finalAmount = Math.round(parseFloat(String(amount_to_collect ?? (order.total_price || "0"))));

  // Combine global special instructions with order specific instructions
  let finalInstruction = special_instruction || "";
  if (settings?.pathao_special_instruction) {
    finalInstruction = finalInstruction
      ? `${settings.pathao_special_instruction} | ${finalInstruction}`
      : settings.pathao_special_instruction;
  }

  // 1. Create Pathao order
  const pathaoResponse = await createPathaoOrder({
    store_id: pathaoStoreId,
    merchant_order_id: order.shopify_order_name,
    recipient_name: recipient_name || order.customer_name,
    recipient_phone: finalPhone,
    recipient_address: finalAddress,
    ...(finalCity && { recipient_city: finalCity }),
    ...(finalZone && { recipient_zone: finalZone }),
    ...(finalArea && { recipient_area: finalArea }),
    delivery_type,
    item_type,
    item_quantity,
    item_weight,
    amount_to_collect: finalAmount,
    item_description: item_description || (order.line_items as any[])[0]?.title,
    special_instruction: finalInstruction,
  });

  if (!pathaoResponse?.data?.consignment_id) {
    throw new Error(pathaoResponse?.message || "Failed to create order in Pathao. No consignment ID returned.");
  }

  const { consignment_id, delivery_fee } = pathaoResponse.data;

  // 2. Save dispatch record to DB
  const fraudData = order.fraud_data;
  let riskAnalysis: any = null;
  if (fraudData) {
    const { analyzeCustomerRisk } = await import("@/lib/risk-analytics");
    riskAnalysis = analyzeCustomerRisk(fraudData);
  }

  const pathaoResponseWithFraud = {
    ...(pathaoResponse as any),
    fraud_summary: riskAnalysis ? {
      status: riskAnalysis.riskLevel,
      score: riskAnalysis.riskScore,
      rating: riskAnalysis.ratingLabel,
      success_ratio: riskAnalysis.successRatio,
      delivered: (fraudData as any)?.overall?.delivered || 0,
      returned: (fraudData as any)?.overall?.returned || 0,
      total: (fraudData as any)?.overall?.total || 0,
    } : null,
  };

  await supabase.from("dispatches").insert({
    order_id: order.id,
    shopify_order_id: order.shopify_order_id,
    shopify_order_name: order.shopify_order_name,
    consignment_id,
    merchant_order_id: order.shopify_order_name,
    pathao_order_status: "Pending",
    delivery_fee,
    recipient_name: recipient_name || order.customer_name,
    recipient_phone: recipient_phone || order.customer_phone,
    recipient_address:
      recipient_address ||
      (order.shipping_address as any)?.address1 ||
      "",
    recipient_city: finalCity,
    recipient_zone: finalZone,
    amount_to_collect: amount_to_collect !== undefined && amount_to_collect !== null
      ? Number(amount_to_collect)
      : (order.total_price !== null ? Number(order.total_price) : 0),
    item_weight,
    item_quantity,
    delivery_type,
    item_type,
    item_description,
    pathao_response: pathaoResponseWithFraud as any,
    dispatched_by: profileId || null,
  });

  // 3. Update order in DB with consignment ID and status
  const recipientPhoneStr = recipient_phone || order.customer_phone || "";
  const trackingUrl = `https://merchant.pathao.com/tracking?consignment_id=${consignment_id}&phone=${encodeURIComponent(recipientPhoneStr)}`;
  await supabase
    .from("orders")
    .update({
      internal_status: "dispatched",
      pathao_consignment_id: consignment_id,
      pathao_tracking_url: trackingUrl,
      pathao_delivery_status: "Pending",
    })
    .eq("id", order.id);

  const fraudAuditSuffix = riskAnalysis ? ` | Fraud: ${riskAnalysis.ratingLabel} (${riskAnalysis.successRatio}% DLV)` : "";
  await logOrderEvent(
    order.id,
    "DISPATCHED",
    `Order dispatched via Pathao (Consignment: ${consignment_id})${fraudAuditSuffix}`,
    { consignment_id, trackingUrl, fraud_summary: pathaoResponseWithFraud.fraud_summary }
  );

  // 4. Create Shopify fulfillment with tracking
  let shopifyFulfillmentId: string | null = null;
  try {
    const shopifyOrderGid = `gid://shopify/Order/${order.shopify_order_id}`;
    const fulfillmentOrders = await getShopifyFulfillmentOrders(shopifyOrderGid);
    const fulfillmentOrderId = fulfillmentOrders?.[0]?.id;

    if (fulfillmentOrderId) {
      const fulfillment = await createShopifyFulfillment({
        fulfillmentOrderId,
        trackingCompany: "Pathao",
        trackingNumber: consignment_id,
        trackingUrl,
        notifyCustomer: true,
      });
      shopifyFulfillmentId = fulfillment.id;

      await supabase
        .from("orders")
        .update({ shopify_fulfillment_id: shopifyFulfillmentId })
        .eq("id", order.id);
    }
  } catch (shopifyErr) {
    console.error("[Dispatch] Shopify fulfillment error (non-fatal):", shopifyErr);
  }

  // 5. Attach tracking & fraud report to Shopify Order Note & Tags
  try {
    const { buildDispatchCustomAttributes, buildDispatchCombinedNote } = await import("@/lib/fraud-checker");
    const customAttributes = buildDispatchCustomAttributes({
      consignmentId: consignment_id,
      trackingUrl,
      fraudData,
      riskAnalysis,
    });

    const combinedNote = buildDispatchCombinedNote({
      consignmentId: consignment_id,
      trackingUrl,
      existingNote: order.note,
      fraudData,
      riskAnalysis,
    });

    const fraudTag = riskAnalysis ? `FraudSpy: ${riskAnalysis.riskLevel === 'fraud' ? 'High Risk' : riskAnalysis.riskLevel === 'risky' ? 'Medium Risk' : 'Safe'}` : null;

    await updateShopifyOrder({
      id: `gid://shopify/Order/${order.shopify_order_id}`,
      note: combinedNote,
      tags: Array.from(new Set([
        ...(order.shopify_tags || []),
        "Dispatched via Pathao",
        `pathao:${consignment_id}`,
        "dispatched",
        ...(fraudTag ? [fraudTag, 'FraudSpy Verified'] : []),
      ])),
      ...(customAttributes ? { customAttributes } : {}),
    });

    await supabase
      .from("orders")
      .update({ note: combinedNote })
      .eq("id", order.id);
  } catch (tagErr) {
    console.error("[Dispatch] Shopify tag/attributes update error (non-fatal):", tagErr);
  }

  // 6. Automated SMS on Dispatch
  try {
    const { data: smsSettings } = await supabase
      .from("app_settings")
      .select("sms_api_key, sms_auto_dispatch_enabled, sms_auto_dispatch_template")
      .single();

    if (smsSettings?.sms_api_key && smsSettings.sms_auto_dispatch_enabled) {
      const phone = recipient_phone || order.customer_phone;
      if (phone) {
        const { sendSMS } = await import("@/lib/sms");
        const template =
          smsSettings.sms_auto_dispatch_template ||
          "প্রিয় {{customer_name}}, Universes থেকে আপনার অর্ডার {{order_id}} ডিসপ্যাচ করা হয়েছে। খুব শীঘ্রই আপনি প্রোডাক্টটি পেয়ে যাবেন। আপনার বকেয়া বিল {{total_price}} টাকা। প্রোডাক্টটি গ্রহণ করার জন্য অনুগ্রহ করে বিল প্রস্তুত রাখুন।";

        const msg = template
          .replace(/\{\{order_id\}\}/g, order.shopify_order_name || order.id)
          .replace(/\{\{customer_name\}\}/g, recipient_name || order.customer_name || "Customer")
          .replace(/\{\{tracking_url\}\}/g, trackingUrl)
          .replace(/\{\{total_price\}\}/g, String(amount_to_collect || order.total_price || "0"));

        await sendSMS(phone, msg, false, `dispatch_${order.id}_${consignment_id}`, {
          orderId: order.shopify_order_id,
          orderName: order.shopify_order_name,
          customerName: recipient_name || order.customer_name,
          eventType: "dispatch",
        });
      }
    }
  } catch (smsErr) {
    console.error("[Dispatch] SMS send error (non-fatal):", smsErr);
  }

  return {
    success: true,
    consignment_id,
    delivery_fee,
    tracking_url: trackingUrl,
    shopify_fulfillment_id: shopifyFulfillmentId,
  };
}

export async function POST(request: NextRequest) {
  // Auth check
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .single();

  try {
    const body = await request.json();
    const result = await executeDispatchOrder(body, profile?.id);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[Dispatch] Error:", err);
    return NextResponse.json(
      { error: err.message, ...(err.consignment_id ? { consignment_id: err.consignment_id } : {}) },
      { status: err.statusCode || 500 }
    );
  }
}

// Get fulfillment orders for a Shopify order
async function getShopifyFulfillmentOrders(orderId: string) {
  const token = process.env.SHOPIFY_ACCESS_TOKEN;
  const domain = process.env.SHOPIFY_SHOP_DOMAIN;
  const version = process.env.SHOPIFY_API_VERSION || "2026-07";

  const res = await fetch(
    `https://${domain}/admin/api/${version}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token!,
      },
      body: JSON.stringify({
        query: `
          query GetFulfillmentOrders($orderId: ID!) {
            order(id: $orderId) {
              fulfillmentOrders(first: 5) {
                edges {
                  node {
                    id
                    status
                    assignedLocation { name }
                  }
                }
              }
            }
          }
        `,
        variables: { orderId },
      }),
    }
  );

  const data = await res.json();
  const nodes = data.data?.order?.fulfillmentOrders?.edges?.map((e: any) => e.node) || [];
  const openOrHeld = nodes.filter((n: any) => n.status === "OPEN" || n.status === "ON_HOLD");

  for (const fo of openOrHeld) {
    if (fo.status === "ON_HOLD") {
      try {
        const { releaseShopifyFulfillmentOrderHold } = await import("@/lib/shopify/client");
        await releaseShopifyFulfillmentOrderHold(fo.id);
        fo.status = "OPEN";
      } catch (releaseErr) {
        console.error(`[Dispatch] Failed to release hold on FO ${fo.id}:`, releaseErr);
      }
    }
  }

  return openOrHeld.filter((n: any) => n.status === "OPEN");
}

// Bulk dispatch
export async function PUT(request: NextRequest) {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .single();

  const body = await request.json();
  const { order_ids, dispatch_params } = body;

  if (!Array.isArray(order_ids) || order_ids.length === 0) {
    return NextResponse.json({ error: "order_ids array required" }, { status: 400 });
  }

  const results: any[] = [];
  const chunkSize = 5;

  for (let i = 0; i < order_ids.length; i += chunkSize) {
    const chunk = order_ids.slice(i, i + chunkSize);

    const chunkPromises = chunk.map(async (orderId) => {
      try {
        const res = await executeDispatchOrder(
          { order_id: orderId, ...dispatch_params },
          profile?.id
        );
        return { order_id: orderId, ...res };
      } catch (err: any) {
        return {
          order_id: orderId,
          error: err.message,
          statusCode: err.statusCode || 500,
          consignment_id: err.consignment_id,
        };
      }
    });

    const chunkResults = await Promise.all(chunkPromises);
    results.push(...chunkResults);
  }

  return NextResponse.json({ results });
}
