import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";
import { verifyShopifySessionToken } from "@/lib/shopify-session-token";

describe("Shopify Session Token Verification", () => {
  const testSecret = "test_shopify_client_secret_xyz123";
  const clientId = "564155a82ac56b69364f8c32e256f1b6";

  beforeEach(() => {
    vi.stubEnv("SHOPIFY_CLIENT_SECRET", testSecret);
    vi.stubEnv("SHOPIFY_CLIENT_ID", clientId);
  });

  function createTestJwt(payload: Record<string, any>, secret = testSecret): string {
    const header = { alg: "HS256", typ: "JWT" };
    const headerB64 = Buffer.from(JSON.stringify(header)).toString("base64url");
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = crypto
      .createHmac("sha256", secret)
      .update(`${headerB64}.${payloadB64}`)
      .digest("base64url");
    return `${headerB64}.${payloadB64}.${signature}`;
  }

  it("verifies a valid Shopify session token successfully", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = createTestJwt({
      iss: "https://universesraw.myshopify.com/admin",
      dest: "https://universesraw.myshopify.com",
      aud: clientId,
      sub: "user_12345",
      exp: now + 3600,
      nbf: now - 10,
      iat: now - 10,
    });

    const result = await verifyShopifySessionToken(token);
    expect(result).not.toBeNull();
    expect(result?.dest).toBe("https://universesraw.myshopify.com");
    expect(result?.sub).toBe("user_12345");
  });

  it("rejects token with invalid signature", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = createTestJwt(
      {
        iss: "https://universesraw.myshopify.com/admin",
        dest: "https://universesraw.myshopify.com",
        aud: clientId,
        exp: now + 3600,
        nbf: now - 10,
      },
      "wrong_secret"
    );

    const result = await verifyShopifySessionToken(token);
    expect(result).toBeNull();
  });

  it("rejects expired session token", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = createTestJwt({
      iss: "https://universesraw.myshopify.com/admin",
      dest: "https://universesraw.myshopify.com",
      aud: clientId,
      exp: now - 100, // expired!
      nbf: now - 200,
    });

    const result = await verifyShopifySessionToken(token);
    expect(result).toBeNull();
  });

  it("rejects token with invalid destination", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = createTestJwt({
      iss: "https://malicious-site.com/admin",
      dest: "https://malicious-site.com",
      aud: clientId,
      exp: now + 3600,
      nbf: now - 10,
    });

    const result = await verifyShopifySessionToken(token);
    expect(result).toBeNull();
  });

  it("returns null for malformed or null tokens", async () => {
    expect(await verifyShopifySessionToken(null)).toBeNull();
    expect(await verifyShopifySessionToken("")).toBeNull();
    expect(await verifyShopifySessionToken("invalid.token")).toBeNull();
  });
});

