import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ChevronRight, Sparkles, Trash2 } from "lucide-react";
import { DeleteShopButton } from "./delete-shop-button";

export default async function ShopDetailPage({
  params,
}: {
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

  const { data: shop } = await supabase
    .from("shops")
    .select("*")
    .eq("id", shopId)
    .eq("user_id", user.id)
    .single();

  if (!shop) {
    redirect("/dashboard");
  }

  // Mask the meta account ID for display
  const maskedAccountId = shop.meta_account_id
    ? `${shop.meta_account_id.slice(0, 4)}...${shop.meta_account_id.slice(-4)}`
    : "Not set";

  return (
    <div>
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-1.5 text-sm text-white/40">
        <Link
          href="/dashboard"
          className="transition-colors hover:text-white/70"
        >
          Dashboard
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-white/70">{shop.name}</span>
      </nav>

      {/* Shop header */}
      <div className="mb-8 flex items-center gap-4">
        <Link
          href="/dashboard"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.02] text-white/40 transition-all hover:border-white/[0.12] hover:bg-white/[0.05] hover:text-white/70"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h2 className="text-2xl font-bold tracking-tight text-white">
          {shop.name}
        </h2>
      </div>

      {/* Feature cards grid */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Analyza kreativ card */}
        <Link
          href={`/dashboard/${shop.id}/creatives`}
          className="group relative overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02] p-6 transition-all duration-200 hover:border-blue-500/30 hover:bg-white/[0.04] hover:shadow-lg hover:shadow-blue-500/5 hover:scale-[1.01]"
        >
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 transition-colors group-hover:bg-blue-500/20">
                <Sparkles className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <h3 className="font-semibold text-white group-hover:text-blue-100">
                  Analyza kreativ
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-white/35 group-hover:text-white/50">
                  Synchronizace a AI analyza reklamnich kreativ z Meta Ads
                </p>
              </div>
            </div>
            <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-white/20 transition-all group-hover:translate-x-0.5 group-hover:text-blue-400" />
          </div>
        </Link>
      </div>

      {/* Shop settings */}
      <div className="mt-12">
        <h3 className="mb-4 text-sm font-medium uppercase tracking-wider text-white/30">
          Shop Settings
        </h3>
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] divide-y divide-white/[0.06]">
          {/* Meta Account ID */}
          <div className="flex items-center justify-between px-5 py-4">
            <div>
              <p className="text-sm font-medium text-white/70">
                Meta Account ID
              </p>
              <p className="mt-0.5 text-xs text-white/30 font-mono">
                {maskedAccountId}
              </p>
            </div>
          </div>

          {/* Delete shop */}
          <div className="flex items-center justify-between px-5 py-4">
            <div>
              <p className="text-sm font-medium text-red-400/80">
                Delete shop
              </p>
              <p className="mt-0.5 text-xs text-white/30">
                Permanently remove this shop and all its data
              </p>
            </div>
            <DeleteShopButton shopId={shop.id} shopName={shop.name} />
          </div>
        </div>
      </div>
    </div>
  );
}
