import { type NextRequest, NextResponse } from "next/server";
import { getUnifiedLogs } from "@/lib/log-engine";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const source = searchParams.get("source") || "all";
  const status = searchParams.get("status") || "all";
  const search = searchParams.get("search") || "";
  const dateFilter = searchParams.get("dateFilter") || "all";
  const startDate = searchParams.get("startDate") || undefined;
  const endDate = searchParams.get("endDate") || undefined;
  const format = searchParams.get("format") || "csv";

  const { logs } = await getUnifiedLogs({
    source,
    status,
    search,
    dateFilter,
    startDate,
    endDate,
    page: 1,
    pageSize: 1000,
  });

  if (!logs || logs.length === 0) {
    return NextResponse.json({ error: "No logs found to export" }, { status: 404 });
  }

  if (format === "json") {
    return new NextResponse(JSON.stringify(logs, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="app_logs_${dateFilter}_${Date.now()}.json"`,
      },
    });
  }

  // Generate CSV
  const headers = ["Timestamp (BST)", "Source", "Event / Topic", "Reference", "Status", "Summary", "Error Details"].join(",");
  const rows = logs.map((l) => {
    const bstTime = new Date(l.timestamp).toLocaleString("en-US", { timeZone: "Asia/Dhaka" });
    const escape = (val: string | null | undefined) => `"${(val || "").replace(/"/g, '""')}"`;
    return [
      escape(bstTime),
      escape(l.source.toUpperCase()),
      escape(l.topic),
      escape(l.reference || ""),
      escape(l.status.toUpperCase()),
      escape(l.summary),
      escape(l.error || ""),
    ].join(",");
  });

  const csv = [headers, ...rows].join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="app_logs_${dateFilter}_${Date.now()}.csv"`,
    },
  });
}
