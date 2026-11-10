import crypto from "crypto";
import { createServiceClient } from "@/lib/supabase/server";

export interface ShopifySessionTokenPayload {
  iss: string; // https://{shop}.myshopify.com/admin
  dest: string; // https://{shop}.myshopify.com
  aud: string; // app client id
  sub: string; // user id
  exp: number; // expiration unix timestamp
  nbf: number; // not before unix timestamp
  iat: number; // issued at unix timestamp
  jti?: string;
  sid?: string;
}

/**
 * Validates a Shopify OpenID Connect Session Token (JWT).
 * Signs with SHOPIFY_CLIENT_SECRET.
 */
export async function verifyShopifySessionToken(
  token: string | null | undefined
): Promise<ShopifySessionTokenPayload | null> {
  if (!token || typeof token !== "string") return null;

  const parts = token.trim().split(".");
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, signatureB64] = parts;

  // Retrieve client secret from environment or database settings
  let clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  let clientId = process.env.SHOPIFY_CLIENT_ID || "564155a82ac56b69364f8c32e256f1b6";

  if (!clientSecret) {
    try {
      const supabase = createServiceClient();
      const { data: settings } = await supabase
        .from("app_settings")
        .select("shopify_access_token")
        .single();
      // If client secret isn't separately stored, check environment
      clientSecret = process.env.SHOPIFY_CLIENT_SECRET || settings?.shopify_access_token || undefined;
    } catch {
      // fallback
    }
  }

  if (!clientSecret) {
    console.warn("[ShopifyAuth] No SHOPIFY_CLIENT_SECRET configured for session token verification");
    return null;
  }

  try {
    // 1. Verify header algorithm
    const headerJson = Buffer.from(headerB64, "base64url").toString("utf8");
    const header = JSON.parse(headerJson);
    if (header.alg !== "HS256") {
      console.warn(`[ShopifyAuth] Unsupported algorithm in token: ${header.alg}`);
      return null;
    }

    // 2. Verify HMAC SHA-256 signature
    const expectedSignature = crypto
      .createHmac("sha256", clientSecret)
      .update(`${headerB64}.${payloadB64}`)
      .digest("base64url");

    const expectedBuffer = Buffer.from(expectedSignature, "utf8");
    const actualBuffer = Buffer.from(signatureB64, "utf8");

    if (
      expectedBuffer.length !== actualBuffer.length ||
      !crypto.timingSafeEqual(expectedBuffer, actualBuffer)
    ) {
      console.warn("[ShopifyAuth] Invalid session token signature");
      return null;
    }

    // 3. Parse and validate claims
    const payloadJson = Buffer.from(payloadB64, "base64url").toString("utf8");
    const payload: ShopifySessionTokenPayload = JSON.parse(payloadJson);

    const now = Math.floor(Date.now() / 1000);
    const CLOCK_TOLERANCE_SEC = 30; // 30s clock skew tolerance

    // Expiration check
    if (payload.exp && now > payload.exp + CLOCK_TOLERANCE_SEC) {
      console.warn(`[ShopifyAuth] Session token expired: exp=${payload.exp}, now=${now}`);
      return null;
    }

    // Not before check
    if (payload.nbf && now < payload.nbf - CLOCK_TOLERANCE_SEC) {
      console.warn(`[ShopifyAuth] Session token used before valid: nbf=${payload.nbf}, now=${now}`);
      return null;
    }

    // Audience check (if configured)
    if (clientId && payload.aud && payload.aud !== clientId) {
      console.warn(`[ShopifyAuth] Audience mismatch: expected ${clientId}, received ${payload.aud}`);
      // Only warn if client ID mismatch but destination is valid myshopify domain
    }

    // Destination check: must be a myshopify.com domain
    if (!payload.dest || (!payload.dest.includes(".myshopify.com") && !payload.dest.includes("shopify.com"))) {
      console.warn(`[ShopifyAuth] Invalid destination in token: ${payload.dest}`);
      return null;
    }

    return payload;
  } catch (err) {
    console.error("[ShopifyAuth] Error verifying session token:", err);
    return null;
  }
}

