import { NextRequest, NextResponse } from "next/server";
import { fetchOrderStickersData } from "@/lib/order-sticker-service";
import { generateOrderStickersHtml } from "@/lib/order-sticker-printer";
import { DEFAULT_75X100_CONFIG } from "@/types/order-sticker";

function getCorsHeaders(origin?: string | null): Record<string, string> {
  const allowed = !origin || origin.includes("shopify.com") || origin.includes("universesraw.com") || origin.includes("localhost")
    ? (origin || "*")
    : "*";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, Accept",
    "Access-Control-Max-Age": "86400",
    "Content-Security-Policy": "frame-ancestors https://*.myshopify.com https://admin.shopify.com https://*.spin.dev http://localhost:* 'self';",
    "X-Content-Type-Options": "nosniff",
  };
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(origin),
  });
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin");
  try {
    const url = new URL(req.url);
    const rawIds =
      url.searchParams.get("ids") ||
      url.searchParams.get("orderIds") ||
      url.searchParams.get("order_ids") ||
      "";

    const ids = rawIds
      .split(",")
      .map((s) => s.trim().replace(/^gid:\/\/shopify\/Order\//, ""))
      .filter((s) => s.length > 0);

    if (ids.length === 0) {
      return new NextResponse(
        `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:20px;text-align:center;"><h2>No order IDs provided</h2></body></html>`,
        {
          status: 400,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            ...getCorsHeaders(origin),
          },
        }
      );
    }

    const result = await fetchOrderStickersData(ids);

    if (!result.stickers || result.stickers.length === 0) {
      return new NextResponse(
        `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:20px;text-align:center;"><h2>No matching orders found</h2></body></html>`,
        {
          status: 404,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            ...getCorsHeaders(origin),
          },
        }
      );
    }

    const html = generateOrderStickersHtml(result.stickers, DEFAULT_75X100_CONFIG);

    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=0, must-revalidate",
        ...getCorsHeaders(origin),
      },
    });
  } catch (error: any) {
    console.error("[Order Stickers Print Route] Error:", error);
    return new NextResponse(
      `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:20px;text-align:center;color:red;"><h2>Error generating stickers</h2><p>${error.message || "Internal error"}</p></body></html>`,
      {
        status: 500,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          ...getCorsHeaders(origin),
        },
      }
    );
  }
}
