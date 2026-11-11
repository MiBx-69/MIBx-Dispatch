import { NextRequest, NextResponse } from "next/server";
import { createServiceClient, createClient } from "@/lib/supabase/server";
import {
  createPathaoOrder,
  getPathaoCities,
  getPathaoZones,
  formatPathaoTrackingUrl,
  normalizeBdPhoneForPathao,
} from "@/lib/pathao/client";
import { resolvePathaoCity, resolvePathaoZone } from "@/lib/pathao/location-resolver";
import {
  fulfillAndTrackShopifyOrder,
  createShopifyFulfillment,
  updateShopifyOrder,
  updateShopifyFulfillmentTracking,
  getShopifyOrderFulfillments,
} from "@/lib/shopify/client";
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

  // Prevent duplicate consignment creation unless force flag is explicitly true
  const isTerminalStatus = ["Cancelled", "Return Completed", "Failed"].includes(order.pathao_delivery_status || "");
  const hasActiveConsignment = Boolean(order.pathao_consignment_id && !isTerminalStatus);

  if (hasActiveConsignment && !force) {
    const error: any = new Error(
      `Order ${order.shopify_order_name || order.id} is already dispatched with active consignment ${order.pathao_consignment_id}. Use force=true to override.`
    );
    error.statusCode = 409;
    error.consignment_id = order.pathao_consignment_id;
    throw error;
  }

  // 1. Atomic Concurrency Lock: Prevent duplicate consignments during concurrent requests
  const nowIso = new Date().toISOString();
  const { data: activeClaim } = await supabase
    .from("dispatch_claims")
    .select("*")
    .eq("order_id", order.id)
    .eq("status", "in_progress")
    .gt("expires_at", nowIso)
    .maybeSingle();

  if (activeClaim) {
    const error: any = new Error(
      `Dispatch for order ${order.shopify_order_name || order.id} is already in progress. Please wait a moment.`
    );
    error.statusCode = 409;
    throw error;
  }

  // Acquire atomic claim with a 2-minute window
  const claimExpiresAt = new Date(Date.now() + 120_000).toISOString();
  await supabase.from("dispatch_claims").upsert(
    {
      order_id: order.id,
      claimed_at: nowIso,
      status: "in_progress",
      expires_at: claimExpiresAt,
      error_message: null,
    },
    { onConflict: "order_id" }
  );

  try {
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

    // Strict validation of recipient phone
    let finalPhone = recipient_phone || order.customer_phone || (order.shipping_address as any)?.phone || "";
    finalPhone = normalizeBdPhoneForPathao(finalPhone);
    if (!finalPhone || finalPhone.length !== 11 || !finalPhone.startsWith("01")) {
      const err: any = new Error(
        `Invalid recipient phone number "${finalPhone || "missing"}". A valid 11-digit Bangladeshi mobile number starting with 01 (e.g. 01712200891) is required.`
      );
      err.statusCode = 400;
      throw err;
    }

    // Strict validation of recipient address length
    let finalAddress = (recipient_address || (order.shipping_address as any)?.address1 || "").trim();
    const cityProv = `${(order.shipping_address as any)?.city || ""} ${(order.shipping_address as any)?.province || ""}`.trim();
    if (finalAddress.length < 10 && cityProv) {
      finalAddress = `${finalAddress}, ${cityProv}`.trim();
    }
    if (finalAddress.length < 10) {
      const err: any = new Error(
        `Recipient address is too short (${finalAddress.length} chars). Pathao requires at least 10 characters.`
      );
      err.statusCode = 400;
      throw err;
    }

    // Robust City & Zone resolution with full English & Bengali Bangladesh District & Upazila support
    let finalCity = recipient_city ? parseInt(String(recipient_city), 10) : undefined;
    let finalZone = recipient_zone ? parseInt(String(recipient_zone), 10) : undefined;
    let finalArea = recipient_area ? parseInt(String(recipient_area), 10) : undefined;

    const shippingAddrObj = order.shipping_address as any;
    if (!finalCity) {
      const resolvedDistrict = resolvePathaoCity({
        city: shippingAddrObj?.city,
        province: shippingAddrObj?.province,
        address1: finalAddress,
      }, true); // fallbackToDhaka = true for automated dispatches

      if (resolvedDistrict) {
        finalCity = resolvedDistrict.city_id;
      } else {
        const err: any = new Error(
          `Recipient city could not be verified with Pathao for ${order.shopify_order_name || order.id} from address "${finalAddress}". Please select a city explicitly.`
        );
        err.statusCode = 400;
        throw err;
      }
    }

    if (!finalZone && finalCity) {
      const resolvedZone = await resolvePathaoZone(finalCity, {
        address1: finalAddress,
        city: shippingAddrObj?.city,
      });

      if (resolvedZone) {
        finalZone = resolvedZone.zone_id;
      } else {
        const err: any = new Error(
          `Recipient zone could not be verified with Pathao for city ID ${finalCity}. Please select a zone explicitly.`
        );
        err.statusCode = 400;
        throw err;
      }
    }

    // Calculate COD amount to collect:
    // If order is paid on Shopify (financial_status === "paid"), COD amount MUST strictly be 0!
    // If unpaid, use due amount (amount_to_collect override, cod_amount, or total_price).
    const finStatus = (order.financial_status || "").toLowerCase();
    const isPaid = finStatus === "paid" || finStatus === "refunded";
    let finalAmount = 0;
    if (isPaid) {
      finalAmount = 0;
    } else if (amount_to_collect !== undefined && amount_to_collect !== null) {
      finalAmount = Math.max(0, Math.round(Number(amount_to_collect)));
    } else if (order.cod_amount !== undefined && order.cod_amount !== null) {
      finalAmount = Math.max(0, Math.round(Number(order.cod_amount)));
    } else if (order.total_price !== null) {
      finalAmount = Math.max(0, Math.round(Number(order.total_price)));
    }

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

  // If re-dispatching an order that already had a consignment, supersede previous open dispatches
  const isRedispatch = Boolean(order.pathao_consignment_id);
  if (isRedispatch) {
    await supabase
      .from("dispatches")
      .update({
        is_cancelled: true,
        cancel_reason: `Superseded by re-dispatch (New Consignment: ${consignment_id})`,
        cancelled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("order_id", order.id)
      .not("pathao_order_status", "in", '("Delivered","Returned","Return","Paid Return","Return Completed","Cancelled")');
  }

  const nowIso = new Date().toISOString();
  const { data: insertedDispatch } = await supabase
    .from("dispatches")
    .insert({
      order_id: order.id,
      shopify_order_id: order.shopify_order_id,
      shopify_order_name: order.shopify_order_name,
      consignment_id,
      merchant_order_id: order.shopify_order_name,
      pathao_order_status: "Order Created",
      normalized_status: "ORDER_CREATED",
      last_pathao_event: "order.created",
      last_event_timestamp: nowIso,
      delivery_fee,
      recipient_name: recipient_name || order.customer_name,
      recipient_phone: recipient_phone || order.customer_phone,
      recipient_address:
        recipient_address ||
        (order.shipping_address as any)?.address1 ||
        "",
      recipient_city: finalCity,
      recipient_zone: finalZone,
      amount_to_collect: finalAmount,
      expected_cod: finalAmount,
      settlement_status: "pending",
      shopify_sync_status: "pending",
      item_weight,
      item_quantity,
      delivery_type,
      item_type,
      item_description,
      pathao_response: pathaoResponseWithFraud as any,
      tracking_history: [
        {
          status: "Order Created",
          normalized_status: "ORDER_CREATED",
          event: "order.created",
          timestamp: nowIso,
          applied: true,
        },
      ] as any,
      dispatched_by: profileId || null,
    })
    .select("id")
    .maybeSingle();

  // Record initial ORDER_CREATED in pathao_status_history
  await supabase.from("pathao_status_history").upsert(
    {
      dispatch_id: insertedDispatch?.id || null,
      order_id: order.id,
      consignment_id,
      merchant_order_id: order.shopify_order_name,
      raw_event: "order.created",
      normalized_status: "ORDER_CREATED",
      event_timestamp: nowIso,
      raw_payload: pathaoResponse.data as any,
      idempotency_key: `pathao:${consignment_id}:ORDER_CREATED:dispatch`,
    },
    { onConflict: "idempotency_key" }
  );

  // 3. Update order in DB with consignment ID and status
  const recipientPhoneStr = recipient_phone || order.customer_phone || (order.shipping_address as any)?.phone || "";
  const trackingUrl = formatPathaoTrackingUrl(consignment_id, recipientPhoneStr);
  await supabase
    .from("orders")
    .update({
      internal_status: "dispatched",
      pathao_consignment_id: consignment_id,
      pathao_tracking_url: trackingUrl,
      pathao_delivery_status: "Order Created",
      returned_at: null,
      return_reason: null,
    })
    .eq("id", order.id);

  const fraudAuditSuffix = riskAnalysis ? ` | Fraud: ${riskAnalysis.ratingLabel} (${riskAnalysis.successRatio}% DLV)` : "";
  await logOrderEvent(
    order.id,
    isRedispatch ? "RE_DISPATCHED" : "DISPATCHED",
    isRedispatch
      ? `Order re-dispatched via Pathao (New Consignment: ${consignment_id}, Previous: ${order.pathao_consignment_id})${fraudAuditSuffix}`
      : `Order dispatched via Pathao (Consignment: ${consignment_id})${fraudAuditSuffix}`,
    { consignment_id, previous_consignment_id: order.pathao_consignment_id || null, trackingUrl, fraud_summary: pathaoResponseWithFraud.fraud_summary }
  );

  // 4. Create Shopify fulfillment with tracking or attach tracking to existing fulfillment
  let shopifyFulfillmentId: string | null = null;
  try {
    const fulfillmentResult = await fulfillAndTrackShopifyOrder({
      shopifyOrderId: order.shopify_order_id,
      consignmentId: consignment_id,
      trackingUrl,
      trackingCompany: "Pathao",
      notifyCustomer: true,
    });
    shopifyFulfillmentId = fulfillmentResult?.fulfillmentId || null;

    if (shopifyFulfillmentId) {
      await supabase
        .from("orders")
        .update({
          shopify_fulfillment_id: shopifyFulfillmentId,
          fulfillment_status: "fulfilled",
        })
        .eq("id", order.id);

      if (insertedDispatch?.id) {
        await supabase
          .from("dispatches")
          .update({
            shopify_fulfillment_id: shopifyFulfillmentId,
            shopify_sync_status: "synced",
            shopify_sync_error: null,
            last_synced_at: new Date().toISOString(),
          })
          .eq("id", insertedDispatch.id);
      }
    }
  } catch (shopifyErr: any) {
    console.error("[Dispatch] Shopify fulfillment tracking error (non-fatal):", shopifyErr);
    if (insertedDispatch?.id) {
      await supabase
        .from("dispatches")
        .update({
          shopify_sync_status: "failed",
          shopify_sync_error: shopifyErr?.message || "Shopify fulfillment failed",
        })
        .eq("id", insertedDispatch.id);
    }
  }

  // 5. Attach tags & fraud custom attributes to Shopify Order (without altering customer note)
  try {
    const { buildDispatchCustomAttributes } = await import("@/lib/fraud-checker");
    const customAttributes = buildDispatchCustomAttributes({
      consignmentId: consignment_id,
      trackingUrl,
      fraudData,
      riskAnalysis,
    });

    const fraudTag = riskAnalysis ? `FraudSpy: ${riskAnalysis.riskLevel === 'fraud' ? 'High Risk' : riskAnalysis.riskLevel === 'risky' ? 'Medium Risk' : 'Safe'}` : null;

    await updateShopifyOrder({
      id: `gid://shopify/Order/${order.shopify_order_id}`,
      tags: Array.from(new Set([
        ...(order.shopify_tags || []),
        "Dispatched via Pathao",
        `pathao:${consignment_id}`,
        "dispatched",
        ...(fraudTag ? [fraudTag, 'FraudSpy Verified'] : []),
      ])),
      ...(customAttributes ? { customAttributes } : {}),
    });
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

    // Mark atomic claim as completed
    await supabase.from("dispatch_claims").upsert(
      {
        order_id: order.id,
        status: "completed",
        consignment_id,
        expires_at: new Date().toISOString(),
      },
      { onConflict: "order_id" }
    );

    return {
      success: true,
      consignment_id,
      delivery_fee,
      tracking_url: trackingUrl,
      shopify_fulfillment_id: shopifyFulfillmentId,
    };
  } catch (dispatchErr: any) {
    // Release atomic claim on failure so subsequent retry is unblocked
    await supabase.from("dispatch_claims").upsert(
      {
        order_id: order.id,
        status: "failed",
        error_message: dispatchErr.message || "Dispatch failed",
        expires_at: new Date().toISOString(),
      },
      { onConflict: "order_id" }
    );
    throw dispatchErr;
  }
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

  // Execute bulk dispatch sequentially with 200ms spacing to prevent Pathao & Shopify rate limit bursts
  for (let i = 0; i < order_ids.length; i++) {
    const orderId = order_ids[i];
    try {
      const res = await executeDispatchOrder(
        { order_id: orderId, ...dispatch_params },
        profile?.id
      );
      results.push({ order_id: orderId, ...res });
    } catch (err: any) {
      results.push({
        order_id: orderId,
        error: err.message,
        statusCode: err.statusCode || 500,
        consignment_id: err.consignment_id,
      });
    }

    if (i < order_ids.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  return NextResponse.json({ results });
}
