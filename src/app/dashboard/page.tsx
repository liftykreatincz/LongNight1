import { getCurrentUser, getUserShops } from "@/lib/supabase/queries";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Store, Plus, ArrowRight } from "lucide-react";
import { AddShopDialog } from "@/components/add-shop-dialog";

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const shops = await getUserShops();
  const hasShops = shops.length > 0;

  return (
    <div>
      {/* Page header */}
      <div className="mb-10 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-4xl sm:text-5xl font-extrabold tracking-[-0.03em] text-[#1d1d1f] leading-none">
            Vaše e-shopy
          </h2>
          <p className="mt-3 text-base sm:text-lg text-[#6e6e73] font-medium">
            Spravujte své e-shopy a napojení na Meta Ads.
          </p>
        </div>
        <AddShopDialog>
          <button className="flex items-center gap-2 rounded-full bg-[#0071e3] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#0077ed] active:bg-[#006edb]">
            <Plus className="h-4 w-4" />
            Přidat e-shop
          </button>
        </AddShopDialog>
      </div>

      {hasShops ? (
        /* Shop grid */
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shops.map((shop) => (
            <Link
              key={shop.id}
              href={`/dashboard/${shop.id}`}
              className="group relative rounded-2xl border border-[#d2d2d7]/60 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-all hover:border-[#0071e3]/40 hover:shadow-[0_4px_16px_rgba(0,113,227,0.08)]"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#0071e3]/10">
                    <Store className="h-5 w-5 text-[#0071e3]" />
                  </div>
                  <div>
                    <h3 className="font-bold text-[#1d1d1f] tracking-tight">
                      {shop.name}
                    </h3>
                    <p className="mt-0.5 text-xs font-medium text-[#86868b]">
                      Přidáno{" "}
                      {new Date(shop.created_at).toLocaleDateString("cs-CZ", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-[#86868b] transition-all group-hover:translate-x-0.5 group-hover:text-[#0071e3]" />
              </div>
            </Link>
          ))}
        </div>
      ) : (
        /* Empty state */
        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-[#d2d2d7] bg-white/60 py-24">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#0071e3]/10">
            <Store className="h-8 w-8 text-[#0071e3]" />
          </div>
          <h3 className="mt-6 text-2xl font-bold tracking-tight text-[#1d1d1f]">
            Zatím žádné e-shopy
          </h3>
          <p className="mt-2 max-w-sm text-center text-base text-[#6e6e73]">
            Přidejte svůj první e-shop a začněte analyzovat výkon kreativ z Meta
            Ads.
          </p>
          <AddShopDialog>
            <button className="mt-7 flex items-center gap-2 rounded-full bg-[#0071e3] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#0077ed] active:bg-[#006edb]">
              <Plus className="h-4 w-4" />
              Přidejte svůj první e-shop
            </button>
          </AddShopDialog>
        </div>
      )}
    </div>
  );
}
