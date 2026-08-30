import { type NextRequest, NextResponse } from "next/server";
import { getPathaoAreas } from "@/lib/pathao/client";

export async function GET(request: NextRequest) {
  const zoneId = request.nextUrl.searchParams.get("zone_id");
  if (!zoneId) return NextResponse.json({ areas: [] });
  const areas = await getPathaoAreas(parseInt(zoneId));
  return NextResponse.json({ areas });
}
