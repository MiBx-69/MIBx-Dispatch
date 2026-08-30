import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { cookies } from "next/headers";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const shop = searchParams.get("shop");

  if (!shop || !shop.endsWith(".myshopify.com")) {
    return NextResponse.json({ error: "Missing or invalid shop parameter" }, { status: 400 });
  }

  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (!clientId || !appUrl) {
    return NextResponse.json({ error: "Missing Shopify Client ID or App URL configuration" }, { status: 500 });
  }

  // Generate a random nonce for security
  const nonce = crypto.randomBytes(16).toString("hex");

  // Store nonce in cookies to verify in the callback
  const cookieStore = await cookies();
  cookieStore.set("shopify_oauth_nonce", nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 10 * 60, // 10 minutes
  });

  const redirectUri = `${appUrl.replace(/\/$/, '')}/api/auth/shopify/callback`;
  const scopes = "read_orders,write_orders,read_customers,write_customers,read_fulfillments,write_fulfillments,read_inventory,write_inventory";

  const authUrl = `https://${shop}/admin/oauth/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${nonce}`;

  return NextResponse.redirect(authUrl);
}
