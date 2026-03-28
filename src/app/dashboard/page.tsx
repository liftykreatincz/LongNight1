import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Store, Plus, ArrowRight } from "lucide-react";
import { AddShopDialog } from "@/components/add-shop-dialog";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: shops } = await supabase
    .from("shops")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const hasShops = shops && shops.length > 0;

  return (
    <div>
      {/* Page header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">
            Your Shops
          </h2>
          <p className="mt-1 text-sm text-white/40">
            Manage your eshops and Meta Ads integrations
          </p>
        </div>
        <AddShopDialog>
          <button className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-blue-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition-all hover:shadow-blue-500/40 hover:brightness-110">
            <Plus className="h-4 w-4" />
            Add Eshop
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
              className="group relative rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 transition-all hover:border-blue-500/30 hover:bg-white/[0.04] hover:shadow-lg hover:shadow-blue-500/5"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
                    <Store className="h-5 w-5 text-blue-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white group-hover:text-blue-100">
                      {shop.name}
                    </h3>
                    <p className="mt-0.5 text-xs text-white/30">
                      Added{" "}
                      {new Date(shop.created_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-white/20 transition-all group-hover:translate-x-0.5 group-hover:text-blue-400" />
              </div>
            </Link>
          ))}
        </div>
      ) : (
        /* Empty state */
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.01] py-20">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-500/10">
            <Store className="h-8 w-8 text-blue-400/60" />
          </div>
          <h3 className="mt-5 text-lg font-semibold text-white/70">
            No shops yet
          </h3>
          <p className="mt-1.5 max-w-sm text-center text-sm text-white/30">
            Add your first eshop to start analyzing Meta Ads creative
            performance.
          </p>
          <AddShopDialog>
            <button className="mt-6 flex items-center gap-2 rounded-lg bg-gradient-to-r from-green-600 to-green-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-green-600/20 transition-all hover:shadow-green-500/40 hover:brightness-110">
              <Plus className="h-4 w-4" />
              Add your first shop
            </button>
          </AddShopDialog>
        </div>
      )}
    </div>
  );
}
