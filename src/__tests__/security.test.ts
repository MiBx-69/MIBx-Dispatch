import { describe, it, expect } from "vitest";
import crypto from "crypto";

// Open redirect sanitizer logic under test
function sanitizeRedirectUrl(url: string | null | undefined): string {
  if (!url || typeof url !== "string") return "/";
  const trimmed = url.trim();
  if (
    trimmed.startsWith("//") ||
    trimmed.startsWith("/\\") ||
    /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)
  ) {
    return "/";
  }
  if (!trimmed.startsWith("/")) {
    return `/${trimmed}`;
  }
  return trimmed;
}

// Search filter sanitizer logic under test
function sanitizeSearchQuery(query: string): string {
  return query.replace(/[,()]/g, " ").trim();
}

// Timing-safe secret verification helper under test
function safeSecretCompare(a: string, b: string): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

describe("Security Hardening Tests", () => {
  describe("Open Redirect Prevention", () => {
    it("allows safe internal paths", () => {
      expect(sanitizeRedirectUrl("/orders")).toBe("/orders");
      expect(sanitizeRedirectUrl("/settings/general")).toBe("/settings/general");
      expect(sanitizeRedirectUrl("dispatches")).toBe("/dispatches");
    });

    it("rejects protocol-relative URL exploits", () => {
      expect(sanitizeRedirectUrl("//attacker.com")).toBe("/");
      expect(sanitizeRedirectUrl("//evil.com/phish")).toBe("/");
      expect(sanitizeRedirectUrl("/\\attacker.com")).toBe("/");
    });

    it("rejects absolute scheme URLs (HTTP, HTTPS, javascript, data)", () => {
      expect(sanitizeRedirectUrl("https://evil.com")).toBe("/");
      expect(sanitizeRedirectUrl("http://phishing.site")).toBe("/");
      expect(sanitizeRedirectUrl("javascript:alert(1)")).toBe("/");
      expect(sanitizeRedirectUrl("data:text/html,<script>alert(1)</script>")).toBe("/");
    });

    it("defaults to root for null, empty, or undefined input", () => {
      expect(sanitizeRedirectUrl(null)).toBe("/");
      expect(sanitizeRedirectUrl(undefined)).toBe("/");
      expect(sanitizeRedirectUrl("")).toBe("/");
    });
  });

  describe("PostgREST Search Filter Sanitization", () => {
    it("strips commas that break PostgREST comma-separated or-filters", () => {
      const input = "1001,customer_phone.eq.01700000000";
      const sanitized = sanitizeSearchQuery(input);
      expect(sanitized).not.toContain(",");
      expect(sanitized).toBe("1001 customer_phone.eq.01700000000");
    });

    it("strips parentheses that could manipulate query grammar", () => {
      const input = "test)(customer_name.eq.admin";
      const sanitized = sanitizeSearchQuery(input);
      expect(sanitized).not.toContain("(");
      expect(sanitized).not.toContain(")");
    });

    it("preserves standard customer search terms", () => {
      expect(sanitizeSearchQuery("01712345678")).toBe("01712345678");
      expect(sanitizeSearchQuery("#1001")).toBe("#1001");
      expect(sanitizeSearchQuery("Hasan Mahmud")).toBe("Hasan Mahmud");
    });
  });

  describe("Timing-Safe Secret Comparison", () => {
    const validSecret = "secure-webhook-secret-token-32-chars";

    it("returns true for exact secret match", () => {
      expect(safeSecretCompare(validSecret, validSecret)).toBe(true);
    });

    it("returns false for length mismatches without throwing", () => {
      expect(safeSecretCompare("short", validSecret)).toBe(false);
      expect(safeSecretCompare(validSecret, "longer-than-valid-secret-token-here")).toBe(false);
    });

    it("returns false for partial matches (prevents substring bypass)", () => {
      expect(safeSecretCompare("secure", validSecret)).toBe(false);
      expect(safeSecretCompare("s", validSecret)).toBe(false);
    });

    it("returns false for empty or missing secrets", () => {
      expect(safeSecretCompare("", validSecret)).toBe(false);
      expect(safeSecretCompare(validSecret, "")).toBe(false);
      expect(safeSecretCompare("", "")).toBe(false);
    });
  });

  describe("Shopify Webhook HMAC Verification", () => {
    const testSecret = "shpss_test_secret_key_1234567890";
    const payload = JSON.stringify({ id: 987654321, email: "customer@example.com" });
    const validHmac = crypto
      .createHmac("sha256", testSecret)
      .update(payload, "utf8")
      .digest("base64");

    it("verifies webhook with exact single secret", async () => {
      const { verifyShopifyWebhook } = await import("../lib/shopify/client");
      expect(verifyShopifyWebhook(payload, validHmac, testSecret)).toBe(true);
    });

    it("verifies webhook when valid secret is one of multiple candidate secrets", async () => {
      const { verifyShopifyWebhook } = await import("../lib/shopify/client");
      const candidates = ["shpss_wrong_secret_1", testSecret, "shpss_wrong_secret_2"];
      expect(verifyShopifyWebhook(payload, validHmac, candidates)).toBe(true);
    });

    it("rejects webhook if body was tampered with", async () => {
      const { verifyShopifyWebhook } = await import("../lib/shopify/client");
      const tamperedPayload = JSON.stringify({ id: 987654321, email: "hacker@example.com" });
      expect(verifyShopifyWebhook(tamperedPayload, validHmac, testSecret)).toBe(false);
    });

    it("rejects webhook with invalid HMAC header", async () => {
      const { verifyShopifyWebhook } = await import("../lib/shopify/client");
      expect(verifyShopifyWebhook(payload, "invalid_hmac_header", testSecret)).toBe(false);
    });

    it("rejects webhook if no secret is configured", async () => {
      const { verifyShopifyWebhook } = await import("../lib/shopify/client");
      expect(verifyShopifyWebhook(payload, validHmac, [])).toBe(false);
    });
  });
});
