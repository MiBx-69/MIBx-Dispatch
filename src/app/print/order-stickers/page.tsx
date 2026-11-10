import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { OrderStickersPrintClient } from "./order-stickers-print-client";

export const dynamic = "force-dynamic";

interface PrintOrderStickersPageProps {
  searchParams: Promise<{
    ids?: string;
  }>;
}

export default async function PrintOrderStickersPage({ searchParams }: PrintOrderStickersPageProps) {
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

  return <OrderStickersPrintClient orderIds={ids} />;
}

