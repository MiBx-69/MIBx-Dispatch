import { NextRequest, NextResponse } from "next/server";
import { createServiceClient, createClient } from "@/lib/supabase/server";

interface FollowUpPayload {
  title: string;
  note?: string;
  reminder_date?: string;
  order_id?: string;
  priority?: "low" | "normal" | "high" | "urgent";
}

/**
 * GET /api/customers/[id]/follow-ups
 * Returns follow-up reminders and CRM notes for a customer.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: customerId } = await params;
    if (!customerId) {
      return NextResponse.json({ error: "Customer ID is required" }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Query customer_follow_ups table
    const { data: followUps, error } = await supabase
      .from("customer_follow_ups" as any)
      .select("*")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false });

    if (error) {
      // If table doesn't exist yet, return empty list gracefully
      console.warn("[CustomerFollowUps] Table not found or query error:", error.message);
      return NextResponse.json({ followUps: [] });
    }

    return NextResponse.json({ followUps: followUps || [] });
  } catch (err: any) {
    console.error("[CustomerFollowUps] GET error:", err);
    return NextResponse.json({ error: err.message || "Failed to fetch follow-ups" }, { status: 500 });
  }
}

/**
 * POST /api/customers/[id]/follow-ups
 * Creates a new follow-up reminder or CRM note.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: customerId } = await params;
    if (!customerId) {
      return NextResponse.json({ error: "Customer ID is required" }, { status: 400 });
    }

    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();

    const supabase = createServiceClient();
    let staffName = "Staff";
    if (user?.id) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", user.id)
        .maybeSingle();
      if (profile?.full_name) staffName = profile.full_name;
    }

    const body: FollowUpPayload = await request.json();
    if (!body.title?.trim()) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const insertRecord = {
      customer_id: customerId,
      order_id: body.order_id || null,
      title: body.title.trim(),
      note: body.note?.trim() || null,
      reminder_date: body.reminder_date || null,
      status: "pending",
      priority: body.priority || "normal",
      created_by: staffName,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: created, error } = await supabase
      .from("customer_follow_ups" as any)
      .insert(insertRecord)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      followUp: created,
    });
  } catch (err: any) {
    console.error("[CustomerFollowUps] POST error:", err);
    return NextResponse.json({ error: err.message || "Failed to create follow-up" }, { status: 500 });
  }
}

/**
 * PATCH /api/customers/[id]/follow-ups
 * Updates status (e.g. mark completed, cancelled) or note.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const body = await request.json();
    const { follow_up_id, status, note, reminder_date } = body;

    if (!follow_up_id) {
      return NextResponse.json({ error: "follow_up_id is required" }, { status: 400 });
    }

    const supabase = createServiceClient();
    const updates: any = {
      updated_at: new Date().toISOString(),
    };

    if (status) updates.status = status;
    if (note !== undefined) updates.note = note;
    if (reminder_date !== undefined) updates.reminder_date = reminder_date;

    const { data: updated, error } = await supabase
      .from("customer_follow_ups" as any)
      .update(updates)
      .eq("id", follow_up_id)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      followUp: updated,
    });
  } catch (err: any) {
    console.error("[CustomerFollowUps] PATCH error:", err);
    return NextResponse.json({ error: err.message || "Failed to update follow-up" }, { status: 500 });
  }
}
