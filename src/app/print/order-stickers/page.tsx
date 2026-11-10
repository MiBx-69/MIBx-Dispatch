import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { OrderStickersPrintClient } from "./order-stickers-print-client";
import { verifyShopifySessionToken } from "@/lib/shopify-session-token";
import { fetchOrderStickersData } from "@/lib/order-sticker-service";
import type { OrderStickerData } from "@/types/order-sticker";
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

  const isEmbedded = params.embedded === "true" || params.embedded === "1";

  // If not authenticated and not embedded in Shopify Admin, redirect to login
  if (!isAuthenticated && !isEmbedded) {
    redirect("/login");
  }

  // Pre-fetch sticker data on the server for instant SSR rendering (no loading delay!)
  let initialStickers: OrderStickerData[] = [];
  try {
    const stickerResult = await fetchOrderStickersData(ids);
    if (stickerResult.success && stickerResult.stickers) {
      initialStickers = stickerResult.stickers;
    }
  } catch (fetchErr) {
    console.warn("[PrintOrderStickersPage] Server prefetch warning:", fetchErr);
  }

  return (
    <OrderStickersPrintClient
      orderIds={ids}
      isEmbedded={isEmbedded}
      authToken={tokenToVerify || undefined}
      initialStickers={initialStickers}
    />
  );
}
