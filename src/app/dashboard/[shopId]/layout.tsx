import { redirect } from "next/navigation";
import { getCurrentUser, getShopById } from "@/lib/supabase/queries";

export default async function ShopLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ shopId: string }>;
}) {
  const { shopId } = await params;
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  // Verify shop belongs to authenticated user. Cached: child pages
  // requesting the same shop reuse this fetch without a new round trip.
  const shop = await getShopById(shopId);

  if (!shop) {
    redirect("/dashboard");
  }

  return <>{children}</>;
}
