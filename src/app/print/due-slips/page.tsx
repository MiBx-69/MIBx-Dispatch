import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DueSlipsPrintClient } from "./due-slips-print-client";

export const dynamic = "force-dynamic";

interface PrintDueSlipsPageProps {
  searchParams: Promise<{
    ids?: string;
    width?: string;
    height?: string;
    unit?: string;
  }>;
}

export default async function PrintDueSlipsPage({ searchParams }: PrintDueSlipsPageProps) {
  const params = await searchParams;
  const idsParam = params.ids;

  if (!idsParam) {
    return (
      <div className="p-8 text-center text-zinc-900 bg-white min-h-screen">
        <h1 className="text-2xl font-bold">No orders specified</h1>
        <p className="mt-2 text-zinc-600">Please provide comma-separated order IDs in the URL.</p>
      </div>
    );
  }

  const ids = idsParam.split(",").map((id) => id.trim()).filter((id) => id.length > 0);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const width = parseFloat(params.width || "1.49") || 1.49;
  const height = parseFloat(params.height || "0.98") || 0.98;
  const unit = params.unit === "mm" ? "mm" : "in";

  return (
    <DueSlipsPrintClient
      orderIds={ids}
      initialWidth={width}
      initialHeight={height}
      initialUnit={unit}
    />
  );
}

