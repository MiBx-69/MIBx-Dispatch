import { Metadata } from "next";
import { getUnifiedLogs, getLogAnalytics } from "@/lib/log-engine";
import { LogsClient } from "./logs-client";

export const metadata: Metadata = {
  title: "Log Analytics | MiBx Dispatch",
  description: "Comprehensive A-to-Z system and webhook logs explorer and analytics",
};

export const dynamic = "force-dynamic";

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<{
    source?: string;
    status?: string;
    search?: string;
    dateFilter?: string;
    startDate?: string;
    endDate?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;
  const dateFilter = params.dateFilter || "all";
  const source = params.source || "all";
  const status = params.status || "all";
  const page = parseInt(params.page || "1", 10);

  const [logsData, analytics] = await Promise.all([
    getUnifiedLogs({
      source,
      status,
      search: params.search,
      dateFilter,
      startDate: params.startDate,
      endDate: params.endDate,
      page,
      pageSize: 50,
    }),
    getLogAnalytics({
      dateFilter,
      startDate: params.startDate,
      endDate: params.endDate,
    }),
  ]);

  return (
    <LogsClient
      initialLogs={logsData.logs}
      totalCount={logsData.totalCount}
      currentPage={logsData.page}
      pageSize={logsData.pageSize}
      totalPages={logsData.totalPages}
      analytics={analytics}
      currentSource={source}
      currentStatus={status}
      currentSearch={params.search || ""}
      dateFilter={dateFilter}
      startDate={params.startDate}
      endDate={params.endDate}
    />
  );
}
