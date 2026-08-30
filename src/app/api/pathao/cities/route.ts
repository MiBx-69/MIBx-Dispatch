import { type NextRequest, NextResponse } from "next/server";
import { getPathaoCities, getPathaoZones, getPathaoAreas } from "@/lib/pathao/client";

export async function GET(request: NextRequest) {
  const cities = await getPathaoCities();
  return NextResponse.json({ cities });
}
