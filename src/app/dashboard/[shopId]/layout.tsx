import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function ShopLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ shopId: string }>;
}) {
  const { shopId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Verify shop belongs to authenticated user
  const { data: shop } = await supabase
    .from("shops")
    .select("id")
    .eq("id", shopId)
    .eq("user_id", user.id)
    .single();

  if (!shop) {
    redirect("/dashboard");
  }

  return <>{children}</>;
}
