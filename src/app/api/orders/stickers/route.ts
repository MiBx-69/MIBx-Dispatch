import { NextRequest, NextResponse } from "next/server";
import { verifyShopifySessionToken } from "@/lib/shopify-session-token";
import { fetchOrderStickersData } from "@/lib/order-sticker-service";

function getCorsHeaders(origin?: string | null): Record<string, string> {
  const allowed = !origin || origin.includes("shopify.com") || origin.includes("universesraw.com") || origin.includes("localhost")
    ? (origin || "*")
    : "*";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS, HEAD",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, Accept",
    "Access-Control-Max-Age": "86400",
  };
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(origin),
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { orderIds: rawOrderIds, customDiscountReasons = {}, token: bodyToken } = body as {
      orderIds: string[];
      customDiscountReasons?: Record<string, string>;
      token?: string;
    };

    if (!rawOrderIds || !Array.isArray(rawOrderIds) || rawOrderIds.length === 0) {
      return NextResponse.json(
        { error: "orderIds array is required and must not be empty" },
        { status: 400, headers: getCorsHeaders(req.headers.get("origin")) }
      );
    }

    // Optional Shopify Session Token Verification if called from extension
    const authHeader = req.headers.get("authorization");
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const sessionToken = bodyToken || bearerToken;
    if (sessionToken) {
      try {
        await verifyShopifySessionToken(sessionToken);
      } catch (authErr) {
        console.warn("[Order Stickers API] Session token verification skipped/failed:", authErr);
      }
    }

    const result = await fetchOrderStickersData(rawOrderIds, customDiscountReasons);

    return NextResponse.json(result, {
      headers: getCorsHeaders(req.headers.get("origin")),
    });
  } catch (error: any) {
    console.error("[Order Stickers API] Fatal error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate sticker data" },
      { status: 500, headers: getCorsHeaders(req.headers.get("origin")) }
    );
  }
}
