import { NextResponse } from "next/server";
import { getPathaoStores } from "@/lib/pathao/client";

export async function GET() {
  try {
    const data = await getPathaoStores();
    return NextResponse.json({ stores: data.data?.data || [] });
  } catch (error: any) {
    console.error("Fetch stores error:", error);
    return NextResponse.json(
      { error: "Failed to fetch stores" },
      { status: 500 }
    );
  }
}
