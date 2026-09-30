import { describe, it, expect } from "vitest";

describe("Order Status & SMS Template Tests", () => {
  describe("SMS Template Variable Interpolation", () => {
    function interpolateTemplate(
      template: string,
      vars: { customer_name: string; order_name: string; tracking_code: string; delivery_status: string }
    ): string {
      return template
        .replace(/\{\{customer_name\}\}/g, vars.customer_name)
        .replace(/\{\{order_name\}\}/g, vars.order_name)
        .replace(/\{\{tracking_code\}\}/g, vars.tracking_code)
        .replace(/\{\{delivery_status\}\}/g, vars.delivery_status);
    }

    it("replaces single occurrences of all placeholders", () => {
      const template = "Hello {{customer_name}}, your order {{order_name}} is now {{delivery_status}}! Tracking: {{tracking_code}}";
      const result = interpolateTemplate(template, {
        customer_name: "Tanvir Rahman",
        order_name: "#1050",
        tracking_code: "PT98765432",
        delivery_status: "Out for Delivery",
      });

      expect(result).toBe("Hello Tanvir Rahman, your order #1050 is now Out for Delivery! Tracking: PT98765432");
    });

    it("replaces multiple occurrences of the same variable (global regex)", () => {
      const template = "Order {{order_name}} confirmed. Track {{order_name}} with code {{tracking_code}} or check {{order_name}} online.";
      const result = interpolateTemplate(template, {
        customer_name: "John Doe",
        order_name: "#2020",
        tracking_code: "PT112233",
        delivery_status: "dispatched",
      });

      expect(result).not.toContain("{{order_name}}");
      expect(result).toBe("Order #2020 confirmed. Track #2020 with code PT112233 or check #2020 online.");
    });
  });

  describe("Order Status Transition Dates", () => {
    function calculateStatusUpdates(
      currentOrder: { delivered_at: string | null; returned_at: string | null; cancel_reason: string | null },
      newStatus: string,
      timestamp: string
    ) {
      const updates: Record<string, any> = { internal_status: newStatus };

      if (newStatus === "delivered") {
        updates.delivered_at = currentOrder.delivered_at || timestamp;
      } else if (newStatus === "returned") {
        updates.returned_at = currentOrder.returned_at || timestamp;
        updates.return_reason = "Manually marked as returned";
      } else if (newStatus === "cancelled") {
        updates.cancel_reason = currentOrder.cancel_reason || "Cancelled by Admin";
        updates.returned_at = null;
      }

      return updates;
    }

    it("sets delivered_at timestamp on delivery", () => {
      const now = "2026-09-30T12:00:00.000Z";
      const updates = calculateStatusUpdates({ delivered_at: null, returned_at: null, cancel_reason: null }, "delivered", now);
      expect(updates.delivered_at).toBe(now);
      expect(updates.internal_status).toBe("delivered");
    });

    it("preserves existing delivered_at if already set", () => {
      const originalDate = "2026-09-25T10:00:00.000Z";
      const newDate = "2026-09-30T12:00:00.000Z";
      const updates = calculateStatusUpdates({ delivered_at: originalDate, returned_at: null, cancel_reason: null }, "delivered", newDate);
      expect(updates.delivered_at).toBe(originalDate);
    });

    it("sets returned_at timestamp on return", () => {
      const now = "2026-09-30T12:00:00.000Z";
      const updates = calculateStatusUpdates({ delivered_at: null, returned_at: null, cancel_reason: null }, "returned", now);
      expect(updates.returned_at).toBe(now);
      expect(updates.return_reason).toBe("Manually marked as returned");
    });
  });
});
