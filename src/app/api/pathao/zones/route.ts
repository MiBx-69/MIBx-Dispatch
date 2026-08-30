import { type NextRequest, NextResponse } from "next/server";
import { getPathaoZones } from "@/lib/pathao/client";

export async function GET(request: NextRequest) {
  const cityId = request.nextUrl.searchParams.get("city_id");
  if (!cityId) return NextResponse.json({ zones: [] });
  const zones = await getPathaoZones(parseInt(cityId));
  return NextResponse.json({ zones });
}
