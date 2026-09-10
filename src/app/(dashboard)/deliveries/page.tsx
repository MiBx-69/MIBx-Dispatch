import { redirect } from "next/navigation";

export default async function DeliveriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams(params);
  query.set("status", "delivered");
  redirect(`/orders?${query.toString()}`);
}
