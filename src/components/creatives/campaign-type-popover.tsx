"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import type { CampaignType } from "@/lib/campaign-classifier";
import { CampaignTypeBadge } from "./campaign-type-badge";

interface Props {
  campaignId: string;
  shopId: string;
  currentType: CampaignType;
  currentSource: "auto" | "manual";
  classifiedAt?: string | null;
}

const TYPES: CampaignType[] = ["evergreen", "sale", "seasonal", "unknown"];

export function CampaignTypePopover({
  campaignId,
  shopId,
  currentType,
  currentSource,
  classifiedAt,
}: Props) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<CampaignType>(currentType);
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();

  async function save() {
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("meta_ad_campaigns")
      .update({
        campaign_type: selected,
        campaign_type_source: "manual",
        campaign_type_classified_at: new Date().toISOString(),
      })
      .eq("id", campaignId);
    setSaving(false);
    if (error) {
      toast.error(`Chyba: ${error.message}`);
      return;
    }
    toast.success("Typ kampaně uložen");
    qc.invalidateQueries({ queryKey: ["creative-analysis", shopId] });
    qc.invalidateQueries({ queryKey: ["shop-benchmarks", shopId] });
    qc.invalidateQueries({ queryKey: ["unclassified-campaigns", shopId] });
    setOpen(false);
  }

  return (
    <div className="relative inline-block">
      <CampaignTypeBadge
        type={currentType}
        source={currentSource}
        onClick={() => setOpen((o) => !o)}
      />
      {open && (
        <div className="absolute left-0 top-full mt-1 z-30 w-60 rounded-xl border border-[#d2d2d7] bg-white p-3 shadow-lg">
          <p className="text-[11px] text-[#6e6e73] mb-2">
            {currentSource === "manual"
              ? `Manuálně${classifiedAt ? " " + new Date(classifiedAt).toLocaleDateString("cs-CZ") : ""}`
              : "Auto-klasifikováno"}
          </p>
          <div className="space-y-1">
            {TYPES.map((t) => (
              <label
                key={t}
                className="flex items-center gap-2 text-xs cursor-pointer"
              >
                <input
                  type="radio"
                  name={`ct-${campaignId}`}
                  checked={selected === t}
                  onChange={() => setSelected(t)}
                />
                <CampaignTypeBadge type={t} source="auto" />
              </label>
            ))}
          </div>
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="flex-1 rounded-full bg-[#0071e3] px-3 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
            >
              Uložit
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full border border-[#d2d2d7] px-3 py-1 text-[11px] text-[#6e6e73]"
            >
              Zavřít
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
