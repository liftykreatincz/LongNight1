"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface Shop {
  id: string;
  name: string;
  cpa_target_czk: number | null;
}

interface Props {
  shops: Shop[];
}

export function CreativeScoringSettings({ shops }: Props) {
  const initialShopId = shops[0]?.id ?? "";
  const initialShop = shops.find((s) => s.id === initialShopId);
  const initialValue =
    initialShop?.cpa_target_czk != null
      ? String(initialShop.cpa_target_czk)
      : "";

  const [selectedShopId, setSelectedShopId] = useState<string>(initialShopId);
  const [value, setValue] = useState<string>(initialValue);
  const [lastShopId, setLastShopId] = useState<string>(initialShopId);
  const [saving, setSaving] = useState(false);

  const selected = shops.find((s) => s.id === selectedShopId);

  // Reset form value when the user switches to a different shop
  // (React-recommended pattern: state derived from props without useEffect).
  if (selectedShopId !== lastShopId) {
    setLastShopId(selectedShopId);
    setValue(
      selected?.cpa_target_czk != null ? String(selected.cpa_target_czk) : ""
    );
  }

  async function save() {
    if (!selected) return;
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) {
      toast.error("Zadej kladné číslo");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("shops")
      .update({ cpa_target_czk: num })
      .eq("id", selected.id);
    setSaving(false);
    if (error) {
      toast.error(`Chyba: ${error.message}`);
      return;
    }
    toast.success("CPA target uložen");
  }

  if (shops.length === 0) {
    return (
      <p className="text-sm text-[#6e6e73]">
        Žádné shopy — nejdřív přidej shop.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-semibold text-[#1d1d1f]">Shop</label>
        <select
          value={selectedShopId}
          onChange={(e) => setSelectedShopId(e.target.value)}
          className="mt-1 w-full rounded-md border border-[#d2d2d7] px-3 py-2 text-sm"
        >
          {shops.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-xs font-semibold text-[#1d1d1f]">
          CPA target (Kč)
        </label>
        <input
          type="number"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="např. 300"
          className="mt-1 w-full rounded-md border border-[#d2d2d7] px-3 py-2 text-sm"
        />
        <p className="mt-1 text-[11px] text-[#6e6e73]">
          Primární KPI. Používá se pro filtr „kreativa má dost dat“ (spend ≥ 2×
          CPA target) a pro výpočet Engagement Score.
        </p>
      </div>
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="inline-flex items-center gap-1.5 rounded-full bg-[#0071e3] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0077ed] disabled:opacity-50"
      >
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        Uložit
      </button>
    </div>
  );
}
