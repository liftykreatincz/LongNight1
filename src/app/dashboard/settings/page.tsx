import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/queries";
import { SettingsForm } from "./settings-form";
import { CreativeScoringSettings } from "./creative-scoring-settings";

interface Shop {
  id: string;
  name: string;
  cpa_target_czk: number | null;
}

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const supabase = await createClient();
  const { data: settings } = await supabase
    .from("user_settings")
    .select("anthropic_api_key")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: shops } = await supabase
    .from("shops")
    .select("id, name, cpa_target_czk")
    .eq("user_id", user.id)
    .order("name");

  const existingKey =
    typeof settings?.anthropic_api_key === "string"
      ? settings.anthropic_api_key
      : "";
  const hasExistingKey = existingKey.length > 0;

  return (
    <div className="mx-auto max-w-3xl">
      {/* Page header */}
      <div className="mb-10">
        <h2 className="text-4xl font-extrabold leading-none tracking-[-0.03em] text-[#1d1d1f] sm:text-5xl">
          Nastavení
        </h2>
        <p className="mt-3 text-base font-medium text-[#6e6e73] sm:text-lg">
          Spravujte své API klíče a předvolby aplikace.
        </p>
      </div>

      {/* API keys card */}
      <section className="rounded-2xl border border-[#d2d2d7]/60 bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.03)] sm:p-8">
        <div className="mb-6">
          <h3 className="text-xl font-bold tracking-tight text-[#1d1d1f]">
            API klíče
          </h3>
          <p className="mt-1 text-sm text-[#6e6e73]">
            Klíče potřebné pro externí služby.
          </p>
        </div>
        <SettingsForm initialKey="" hasExistingKey={hasExistingKey} />
      </section>

      {/* Engagement Score settings */}
      <section className="mt-6 rounded-2xl border border-[#d2d2d7]/60 bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.03)] sm:p-8">
        <div className="mb-6">
          <h3 className="text-xl font-bold tracking-tight text-[#1d1d1f]">
            Engagement Score
          </h3>
          <p className="mt-1 text-sm text-[#6e6e73]">
            CPA target per shop pro výpočet skóre a filtr zařazení kreativ.
          </p>
        </div>
        <CreativeScoringSettings shops={(shops ?? []) as Shop[]} />
      </section>
    </div>
  );
}
