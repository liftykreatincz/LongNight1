"use client";

import { useState } from "react";
import { Settings2, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

interface Props {
  shopId: string;
  currentValue: number;
  isFallback: boolean;
}

export function CpaTargetPopover({ shopId, currentValue, isFallback }: Props) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(String(Math.round(currentValue)));
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();

  async function save() {
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
      .eq("id", shopId);
    setSaving(false);
    if (error) {
      toast.error(`Chyba: ${error.message}`);
      return;
    }
    qc.invalidateQueries({ queryKey: ["shop-cpa-target", shopId] });
    toast.success("CPA target uložen");
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-full border border-[#d2d2d7] bg-white px-3 py-1.5 text-xs font-medium text-[#1d1d1f] hover:bg-[#f5f5f7]"
        title="Nastavení CPA targetu"
      >
        <Settings2 className="h-3.5 w-3.5" />
        CPA {Math.round(currentValue)} Kč
        {isFallback && (
          <span className="text-[10px] text-amber-700">(auto)</span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 z-30 w-72 rounded-xl border border-[#d2d2d7] bg-white p-4 shadow-lg">
          <p className="text-xs font-semibold text-[#1d1d1f] mb-2">
            CPA target (Kč)
          </p>
          <p className="text-[11px] text-[#6e6e73] mb-3">
            Filtr „dost dat“ vyžaduje spend ≥ 2× této hodnoty nebo ≥ 3
            konverze.
          </p>
          <input
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full rounded-md border border-[#d2d2d7] px-3 py-1.5 text-sm"
            disabled={saving}
          />
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="flex-1 inline-flex items-center justify-center gap-1 rounded-full bg-[#0071e3] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0077ed] disabled:opacity-50"
            >
              {saving && <Loader2 className="h-3 w-3 animate-spin" />}
              Uložit
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full border border-[#d2d2d7] bg-white px-3 py-1.5 text-xs font-medium text-[#6e6e73] hover:bg-[#f5f5f7]"
            >
              Zavřít
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
