import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { performFraudCheck } from "@/lib/fraud-checker";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createServiceClient();
    
    const result = await performFraudCheck(id, supabase);

    return NextResponse.json({ 
      success: true, 
      ...result
    });

  } catch (error: any) {
    console.error("Manual fraud check error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
