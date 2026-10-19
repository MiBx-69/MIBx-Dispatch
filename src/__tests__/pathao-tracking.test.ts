import { describe, it, expect } from "vitest";
import { normalizeBdPhoneForPathao, formatPathaoTrackingUrl } from "@/lib/pathao/client";
import { buildDispatchCombinedNote } from "@/lib/fraud-checker";

describe("Pathao Tracking URL & Phone Normalization", () => {
  it("normalizes phone with leading 01 to +8801...", () => {
    expect(normalizeBdPhoneForPathao("01712200891")).toBe("+8801712200891");
  });

  it("normalizes phone with 880 prefix", () => {
    expect(normalizeBdPhoneForPathao("8801712200891")).toBe("+8801712200891");
  });

  it("keeps existing +880 format", () => {
    expect(normalizeBdPhoneForPathao("+8801712200891")).toBe("+8801712200891");
  });

  it("normalizes phone with formatting spaces and dashes", () => {
    expect(normalizeBdPhoneForPathao("+88 01712-200891")).toBe("+8801712200891");
  });

  it("normalizes 10-digit number without leading 0", () => {
    expect(normalizeBdPhoneForPathao("1712200891")).toBe("+8801712200891");
  });

  it("handles null or undefined phone safely", () => {
    expect(normalizeBdPhoneForPathao(null)).toBe("");
    expect(normalizeBdPhoneForPathao(undefined)).toBe("");
    expect(normalizeBdPhoneForPathao("")).toBe("");
  });

  it("generates correct Pathao tracking link matching user specification", () => {
    const url = formatPathaoTrackingUrl("DU171026QMF76R", "+8801712200891");
    expect(url).toBe("https://merchant.pathao.com/tracking?consignment_id=DU171026QMF76R&phone=%2B8801712200891");
  });

  it("generates correct Pathao tracking link from local 01... phone format", () => {
    const url = formatPathaoTrackingUrl("DU171026QMF76R", "01712200891");
    expect(url).toBe("https://merchant.pathao.com/tracking?consignment_id=DU171026QMF76R&phone=%2B8801712200891");
  });

  it("generates fallback Pathao tracking link if phone is missing", () => {
    const url = formatPathaoTrackingUrl("DU171026QMF76R", null);
    expect(url).toBe("https://merchant.pathao.com/tracking?consignment_id=DU171026QMF76R");
  });

  it("returns empty string if consignmentId is missing", () => {
    expect(formatPathaoTrackingUrl("", "01712200891")).toBe("");
    expect(formatPathaoTrackingUrl(null, "01712200891")).toBe("");
  });
});

describe("Shopify Order Note Tracking", () => {
  it("includes consignment and tracking link when note is empty", () => {
    const note = buildDispatchCombinedNote({
      consignmentId: "DU171026QMF76R",
      trackingUrl: "https://merchant.pathao.com/tracking?consignment_id=DU171026QMF76R&phone=%2B8801712200891",
    });
    expect(note).toContain("Pathao Consignment: DU171026QMF76R");
    expect(note).toContain("Pathao Tracking: https://merchant.pathao.com/tracking?consignment_id=DU171026QMF76R&phone=%2B8801712200891");
  });

  it("appends previous order notes cleanly while updating consignment and tracking link", () => {
    const note = buildDispatchCombinedNote({
      consignmentId: "DU171026QMF76R",
      trackingUrl: "https://merchant.pathao.com/tracking?consignment_id=DU171026QMF76R&phone=%2B8801712200891",
      existingNote: "Pathao Consignment: OLD123\nPathao Tracking: https://old\n\n[Order Note]\nPlease call before delivery",
    });
    expect(note).toContain("Pathao Consignment: DU171026QMF76R");
    expect(note).toContain("Pathao Tracking: https://merchant.pathao.com/tracking?consignment_id=DU171026QMF76R&phone=%2B8801712200891");
    expect(note).toContain("[Order Note]\nPlease call before delivery");
    expect(note).not.toContain("OLD123");
    expect(note).not.toContain("https://old");
  });
});
