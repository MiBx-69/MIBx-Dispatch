import { createServiceClient } from "@/lib/supabase/server";

export async function logOrderEvent(orderId: string, eventType: string, description: string, metadata: any = {}) {
  const supabase = createServiceClient();
  try {
    const { error } = await supabase.from("order_events").insert({
      order_id: orderId,
      event_type: eventType,
      description,
      metadata,
    });
    if (error) {
      console.error("[Audit Log Error]", error.message);
    }
  } catch (err) {
    console.error("[Audit Log Error]", err);
  }
}
