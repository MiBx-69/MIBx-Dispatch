import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/reports/staff-performance
 * Returns staff productivity and operations metrics:
 * - Packs verified
 * - Dispatches executed
 * - Inventory entries (Stock in / Stock out)
 * - Customer follow-up CRM notes
 * - Recent staff activity timeline
 */
export async function GET() {
  try {
    const supabase = createServiceClient();

    const [
      eventsRes,
      inventoryRes,
      followUpsRes,
      profilesRes,
    ] = await Promise.all([
      // 1. Order events for packing and dispatch
      supabase
        .from("order_events")
        .select("event_type, description, metadata, created_at")
        .in("event_type", ["PACKING_VERIFIED", "DISPATCHED", "RE_DISPATCHED"])
        .order("created_at", { ascending: false })
        .limit(1000),

      // 2. Inventory movements
      supabase
        .from("inventory_movements" as any)
        .select("movement_type, created_by, created_at")
        .order("created_at", { ascending: false })
        .limit(500)
        .then((res: any) => res, () => ({ data: [] })),

      // 3. Customer follow-ups
      supabase
        .from("customer_follow_ups" as any)
        .select("created_by, status, created_at")
        .order("created_at", { ascending: false })
        .limit(500)
        .then((res: any) => res, () => ({ data: [] })),

      // 4. Profiles
      supabase
        .from("profiles")
        .select("id, full_name, role"),
    ]);

    const staffMap = new Map<
      string,
      {
        name: string;
        role: string;
        packsVerified: number;
        dispatchesCount: number;
        inventoryActions: number;
        followUpsCount: number;
        lastActive: string | null;
      }
    >();

    // Seed staff from profiles
    (profilesRes.data || []).forEach((p: any) => {
      if (p.full_name) {
        staffMap.set(p.full_name.trim(), {
          name: p.full_name.trim(),
          role: p.role || "staff",
          packsVerified: 0,
          dispatchesCount: 0,
          inventoryActions: 0,
          followUpsCount: 0,
          lastActive: null,
        });
      }
    });

    const getOrCreateStaff = (name: string, role = "Staff") => {
      const clean = (name || "Warehouse Staff").trim();
      if (!staffMap.has(clean)) {
        staffMap.set(clean, {
          name: clean,
          role,
          packsVerified: 0,
          dispatchesCount: 0,
          inventoryActions: 0,
          followUpsCount: 0,
          lastActive: null,
        });
      }
      return staffMap.get(clean)!;
    };

    // Aggregate Order Events
    (eventsRes.data || []).forEach((e: any) => {
      const staffName =
        e.metadata?.packed_by ||
        e.metadata?.staff_name ||
        e.metadata?.created_by ||
        "Warehouse Staff";
      const staff = getOrCreateStaff(staffName);

      if (e.event_type === "PACKING_VERIFIED") {
        staff.packsVerified++;
      } else if (e.event_type === "DISPATCHED" || e.event_type === "RE_DISPATCHED") {
        staff.dispatchesCount++;
      }

      if (!staff.lastActive || new Date(e.created_at) > new Date(staff.lastActive)) {
        staff.lastActive = e.created_at;
      }
    });

    // Aggregate Inventory Movements
    (inventoryRes.data || []).forEach((inv: any) => {
      if (inv.created_by) {
        const staff = getOrCreateStaff(inv.created_by);
        staff.inventoryActions++;
        if (!staff.lastActive || new Date(inv.created_at) > new Date(staff.lastActive)) {
          staff.lastActive = inv.created_at;
        }
      }
    });

    // Aggregate Follow-ups
    (followUpsRes.data || []).forEach((fu: any) => {
      if (fu.created_by) {
        const staff = getOrCreateStaff(fu.created_by);
        staff.followUpsCount++;
        if (!staff.lastActive || new Date(fu.created_at) > new Date(staff.lastActive)) {
          staff.lastActive = fu.created_at;
        }
      }
    });

    const staffList = Array.from(staffMap.values())
      .map((s) => ({
        ...s,
        totalActions:
          s.packsVerified + s.dispatchesCount + s.inventoryActions + s.followUpsCount,
      }))
      .filter((s) => s.totalActions > 0 || s.role === "admin" || s.role === "staff")
      .sort((a, b) => b.totalActions - a.totalActions);

    return NextResponse.json({
      staff: staffList,
      totalStaffCount: staffList.length,
      topPerformer: staffList[0] || null,
    });
  } catch (err: any) {
    console.error("[Staff Performance API] Error:", err);
    return NextResponse.json({ error: err.message || "Failed to load staff performance" }, { status: 500 });
  }
}
