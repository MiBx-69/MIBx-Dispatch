import { type NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { logOrderEvent } from "@/lib/audit";
import {
  calculateOrderReturnPreview,
  getSimpleOrderReturnClassification,
  normalizeOrderLineItemsForReturn,
  syncReturnAndRefundToShopify,
  type ReturnLineItemSelection,
} from "@/lib/shopify-returns";

// GET /api/returns — List returns or get order return preview/history
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const orderId = searchParams.get("orderId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const returnType = searchParams.get("returnType") || searchParams.get("type");
    const syncStatus = searchParams.get("syncStatus");
    const search = searchParams.get("search")?.trim();

    const supabase = createServiceClient();

    // If orderId is specified, return full return state + normalized line items for that order
    if (orderId) {
      const [{ data: order, error: orderErr }, { data: orderReturns, error: retErr }] =
        await Promise.all([
          supabase
            .from("orders")
            .select(
              "id, shopify_order_id, shopify_order_name, customer_name, customer_phone, total_price, original_total_price, subtotal_price, original_subtotal_price, shipping_charge, discount_amount, total_tax, line_items, financial_status, fulfillment_status, internal_status, pathao_consignment_id, pathao_delivery_status, returned_at, return_reason"
            )
            .eq("id", orderId)
            .single(),
          supabase
            .from("returns")
            .select("*")
            .eq("order_id", orderId)
            .order("returned_at", { ascending: false }),
        ]);

      if (orderErr || !order) {
        return NextResponse.json({ error: "Order not found" }, { status: 404 });
      }
      if (retErr) throw retErr;

      const existingReturns = orderReturns || [];
      const normalizedLineItems = normalizeOrderLineItemsForReturn(order, existingReturns);
      const classification = getSimpleOrderReturnClassification(order, existingReturns);

      const totalOriginalQuantity = normalizedLineItems.reduce(
        (s, l) => s + l.originalQuantity,
        0
      );
      const totalReturnedQuantity = normalizedLineItems.reduce(
        (s, l) => s + l.alreadyReturnedQuantity,
        0
      );
      const totalRemainingQuantity = normalizedLineItems.reduce(
        (s, l) => s + l.unreturnedQuantity,
        0
      );
      const totalReturnedValue = existingReturns.reduce(
        (s, r) => s + Number(r.returned_product_value || 0),
        0
      );
      const totalRefundedAmount = existingReturns.reduce(
        (s, r) => s + Number(r.refund_amount || 0),
        0
      );

      return NextResponse.json({
        order,
        returns: existingReturns,
        classification,
        normalizedLineItems,
        summary: {
          originalOrderAmount: Number(
            (order as any).original_total_price ?? order.total_price ?? 0
          ),
          totalOriginalQuantity,
          totalReturnedQuantity,
          totalRemainingQuantity,
          totalReturnedValue: Number(totalReturnedValue.toFixed(2)),
          totalRefundedAmount: Number(totalRefundedAmount.toFixed(2)),
          updatedOrderAmount: Number(
            Math.max(
              0,
              Number((order as any).original_total_price ?? order.total_price ?? 0) -
                totalRefundedAmount
            ).toFixed(2)
          ),
          canProcessReturn: totalRemainingQuantity > 0,
        },
      });
    }

    let query = supabase
      .from("returns")
      .select(`
        *,
        orders (
          id,
          shopify_order_id,
          shopify_order_name,
          customer_name,
          customer_phone,
          total_price,
          original_total_price,
          subtotal_price,
          original_subtotal_price,
          shipping_charge,
          discount_amount,
          total_tax,
          financial_status,
          fulfillment_status,
          internal_status,
          line_items,
          pathao_consignment_id,
          shopify_created_at
        )
      `)
      .order("returned_at", { ascending: false });

    if (startDate) query = query.gte("returned_at", startDate);
    if (endDate) query = query.lte("returned_at", endDate);
    if (returnType && (returnType === "partial" || returnType === "full")) {
      query = query.eq("return_type", returnType);
    }
    if (syncStatus && syncStatus !== "all") {
      query = query.eq("shopify_sync_status", syncStatus);
    }

    const { data, error } = await query;
    if (error) throw error;

    let filtered = data || [];
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter((ret: any) => {
        const orderName = String(ret.orders?.shopify_order_name || "").toLowerCase();
        const phone = String(ret.orders?.customer_phone || "").toLowerCase();
        const customer = String(ret.orders?.customer_name || "").toLowerCase();
        return orderName.includes(q) || phone.includes(q) || customer.includes(q);
      });
    }

    return NextResponse.json({ returns: filtered });
  } catch (err: any) {
    console.error("GET /api/returns error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/returns — Process Partial Return or Full Return and synchronize with Shopify
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      orderIds,
      orderId: singleOrderId,
      return_reason = "Customer refused",
      return_type = "full",
      return_delivery_fee = 0,
      notes,
      returned_items = null,
      selections: rawSelections = null,
      refund_shipping = false,
      sync_to_shopify = true,
      preview_only = false,
      staff_responsible = null,
    } = body;

    const targetOrderIds: string[] = Array.isArray(orderIds)
      ? orderIds
      : singleOrderId
        ? [singleOrderId]
        : [];

    if (targetOrderIds.length === 0) {
      return NextResponse.json(
        { error: "orderIds or orderId is required" },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();
    const results: any[] = [];
    const errors: any[] = [];

    for (const orderId of targetOrderIds) {
      const { data: order, error: fetchErr } = await supabase
        .from("orders")
        .select(
          "id, shopify_order_id, shopify_order_name, internal_status, financial_status, total_price, original_total_price, subtotal_price, original_subtotal_price, shipping_charge, discount_amount, total_tax, pathao_consignment_id, line_items"
        )
        .eq("id", orderId)
        .single();

      if (fetchErr || !order) {
        errors.push({ orderId, error: "Order not found" });
        continue;
      }

      // Fetch any existing returns on this order so multiple partial returns work seamlessly
      const { data: existingReturns } = await supabase
        .from("returns")
        .select("*")
        .eq("order_id", orderId)
        .order("returned_at", { ascending: true });

      const requestedMode: "partial" | "full" =
        return_type === "partial" ? "partial" : "full";

      // Build normalized selections from either `selections` or `returned_items`
      const parsedSelections: ReturnLineItemSelection[] = [];
      if (Array.isArray(rawSelections)) {
        for (const s of rawSelections) {
          if (Number(s?.quantity) > 0) {
            parsedSelections.push({
              key: String(s.key ?? s.id ?? s.line_item_id ?? s.sku),
              quantity: Number(s.quantity),
            });
          }
        }
      } else if (Array.isArray(returned_items)) {
        for (const ri of returned_items) {
          const qty = Number(ri?.quantity ?? ri?.return_quantity ?? 0);
          if (qty > 0) {
            parsedSelections.push({
              key: String(
                ri.line_item_id ?? ri.id ?? ri.variant_id ?? ri.sku ?? ri.name
              ),
              quantity: qty,
            });
          }
        }
      }

      const preview = calculateOrderReturnPreview({
        order,
        existingReturns: existingReturns || [],
        mode: requestedMode,
        selections: parsedSelections,
        refundShipping: Boolean(refund_shipping),
      });

      if (!preview.valid) {
        errors.push({
          orderId,
          name: order.shopify_order_name,
          error: preview.error || "Invalid return quantities",
        });
        continue;
      }

      // If caller only requested a calculation preview, return it without mutating database or Shopify
      if (preview_only) {
        results.push({
          orderId,
          name: order.shopify_order_name,
          preview,
        });
        continue;
      }

      const now = new Date().toISOString();
      const { data: dispatch } = await supabase
        .from("dispatches")
        .select("id, consignment_id, amount_to_collect")
        .eq("order_id", orderId)
        .eq("is_cancelled", false)
        .maybeSingle();

      const isPaidReturn = Boolean(body.is_paid_return);
      const effectiveFee = isPaidReturn ? 0 : Number(return_delivery_fee) || 0;
      const isFullOrderReturnNow = preview.orderOverallReturnStatus === "full";
      const finalReturnType: "partial" | "full" = isFullOrderReturnNow
        ? "full"
        : "partial";

      const calculatedRefund =
        body.refund_amount !== undefined && body.refund_amount !== ""
          ? Number(body.refund_amount)
          : preview.calculatedRefundAmount;

      const idempotencyKey =
        body.idempotency_key ||
        `mibx-${orderId}-${preview.returnedItems
          .map((i) => `${i.id}:${i.quantity}`)
          .join("_")}-step${(existingReturns || []).length + 1}`;

      // Check idempotency key in database first
      const { data: existingByIdempotency } = await supabase
        .from("returns")
        .select("*")
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();

      if (existingByIdempotency) {
        results.push({
          orderId,
          name: order.shopify_order_name,
          success: true,
          deduplicated: true,
          returnRecord: existingByIdempotency,
        });
        continue;
      }

      // Synchronize with Shopify when enabled and order has a Shopify Order ID
      let shopifySyncResult: {
        synced: boolean;
        shopifyReturnId: string | null;
        shopifyRefundId: string | null;
        shopifyRefundedAmount: number | null;
        shopifyFinancialStatus: string | null;
        updatedShopifyOrderTotal: number | null;
        error: string | null;
      } = {
        synced: true,
        shopifyReturnId: null,
        shopifyRefundId: null,
        shopifyRefundedAmount: calculatedRefund,
        shopifyFinancialStatus: isFullOrderReturnNow
          ? "refunded"
          : "partially_refunded",
        updatedShopifyOrderTotal: preview.updatedOrderFinancialAmount,
        error: null,
      };

      if (sync_to_shopify && order.shopify_order_id) {
        shopifySyncResult = await syncReturnAndRefundToShopify({
          shopifyOrderId: order.shopify_order_id,
          returnType: finalReturnType,
          orderOverallReturnStatus: preview.orderOverallReturnStatus === "full" ? "full" : "partial",
          returnedItems: preview.returnedItems,
          refundShipping: Boolean(refund_shipping),
          calculatedRefundAmount: calculatedRefund,
          returnReason: return_reason || "Customer refused",
          idempotencyKey,
        });
      }

      const finalRefundSaved =
        shopifySyncResult.shopifyRefundedAmount != null
          ? shopifySyncResult.shopifyRefundedAmount
          : calculatedRefund;

      const finalFinancialStatus =
        shopifySyncResult.shopifyFinancialStatus ||
        (isFullOrderReturnNow ? "refunded" : "partially_refunded");

      // Note: If an older migration created `idx_returns_unique_full_per_order` and this order had prior partial returns
      // that now culminate in a full return, ensure no duplicate `return_type = 'full'` conflict occurs.
      const { data: insertedReturn, error: insertErr } = await supabase
        .from("returns")
        .insert({
          order_id: orderId,
          dispatch_id: dispatch?.id || null,
          consignment_id:
            dispatch?.consignment_id || order.pathao_consignment_id || null,
          return_reason: return_reason || "Customer refused",
          return_type: finalReturnType,
          return_source: "manual",
          order_total: preview.originalOrderAmount,
          returned_product_value: preview.returnedSubtotal,
          refund_amount: finalRefundSaved,
          original_order_quantity: preview.originalOrderQuantity,
          returned_quantity: preview.returnedQuantityNow,
          return_delivery_fee: effectiveFee,
          is_paid_return: isPaidReturn,
          status: "received",
          is_verified: true,
          verification_status: "verified",
          staff_responsible: staff_responsible || null,
          returned_items: preview.returnedItems as any,
          remaining_items: preview.remainingItems as any,
          shopify_return_id: shopifySyncResult.shopifyReturnId,
          shopify_refund_id: shopifySyncResult.shopifyRefundId,
          shopify_sync_status: shopifySyncResult.synced ? "synced" : "failed",
          shopify_sync_error: shopifySyncResult.error,
          shopify_financial_status: finalFinancialStatus,
          idempotency_key: idempotencyKey,
          notes: notes || null,
          returned_at: now,
          processed_at: now,
        })
        .select("*")
        .single();

      if (insertErr) {
        errors.push({ orderId, error: insertErr.message });
        continue;
      }

      // If previous partial returns exist on this order and the order is now completely returned ("full"),
      // update their remaining_items snapshot so the order's latest state is consistent.
      if (isFullOrderReturnNow) {
        await supabase
          .from("orders")
          .update({
            internal_status: "returned",
            pathao_delivery_status: "Full Return",
            financial_status: finalFinancialStatus,
            returned_at: now,
            return_reason: return_reason || "Customer refused",
            return_delivery_fee: effectiveFee,
          })
          .eq("id", orderId);

        if (dispatch?.id) {
          await supabase
            .from("dispatches")
            .update({
              pathao_order_status: "Returned",
              return_charge: effectiveFee,
              updated_at: now,
            })
            .eq("id", dispatch.id);
        }
      } else {
        // Partial Return: Never mark the entire order as returned when eligible products remain!
        await supabase
          .from("orders")
          .update({
            pathao_delivery_status: "Partial Return",
            financial_status: finalFinancialStatus,
            return_delivery_fee: effectiveFee,
          })
          .eq("id", orderId);

        if (dispatch?.id) {
          const expectedCod = Number(
            dispatch.amount_to_collect || preview.originalOrderAmount
          );
          const totalRefundedSoFar =
            preview.previouslyRefundedAmount + finalRefundSaved;
          await supabase
            .from("dispatches")
            .update({
              pathao_order_status: "Partial Delivered",
              actual_cod_collected: Math.max(0, expectedCod - totalRefundedSoFar),
              return_charge: effectiveFee,
              updated_at: now,
            })
            .eq("id", dispatch.id);
        }
      }

      await logOrderEvent(
        orderId,
        isFullOrderReturnNow ? "FULL_RETURN_RECORDED" : "PARTIAL_RETURN_RECORDED",
        `${
          isFullOrderReturnNow ? "Full Return" : "Partial Return"
        } processed (${preview.returnedQuantityNow} unit(s), Refund: BDT ${finalRefundSaved}, Shopify: ${
          shopifySyncResult.synced ? "Synced" : "Sync Failed"
        })`,
        {
          return_id: insertedReturn?.id,
          return_type: finalReturnType,
          returned_quantity: preview.returnedQuantityNow,
          remaining_quantity: preview.remainingQuantityAfter,
          returned_product_value: preview.returnedSubtotal,
          refund_amount: finalRefundSaved,
          shopify_sync_status: shopifySyncResult.synced ? "synced" : "failed",
          shopify_return_id: shopifySyncResult.shopifyReturnId,
          shopify_refund_id: shopifySyncResult.shopifyRefundId,
          shopify_sync_error: shopifySyncResult.error,
        }
      ).catch(() => {});

      results.push({
        orderId,
        name: order.shopify_order_name,
        success: true,
        returnType: finalReturnType,
        orderOverallReturnStatus: preview.orderOverallReturnStatus,
        shopifySynced: shopifySyncResult.synced,
        shopifyError: shopifySyncResult.error,
        returnRecord: insertedReturn,
        preview,
      });
    }

    return NextResponse.json({
      success: errors.length === 0 || results.length > 0,
      processed: results.length,
      failed: errors.length,
      results,
      errors,
    });
  } catch (err: any) {
    console.error("POST /api/returns error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
