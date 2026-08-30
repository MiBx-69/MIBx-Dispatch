import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const shop = searchParams.get("shop");
  const code = searchParams.get("code");
  const hmac = searchParams.get("hmac");
  const state = searchParams.get("state");

  if (!shop || !code || !hmac || !state) {
    return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
  }

  // 1. Verify State (Nonce) to prevent CSRF
  const cookieStore = await cookies();
  const storedNonce = cookieStore.get("shopify_oauth_nonce")?.value;
  
  if (state !== storedNonce) {
    return NextResponse.json({ error: "State mismatch (CSRF)" }, { status: 403 });
  }

  // Clear the nonce cookie
  cookieStore.delete("shopify_oauth_nonce");

  // 2. Verify HMAC
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!clientSecret) {
    return NextResponse.json({ error: "Missing SHOPIFY_CLIENT_SECRET" }, { status: 500 });
  }

  // Extract all query params except hmac
  const params: Record<string, string> = {};
  for (const [key, value] of searchParams.entries()) {
    if (key !== "hmac") {
      params[key] = value;
    }
  }

  // Sort keys lexicographically and build the string
  const sortedKeys = Object.keys(params).sort();
  const messageString = sortedKeys.map((key) => `${key}=${params[key]}`).join("&");

  const generatedHash = crypto
    .createHmac("sha256", clientSecret)
    .update(messageString, "utf8")
    .digest("hex");

  if (generatedHash !== hmac) {
    return NextResponse.json({ error: "Invalid HMAC signature" }, { status: 403 });
  }

  // 3. Exchange Code for Access Token
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }),
  });

  const tokenData = await tokenResponse.json();

  if (!tokenResponse.ok || !tokenData.access_token) {
    console.error("Shopify OAuth Error:", tokenData);
    return NextResponse.json({ error: "Failed to exchange token" }, { status: 500 });
  }

  // 4. Save the Access Token and Shop Domain to Supabase
  const supabase = createServiceClient();
  
  // Try to find existing settings
  const { data: settings } = await supabase.from("app_settings").select("id").limit(1).single();

  if (settings) {
    await supabase.from("app_settings").update({
      shopify_access_token: tokenData.access_token,
      shopify_shop_domain: shop,
    }).eq("id", settings.id);
  } else {
    await supabase.from("app_settings").insert({
      system_name: "MiBx Dispatch",
      shopify_access_token: tokenData.access_token,
      shopify_shop_domain: shop,
      fraud_check_enabled: false,
    });
  }

  // Redirect back to settings page with success message
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return NextResponse.redirect(`${appUrl}/settings?oauth_success=true`);
}
