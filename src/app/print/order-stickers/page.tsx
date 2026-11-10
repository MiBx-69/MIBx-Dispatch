import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { OrderStickersPrintClient } from "./order-stickers-print-client";
import { verifyShopifySessionToken } from "@/lib/shopify-session-token";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

interface PrintOrderStickersPageProps {
  searchParams: Promise<{
    ids?: string;
    shopifyOrderIds?: string;
    shopify_order_ids?: string;
    token?: string;
    embedded?: string;
  }>;
}

export default async function PrintOrderStickersPage({ searchParams }: PrintOrderStickersPageProps) {
  const params = await searchParams;
  const rawIds = params.ids || params.shopifyOrderIds || params.shopify_order_ids;

  if (!rawIds) {
    return (
      <div className="p-8 text-center text-zinc-900 bg-white min-h-screen">
        <h1 className="text-2xl font-bold">No orders specified</h1>
        <p className="mt-2 text-zinc-600">Please provide comma-separated order IDs in the URL.</p>
      </div>
    );
  }

  const ids = rawIds
    .split(",")
    .map((id) => id.trim().replace(/^gid:\/\/shopify\/Order\//, ""))
    .filter((id) => id.length > 0);

  // Authentication check:
  // 1. Supabase User Cookie (Dashboard)
  // 2. Shopify Session Token (Native Shopify Extension)
  let isAuthenticated = false;

  const headerList = await headers();
  const authHeader = headerList.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const tokenToVerify = params.token || bearerToken;

  if (tokenToVerify) {
    const sessionPayload = await verifyShopifySessionToken(tokenToVerify);
    if (sessionPayload) {
      isAuthenticated = true;
    }
  }

  if (!isAuthenticated) {
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        isAuthenticated = true;
      }
    } catch {
      // ignore
    }
  }

  // If in Shopify embedded context or token is present, don't hard-redirect to login
  if (!isAuthenticated) {
    if (params.embedded || params.token) {
      return (
        <div className="p-6 text-center text-zinc-900 bg-white min-h-screen flex flex-col items-center justify-center">
          <div className="max-w-md p-4 border border-rose-200 rounded-xl bg-rose-50 text-rose-800 text-xs">
            <h2 className="font-bold text-sm mb-1">Shopify Authentication Required</h2>
            <p>Please launch the print action from the official Shopify Admin Print menu.</p>
          </div>
        </div>
      );
    }
    redirect("/login");
  }

  const isEmbedded = params.embedded === "true" || params.embedded === "1";

  return (
    <OrderStickersPrintClient
      orderIds={ids}
      isEmbedded={isEmbedded}
      authToken={tokenToVerify || undefined}
    />
  );
}
