import { createServiceClient } from "@/lib/supabase/server";
import { format } from "date-fns";
import type {
  OrderStickerData,
  OrderStickerLineItem,
  OrderStickerFinancials,
} from "@/types/order-sticker";

const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || "2024-07";

export function formatBdPhone(phone?: string | null): string {
  if (!phone) return "";
  const cleaned = phone.replace(/[^0-9]/g, "");
  let localNum = cleaned;
  if (localNum.startsWith("880")) {
    localNum = localNum.slice(2);
  } else if (!localNum.startsWith("0") && localNum.length === 10) {
    localNum = `0${localNum}`;
  }

  if (localNum.length === 11) {
    return `${localNum.slice(0, 5)}-${localNum.slice(5)}`;
  }
  return phone.trim();
}

export function extractAltPhone(
  primaryPhone: string,
  rawAltPhone?: string | null,
  note?: string | null,
  noteAttributes?: Array<{ name: string; value: string }> | null
): string | null {
  const normPrimary = primaryPhone.replace(/[^0-9]/g, "");

  if (rawAltPhone) {
    const cleaned = rawAltPhone.replace(/[^0-9]/g, "");
    if (cleaned.length >= 10 && !cleaned.includes(normPrimary) && !normPrimary.includes(cleaned)) {
      return formatBdPhone(rawAltPhone);
    }
  }

  if (Array.isArray(noteAttributes)) {
    for (const attr of noteAttributes) {
      const name = attr.name.toLowerCase();
      if (
        name.includes("alt") ||
        name.includes("secondary") ||
        name.includes("bkash") ||
        name.includes("another")
      ) {
        const val = String(attr.value || "").trim();
        const cleaned = val.replace(/[^0-9]/g, "");
        if (cleaned.length >= 10 && cleaned !== normPrimary) {
          return formatBdPhone(val);
        }
      }
    }
  }

  if (note) {
    const bdPhoneRegex = /(?:01[3-9]\d{8})/g;
    const matches = note.match(bdPhoneRegex);
    if (matches) {
      for (const m of matches) {
        if (m !== normPrimary) {
          return formatBdPhone(m);
        }
      }
    }
  }

  return null;
}

export interface FetchOrderStickersResult {
  success: boolean;
  storeName: string;
  stickers: OrderStickerData[];
  total: number;
  readyCount: number;
  failedCount: number;
  failedIds: string[];
}

export async function fetchOrderStickersData(
  rawOrderIds: string[],
  customDiscountReasons: Record<string, string> = {}
): Promise<FetchOrderStickersResult> {
  const orderIds = rawOrderIds.map((id) =>
    typeof id === "string" ? id.replace(/^gid:\/\/shopify\/Order\//, "").trim() : String(id).trim()
  );

  const supabase = createServiceClient();

  // 1. Fetch store settings
  const { data: settings } = await supabase
    .from("app_settings")
    .select("shopify_shop_domain, shopify_access_token, company_name")
    .single();

  const domain = settings?.shopify_shop_domain || process.env.SHOPIFY_SHOP_DOMAIN;
  const token = settings?.shopify_access_token || process.env.SHOPIFY_ACCESS_TOKEN;
  const storeName = settings?.company_name || "UNIVERSES";

  // 2. Query Supabase for all selected orders
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const uuidIds = orderIds.filter((id) => UUID_REGEX.test(id));
  const numericIds = orderIds.filter((id) => /^\d+$/.test(id)).map((id) => Number(id));
  const nameIds = orderIds.filter((id) => !UUID_REGEX.test(id) && !/^\d+$/.test(id));

  let dbOrdersQuery = supabase.from("orders").select(`
    id,
    shopify_order_id,
    shopify_order_name,
    shopify_order_number,
    customer_name,
    customer_phone,
    shopify_created_at,
    total_price,
    subtotal_price,
    shipping_charge,
    discount_amount,
    cod_amount,
    currency,
    financial_status,
    payment_method,
    note,
    shipping_address,
    line_items,
    pathao_consignment_id,
    pathao_tracking_code
  `);

  const orClauses: string[] = [];
  if (uuidIds.length > 0) orClauses.push(`id.in.(${uuidIds.join(",")})`);
  if (numericIds.length > 0) orClauses.push(`shopify_order_id.in.(${numericIds.join(",")})`);
  if (nameIds.length > 0) orClauses.push(`shopify_order_name.in.(${nameIds.map((n) => `"${n}"`).join(",")})`);

  let dbOrders: any[] = [];
  if (orClauses.length > 0) {
    const { data, error } = await dbOrdersQuery.or(orClauses.join(","));
    if (!error && data) dbOrders = data;
  }

  const dbOrderById = new Map<string, any>();
  const dbOrderByShopifyId = new Map<number, any>();
  const dbOrderByName = new Map<string, any>();

  for (const o of dbOrders) {
    if (o.id) dbOrderById.set(o.id, o);
    if (o.shopify_order_id) dbOrderByShopifyId.set(Number(o.shopify_order_id), o);
    if (o.shopify_order_name) dbOrderByName.set(o.shopify_order_name, o);
  }

  // 3. Query live orders from Shopify Admin
  const shopifyOrderIdsToFetch = new Set<number>();
  for (const reqId of orderIds) {
    if (/^\d+$/.test(reqId)) shopifyOrderIdsToFetch.add(Number(reqId));
    const matchedDb = dbOrderById.get(reqId) || dbOrderByName.get(reqId);
    if (matchedDb?.shopify_order_id) shopifyOrderIdsToFetch.add(Number(matchedDb.shopify_order_id));
  }

  const shopifyLiveOrders = new Map<number, any>();
  if (domain && token && shopifyOrderIdsToFetch.size > 0) {
    const idsArray = Array.from(shopifyOrderIdsToFetch);
    const CHUNK_SIZE = 50;
    for (let i = 0; i < idsArray.length; i += CHUNK_SIZE) {
      const chunk = idsArray.slice(i, i + CHUNK_SIZE);
      try {
        const url = `https://${domain}/admin/api/${SHOPIFY_API_VERSION}/orders.json?ids=${chunk.join(",")}&fields=id,name,order_number,created_at,note,note_attributes,customer,shipping_address,billing_address,line_items,financial_status,total_price,subtotal_price,total_discounts,discount_applications,discount_codes,total_shipping_price_set,shipping_lines,total_tax,total_outstanding,current_total_price,current_subtotal_price,current_total_discounts,refunds`;
        const ordersRes = await fetch(url, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": token,
          },
          cache: "no-store",
        });

        if (ordersRes.ok) {
          const data = await ordersRes.json();
          if (Array.isArray(data?.orders)) {
            for (const ord of data.orders) {
              shopifyLiveOrders.set(ord.id, ord);
            }
          }
        }
      } catch (err) {
        console.error("[Order Stickers] Network error querying Shopify:", err);
      }
    }
  }

  // 4. Construct validated OrderStickerData preserving exact input sequence
  const stickers: OrderStickerData[] = [];
  const failedIds: string[] = [];

  for (const reqId of orderIds) {
    const matchedDb =
      dbOrderById.get(reqId) ||
      dbOrderByShopifyId.get(Number(reqId)) ||
      dbOrderByName.get(reqId);
    const shopifyId = matchedDb?.shopify_order_id
      ? Number(matchedDb.shopify_order_id)
      : /^\d+$/.test(reqId)
      ? Number(reqId)
      : null;
    const live = shopifyId ? shopifyLiveOrders.get(shopifyId) : null;

    if (!matchedDb && !live) {
      failedIds.push(reqId);
      continue;
    }

    const warnings: string[] = [];

    // Order Identifiers
    const orderNumber =
      live?.name ||
      matchedDb?.shopify_order_name ||
      (live?.order_number ? `#${live.order_number}` : `#${reqId}`);

    // Dates
    const rawCreatedAt = live?.created_at || matchedDb?.shopify_created_at || new Date().toISOString();
    let orderDate = "";
    let orderTime = "";
    try {
      const d = new Date(rawCreatedAt);
      orderDate = format(d, "dd MMM yyyy");
      orderTime = format(d, "hh:mm a");
    } catch {
      orderDate = rawCreatedAt.split("T")[0] || rawCreatedAt;
      orderTime = "";
    }

    // Customer Info
    const customer = live?.customer;
    const shippingAddr = live?.shipping_address || matchedDb?.shipping_address;
    const billingAddr = live?.billing_address;

    const customerName =
      shippingAddr?.name ||
      (customer ? `${customer.first_name || ""} ${customer.last_name || ""}`.trim() : "") ||
      billingAddr?.name ||
      matchedDb?.customer_name ||
      "Guest Customer";

    if (customerName === "Guest Customer") {
      warnings.push("Customer name is missing, defaulted to Guest Customer");
    }

    const rawPhone =
      shippingAddr?.phone ||
      customer?.phone ||
      billingAddr?.phone ||
      matchedDb?.customer_phone ||
      "";

    const customerPhone = formatBdPhone(rawPhone) || "No Phone";
    if (customerPhone === "No Phone") {
      warnings.push("Customer phone number is missing");
    }

    // Extract Alternative Phone
    const altPhone = extractAltPhone(
      rawPhone,
      billingAddr?.phone !== rawPhone ? billingAddr?.phone : null,
      live?.note || matchedDb?.note,
      live?.note_attributes
    );

    // Address
    const address1 = shippingAddr?.address1 || "";
    const address2 = shippingAddr?.address2 || "";
    const fullAddress = [address1, address2].filter(Boolean).join(", ") || "No address provided";

    const city = shippingAddr?.city || "";
    const province = shippingAddr?.province || "";
    const zip = shippingAddr?.zip || "";
    const areaCityDistrict = [city, province, zip].filter(Boolean).join(", ") || "";

    // Calculate refunded quantities per item if refunds array exists in Shopify
    const refundedQtyByLineId = new Map<number, number>();
    if (Array.isArray(live?.refunds)) {
      for (const ref of live.refunds) {
        if (Array.isArray(ref.refund_line_items)) {
          for (const rli of ref.refund_line_items) {
            const lid = Number(rli.line_item_id);
            if (lid) {
              refundedQtyByLineId.set(lid, (refundedQtyByLineId.get(lid) || 0) + Number(rli.quantity || 0));
            }
          }
        }
      }
    }

    // Product Items (Properly excludes removed items from Shopify edits & full refunds)
    const rawLineItems = live?.line_items || matchedDb?.line_items || [];
    const items: OrderStickerLineItem[] = [];

    for (const item of rawLineItems) {
      const hasCurrentQty = item.current_quantity !== undefined && item.current_quantity !== null;
      const currentQty = hasCurrentQty ? Number(item.current_quantity) : null;
      const origQty = Number(item.quantity || 0);
      const refundedQty = item.id ? (refundedQtyByLineId.get(Number(item.id)) || 0) : 0;

      // Effective quantity after edits and refunds
      const effectiveQty = currentQty !== null ? currentQty : Math.max(0, origQty - refundedQty);

      // If the item has been removed in Shopify or fully refunded, exclude it completely!
      if (effectiveQty <= 0) {
        continue;
      }

      const title = item.title || item.name || "Item";
      const variantTitle = item.variant_title || (item.variantTitle !== "Default Title" ? item.variantTitle : "") || "";
      const unitPrice = parseFloat(item.price || item.unit_price || "0");
      const lineTotal = unitPrice * effectiveQty;
      const sku = item.sku?.trim() || null;

      // Extract size from variant title or variant options
      let size: string | null = null;
      if (variantTitle) {
        const sizeMatch = variantTitle.match(/(?:size|sz)[\s:]*([a-zA-Z0-9\+]+)/i);
        if (sizeMatch) {
          size = sizeMatch[1];
        } else {
          size = variantTitle;
        }
      }

      items.push({
        id: item.id || `${title}-${Math.random()}`,
        title,
        variantTitle: variantTitle || null,
        size,
        sku,
        quantity: effectiveQty,
        unitPrice,
        lineTotal,
      });
    }

    // Financials & Calculations (reflecting current active state without phantom discounts)
    const subtotal = parseFloat(
      live?.current_subtotal_price ||
      live?.subtotal_price ||
      String(matchedDb?.subtotal_price || "0")
    ) || items.reduce((sum, it) => sum + it.lineTotal, 0);

    const totalOrderValue = parseFloat(
      live?.current_total_price ||
      live?.total_price ||
      String(matchedDb?.total_price || "0")
    ) || subtotal;

    const productDiscount = parseFloat(
      live?.current_total_discounts ||
      live?.total_discounts ||
      String(matchedDb?.discount_amount || "0")
    ) || 0;

    // Discount Code & Reason
    const discountCodes = live?.discount_codes || [];
    const discountApps = live?.discount_applications || [];
    const discountCode = discountCodes[0]?.code || discountApps[0]?.code || null;
    const naturalDiscountReason = discountApps[0]?.description || discountApps[0]?.title || null;
    const customDiscountReason = customDiscountReasons[matchedDb?.id || reqId] || null;
    const discountReason = customDiscountReason || naturalDiscountReason;

    // Shipping
    let shippingCharge = 0;
    if (live?.shipping_lines && live.shipping_lines.length > 0) {
      shippingCharge = parseFloat(live.shipping_lines[0]?.price || "0");
    } else if (matchedDb?.shipping_charge !== undefined && matchedDb?.shipping_charge !== null) {
      shippingCharge = Number(matchedDb.shipping_charge);
    } else {
      shippingCharge = Math.max(0, totalOrderValue - subtotal + productDiscount);
    }

    const additionalCharges = Math.max(0, totalOrderValue - (subtotal - productDiscount + shippingCharge));

    // Financial Status & Verified COD Calculation
    const finStatus = (live?.financial_status || matchedDb?.financial_status || "pending").toLowerCase();
    const isPaidStatus = finStatus === "paid";

    let advancePaid = 0;
    let codAmount = 0;
    let isPrepaid = false;

    if (isPaidStatus) {
      advancePaid = totalOrderValue;
      codAmount = 0;
      isPrepaid = true;
    } else if (live?.total_outstanding !== undefined && live.total_outstanding !== null) {
      const outstanding = parseFloat(live.total_outstanding);
      codAmount = Math.max(0, isNaN(outstanding) ? totalOrderValue : outstanding);
      advancePaid = Math.max(0, totalOrderValue - codAmount);
      isPrepaid = codAmount === 0;
    } else if (matchedDb?.cod_amount !== undefined && matchedDb?.cod_amount !== null) {
      codAmount = Number(matchedDb.cod_amount);
      advancePaid = Math.max(0, totalOrderValue - codAmount);
      isPrepaid = codAmount === 0;
    } else {
      codAmount = totalOrderValue;
      advancePaid = 0;
      isPrepaid = false;
    }

    const financials: OrderStickerFinancials = {
      subtotal,
      productDiscount,
      discountCode,
      discountReason,
      shippingCharge,
      additionalCharges,
      totalOrderValue,
      advancePaid,
      codAmount,
      isPrepaid,
      currency: "৳",
    };

    const totalPcs = items.reduce((sum, it) => sum + (it.quantity || 1), 0);
    const rawNote = live?.note || matchedDb?.note || null;
    const customerNote = rawNote ? rawNote.trim() : null;
    const pathaoConsignmentId = matchedDb?.pathao_consignment_id || null;
    const pathaoTrackingCode = matchedDb?.pathao_tracking_code || null;

    stickers.push({
      orderId: matchedDb?.id || reqId,
      shopifyOrderId: shopifyId,
      orderNumber,
      storeName,
      orderDate,
      orderTime,
      rawCreatedAt,
      customerName,
      customerPhone,
      altPhone,
      fullAddress,
      areaCityDistrict,
      customerNote,
      pathaoConsignmentId,
      pathaoTrackingCode,
      items,
      totalPcs,
      financials,
      isValid: true,
      warnings,
      error: null,
    });
  }

  return {
    success: true,
    storeName,
    stickers,
    total: orderIds.length,
    readyCount: stickers.length,
    failedCount: failedIds.length,
    failedIds,
  };
}

