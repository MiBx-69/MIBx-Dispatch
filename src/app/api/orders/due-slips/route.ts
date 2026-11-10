import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { format } from "date-fns";
import type { DueSlipData } from "@/types/due-slip";

const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || "2024-07";

interface ShopifyRestOrder {
  id: number;
  name: string;
  order_number?: number;
  created_at: string;
  financial_status: string;
  total_price: string;
  total_outstanding?: string;
  currency: string;
  customer?: {
    first_name?: string;
    last_name?: string;
    phone?: string;
    email?: string;
  };
  shipping_address?: {
    name?: string;
    phone?: string;
    address1?: string;
    city?: string;
  };
  billing_address?: {
    name?: string;
    phone?: string;
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { orderIds } = body as { orderIds: string[] };

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return NextResponse.json(
        { error: "orderIds array is required and must not be empty" },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    // 1. Fetch store settings for Shopify credentials and fallback store name
    const { data: settings } = await supabase
      .from("app_settings")
      .select("shopify_shop_domain, shopify_access_token, company_name")
      .single();

    const domain = settings?.shopify_shop_domain || process.env.SHOPIFY_SHOP_DOMAIN;
    const token = settings?.shopify_access_token || process.env.SHOPIFY_ACCESS_TOKEN;
    let storeName = settings?.company_name || domain?.replace(".myshopify.com", "")?.toUpperCase() || "STORE";

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
      currency,
      financial_status,
      payment_method,
      cod_amount,
      shipping_address
    `);

    const orClauses: string[] = [];
    if (uuidIds.length > 0) {
      orClauses.push(`id.in.(${uuidIds.join(",")})`);
    }
    if (numericIds.length > 0) {
      orClauses.push(`shopify_order_id.in.(${numericIds.join(",")})`);
    }
    if (nameIds.length > 0) {
      orClauses.push(`shopify_order_name.in.(${nameIds.map((n) => `"${n}"`).join(",")})`);
    }

    let dbOrders: any[] = [];
    if (orClauses.length > 0) {
      const { data, error } = await dbOrdersQuery.or(orClauses.join(","));
      if (!error && data) {
        dbOrders = data;
      }
    }

    // Build database index map for quick lookup
    const dbOrderById = new Map<string, any>();
    const dbOrderByShopifyId = new Map<number, any>();
    const dbOrderByName = new Map<string, any>();

    for (const o of dbOrders) {
      if (o.id) dbOrderById.set(o.id, o);
      if (o.shopify_order_id) dbOrderByShopifyId.set(Number(o.shopify_order_id), o);
      if (o.shopify_order_name) dbOrderByName.set(o.shopify_order_name, o);
    }

    // 3. Try to fetch live store name from Shopify directly
    if (domain && token) {
      try {
        const shopRes = await fetch(`https://${domain}/admin/api/${SHOPIFY_API_VERSION}/shop.json`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": token,
          },
          cache: "no-store",
        });
        if (shopRes.ok) {
          const shopData = await shopRes.json();
          if (shopData?.shop?.name) {
            storeName = shopData.shop.name;
          }
        }
      } catch (err) {
        console.warn("[Due Slips] Could not fetch live shop name, using fallback:", err);
      }
    }

    // 4. Collect Shopify order IDs to query live from Shopify
    const shopifyOrderIdsToFetch = new Set<number>();
    for (const reqId of orderIds) {
      if (/^\d+$/.test(reqId)) {
        shopifyOrderIdsToFetch.add(Number(reqId));
      }
      const matchedDb = dbOrderById.get(reqId) || dbOrderByName.get(reqId);
      if (matchedDb?.shopify_order_id) {
        shopifyOrderIdsToFetch.add(Number(matchedDb.shopify_order_id));
      }
    }

    // 5. Query live orders from Shopify
    const shopifyLiveOrders = new Map<number, ShopifyRestOrder>();
    if (domain && token && shopifyOrderIdsToFetch.size > 0) {
      const idsArray = Array.from(shopifyOrderIdsToFetch);
      // Process in chunks of 50 to respect Shopify REST limits
      const CHUNK_SIZE = 50;
      for (let i = 0; i < idsArray.length; i += CHUNK_SIZE) {
        const chunk = idsArray.slice(i, i + CHUNK_SIZE);
        try {
          const url = `https://${domain}/admin/api/${SHOPIFY_API_VERSION}/orders.json?ids=${chunk.join(",")}&fields=id,name,order_number,created_at,financial_status,total_price,total_outstanding,currency,customer,shipping_address,billing_address`;
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
              for (const ord of data.orders as ShopifyRestOrder[]) {
                shopifyLiveOrders.set(ord.id, ord);
              }
            }
          } else {
            console.warn(`[Due Slips] Failed to fetch chunk from Shopify: ${ordersRes.status}`);
          }
        } catch (err) {
          console.error("[Due Slips] Network error fetching orders chunk from Shopify:", err);
        }
      }
    }

    // 6. Build and validate DueSlipData for every requested order ID preserving exact input order
    const slips: DueSlipData[] = [];
    const failedIds: string[] = [];

    for (const reqId of orderIds) {
      const matchedDb = dbOrderById.get(reqId) || dbOrderByShopifyId.get(Number(reqId)) || dbOrderByName.get(reqId);
      const shopifyId = matchedDb?.shopify_order_id ? Number(matchedDb.shopify_order_id) : /^\d+$/.test(reqId) ? Number(reqId) : null;
      const liveShopify = shopifyId ? shopifyLiveOrders.get(shopifyId) : null;

      // If we found neither DB record nor Shopify live record
      if (!matchedDb && !liveShopify) {
        failedIds.push(reqId);
        slips.push({
          id: reqId,
          shopifyOrderId: shopifyId,
          orderNumber: reqId.startsWith("#") ? reqId : `#${reqId}`,
          storeName,
          customerName: "Unknown Customer",
          customerPhone: "N/A",
          orderDate: format(new Date(), "dd MMM yyyy"),
          totalAmount: 0,
          dueAmount: 0,
          currency: "৳",
          financialStatus: "unknown",
          isPaid: false,
          isValid: false,
          warnings: [],
          error: "Order not found in Shopify or local database",
        });
        continue;
      }

      // Priority: Shopify Live Order as source of truth, fallback to Supabase DB record
      const orderNumber = liveShopify?.name || matchedDb?.shopify_order_name || (liveShopify?.order_number ? `#${liveShopify.order_number}` : `#${reqId}`);
      
      // Customer Name
      let rawCustomerName =
        liveShopify?.shipping_address?.name ||
        (liveShopify?.customer ? `${liveShopify.customer.first_name || ""} ${liveShopify.customer.last_name || ""}`.trim() : "") ||
        liveShopify?.billing_address?.name ||
        matchedDb?.customer_name ||
        matchedDb?.shipping_address?.name ||
        "";

      // Customer Phone
      let rawCustomerPhone =
        liveShopify?.shipping_address?.phone ||
        liveShopify?.customer?.phone ||
        liveShopify?.billing_address?.phone ||
        matchedDb?.customer_phone ||
        matchedDb?.shipping_address?.phone ||
        "";

      // Order Date
      const rawDateStr = liveShopify?.created_at || matchedDb?.shopify_created_at || new Date().toISOString();
      let formattedDate = "";
      try {
        formattedDate = format(new Date(rawDateStr), "dd MMM yyyy");
      } catch {
        formattedDate = rawDateStr.split("T")[0] || rawDateStr;
      }

      // Pricing & Due Calculation
      const totalPrice = parseFloat(liveShopify?.total_price || String(matchedDb?.total_price || "0")) || 0;
      const financialStatus = (liveShopify?.financial_status || matchedDb?.financial_status || "pending").toLowerCase();
      const isPaid = financialStatus === "paid";

      let dueAmount = 0;
      if (isPaid) {
        dueAmount = 0;
      } else if (liveShopify?.total_outstanding !== undefined && liveShopify.total_outstanding !== null) {
        dueAmount = parseFloat(liveShopify.total_outstanding);
        if (isNaN(dueAmount)) dueAmount = totalPrice;
      } else if (matchedDb?.cod_amount !== undefined && matchedDb.cod_amount !== null && matchedDb.cod_amount > 0) {
        dueAmount = Number(matchedDb.cod_amount);
      } else {
        dueAmount = totalPrice;
      }

      const currencyCode = liveShopify?.currency || matchedDb?.currency || "BDT";
      const currencySymbol = currencyCode === "BDT" || currencyCode === "TK" ? "৳" : currencyCode;

      // Validation & Warnings
      const warnings: string[] = [];
      let customerName = rawCustomerName.trim();
      if (!customerName) {
        customerName = "Guest Customer";
        warnings.push("Customer name is missing, defaulted to Guest Customer");
      }

      let customerPhone = rawCustomerPhone.trim();
      if (!customerPhone) {
        customerPhone = "No Phone";
        warnings.push("Customer phone number is missing");
      } else {
        // Normalize Bangladesh phone formatting if applicable
        customerPhone = customerPhone.replace(/\s+/g, " ");
      }

      if (dueAmount < 0) {
        warnings.push("Due amount is negative");
      }

      slips.push({
        id: matchedDb?.id || reqId,
        shopifyOrderId: shopifyId,
        orderNumber,
        storeName,
        customerName,
        customerPhone,
        orderDate: formattedDate,
        rawOrderDate: rawDateStr,
        totalAmount: totalPrice,
        dueAmount,
        currency: currencySymbol,
        financialStatus,
        isPaid,
        isValid: true,
        warnings,
        error: null,
      });
    }

    const validCount = slips.filter((s) => s.isValid && !s.error).length;
    const warningCount = slips.filter((s) => s.isValid && s.warnings.length > 0).length;
    const failedCount = slips.filter((s) => !s.isValid || !!s.error).length;

    return NextResponse.json({
      success: true,
      storeName,
      slips,
      total: slips.length,
      validCount,
      warningCount,
      failedCount,
      failedIds,
    });
  } catch (error: any) {
    console.error("[Due Slips API] Unexpected error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate due slips data" },
      { status: 500 }
    );
  }
}

