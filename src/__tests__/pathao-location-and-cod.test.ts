import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/pathao/client", () => ({
  getPathaoZones: vi.fn(async (cityId: number) => {
    if (cityId === 47) {
      return [
        { zone_id: 1141, zone_name: "Raipura North" },
        { zone_id: 523, zone_name: "Raipura South" },
        { zone_id: 151, zone_name: "Narshingdi Sadar" },
      ];
    }
    if (cityId === 1) {
      return [
        { zone_id: 12, zone_name: "Mirpur" },
        { zone_id: 14, zone_name: "Uttara" },
        { zone_id: 1, zone_name: "Dhaka Sadar" },
      ];
    }
    return [{ zone_id: 100, zone_name: "Central Sadar" }];
  }),
}));

import { resolvePathaoCity, resolvePathaoZone, BANGLADESH_DISTRICTS } from "@/lib/pathao/location-resolver";

describe("Pathao Location Resolver & COD Calculation", () => {
  describe("1. Bangladesh 64 Districts Coverage", () => {
    it("contains all 64 districts with unique city IDs", () => {
      expect(BANGLADESH_DISTRICTS.length).toBe(64);
      const uniqueIds = new Set(BANGLADESH_DISTRICTS.map((d) => d.city_id));
      expect(uniqueIds.size).toBe(64);
    });
  });

  describe("2. Bengali District Resolution", () => {
    it("resolves Bengali 'নরসিংদী' to Narshingdi (city_id: 47)", () => {
      const res = resolvePathaoCity({ city: "নরসিংদী", address1: "পাড়াতলি,পাড়াতলি বাজার রায়পুরা" });
      expect(res).not.toBeNull();
      expect(res?.city_id).toBe(47);
      expect(res?.city_name).toBe("Narshingdi");
    });

    it("resolves Bengali 'ঢাকা' to Dhaka (city_id: 1)", () => {
      const res = resolvePathaoCity({ city: "ঢাকা", address1: "মিরপুর ১০, ঢাকা" });
      expect(res).not.toBeNull();
      expect(res?.city_id).toBe(1);
    });

    it("resolves Bengali 'চট্টগ্রাম' to Chittagong (city_id: 2)", () => {
      const res = resolvePathaoCity({ city: "চট্টগ্রাম", address1: "আগ্রাবাদ বাণিজ্যিক এলাকা" });
      expect(res).not.toBeNull();
      expect(res?.city_id).toBe(2);
    });

    it("resolves Bengali Upazila 'রায়পুরা' in address to Narshingdi (city_id: 47)", () => {
      const res = resolvePathaoCity({ address1: "রায়পুরা বাজার, পাড়াতলি" });
      expect(res).not.toBeNull();
      expect(res?.city_id).toBe(47);
    });

    it("resolves English alternative 'Comilla' to Cumilla (city_id: 5)", () => {
      const res = resolvePathaoCity({ city: "Comilla" });
      expect(res?.city_id).toBe(5);
    });

    it("resolves English alternative 'Jessore' to Jashore (city_id: 19)", () => {
      const res = resolvePathaoCity({ city: "Jessore" });
      expect(res?.city_id).toBe(19);
    });

    it("falls back to Dhaka (city_id: 1) during auto-dispatch when city is unrecognized", () => {
      const res = resolvePathaoCity({ address1: "Unknown remote road" }, true);
      expect(res).not.toBeNull();
      expect(res?.city_id).toBe(1);
    });
  });

  describe("3. Zone Resolution with Bengali & English Subdistricts", () => {
    it("resolves 'রায়পুরা' to Raipura North zone for Narshingdi", async () => {
      const res = await resolvePathaoZone(47, { address1: "পাড়াতলি,পাড়াতলি বাজার রায়পুরা", city: "নরসিংদী" });
      expect(res).not.toBeNull();
      expect(res?.zone_name).toContain("Raipura");
    });
  });

  describe("4. COD Amount Calculation (Paid vs Due Amount)", () => {
    function computeCodToCollect(order: {
      financial_status?: string | null;
      cod_amount?: number | null;
      total_price?: number | null;
      amount_to_collect?: number | null;
    }): number {
      if (order.amount_to_collect !== undefined && order.amount_to_collect !== null) {
        return Math.max(0, Math.round(Number(order.amount_to_collect)));
      }
      const finStatus = (order.financial_status || "").toLowerCase();
      const isPaid = finStatus === "paid" || finStatus === "refunded";
      if (isPaid) {
        return 0;
      }
      if (order.cod_amount !== undefined && order.cod_amount !== null) {
        return Math.max(0, Math.round(Number(order.cod_amount)));
      }
      if (order.total_price !== null && order.total_price !== undefined) {
        return Math.max(0, Math.round(Number(order.total_price)));
      }
      return 0;
    }

    it("sets COD to 0 when order financial_status is 'paid'", () => {
      const cod = computeCodToCollect({
        financial_status: "paid",
        total_price: 2500,
        cod_amount: 0,
      });
      expect(cod).toBe(0);
    });

    it("sets COD to 0 when order financial_status is 'PAID' (case-insensitive)", () => {
      const cod = computeCodToCollect({
        financial_status: "PAID",
        total_price: 1500,
      });
      expect(cod).toBe(0);
    });

    it("sets COD to exact due amount when order is pending COD", () => {
      const cod = computeCodToCollect({
        financial_status: "pending",
        total_price: 880,
        cod_amount: 880,
      });
      expect(cod).toBe(880);
    });

    it("sets COD to partial due amount when partially paid", () => {
      const cod = computeCodToCollect({
        financial_status: "partially_paid",
        total_price: 1000,
        cod_amount: 700, // 300 advance paid, 700 due
      });
      expect(cod).toBe(700);
    });

    it("honors explicitly provided amount_to_collect override", () => {
      const cod = computeCodToCollect({
        financial_status: "pending",
        total_price: 1000,
        cod_amount: 1000,
        amount_to_collect: 500,
      });
      expect(cod).toBe(500);
    });
  });
});
