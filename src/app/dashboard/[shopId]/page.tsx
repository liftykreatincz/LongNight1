import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ChevronRight, Sparkles } from "lucide-react";
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
    : "Nenastaveno";

  return (
    <div>
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-1.5 text-sm font-medium text-[#6e6e73]">
        <Link
          href="/dashboard"
          className="transition-colors hover:text-[#1d1d1f]"
        >
          Přehled
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-[#1d1d1f]">{shop.name}</span>
      </nav>

      {/* Shop header */}
      <div className="mb-10 flex items-center gap-4">
        <Link
          href="/dashboard"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-[#d2d2d7]/60 bg-white text-[#6e6e73] shadow-sm transition-all hover:border-[#d2d2d7] hover:text-[#1d1d1f]"
          aria-label="Zpět"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h2 className="text-4xl sm:text-5xl font-extrabold tracking-[-0.03em] text-[#1d1d1f] leading-none">
          {shop.name}
        </h2>
      </div>

      {/* Feature cards grid */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Analýza kreativ card */}
        <Link
          href={`/dashboard/${shop.id}/creatives`}
          className="group relative overflow-hidden rounded-2xl border border-[#d2d2d7]/60 bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-all duration-200 hover:border-[#0071e3]/40 hover:shadow-[0_8px_24px_rgba(0,113,227,0.08)]"
        >
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#0071e3]/10 transition-colors group-hover:bg-[#0071e3]/15">
                <Sparkles className="h-5 w-5 text-[#0071e3]" />
              </div>
              <div>
                <h3 className="text-lg font-bold tracking-tight text-[#1d1d1f]">
                  Analýza kreativ
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-[#6e6e73]">
                  Synchronizace a AI analýza reklamních kreativ z Meta Ads
                </p>
              </div>
            </div>
            <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-[#86868b] transition-all group-hover:translate-x-0.5 group-hover:text-[#0071e3]" />
          </div>
        </Link>
      </div>

      {/* Shop settings */}
      <div className="mt-14">
        <h3 className="mb-4 text-xs font-bold uppercase tracking-[0.1em] text-[#86868b]">
          Nastavení e-shopu
        </h3>
        <div className="overflow-hidden rounded-2xl border border-[#d2d2d7]/60 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)] divide-y divide-[#d2d2d7]/60">
          {/* Meta Account ID */}
          <div className="flex items-center justify-between px-5 py-4">
            <div>
              <p className="text-sm font-semibold text-[#1d1d1f]">
                Meta Ads Account ID
              </p>
              <p className="mt-0.5 text-xs text-[#6e6e73] font-mono">
                {maskedAccountId}
              </p>
            </div>
          </div>

          {/* Delete shop */}
          <div className="flex items-center justify-between px-5 py-4">
            <div>
              <p className="text-sm font-semibold text-red-600">
                Smazat e-shop
              </p>
              <p className="mt-0.5 text-xs text-[#6e6e73]">
                Trvale odstraní tento e-shop a všechna jeho data.
              </p>
            </div>
            <DeleteShopButton shopId={shop.id} shopName={shop.name} />
          </div>
        </div>
      </div>
    </div>
  );
}
