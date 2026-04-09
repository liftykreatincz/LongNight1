"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { CreativeRow } from "./useCreativeAnalysis";

export interface CpaTargetResult {
  value: number;
  isFallback: boolean;
  source: "shop_setting" | "median" | "hardcoded";
}

const HARDCODED_FALLBACK = 300;

function medianCpa(creatives: CreativeRow[]): number | null {
  const values = creatives
    .filter((c) => c.purchases > 0 && c.costPerPurchase > 0)
    .map((c) => c.costPerPurchase)
    .sort((a, b) => a - b);
  if (values.length === 0) return null;
  const mid = Math.floor(values.length / 2);
  if (values.length % 2 === 0) {
    return (values[mid - 1] + values[mid]) / 2;
  }
  return values[mid];
}

export function useShopCpaTarget(
  shopId: string,
  creatives?: CreativeRow[]
): CpaTargetResult {
  const supabase = createClient();
  const { data: shop } = useQuery({
    queryKey: ["shop-cpa-target", shopId],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from("shops")
        .select("cpa_target_czk")
        .eq("id", shopId)
        .maybeSingle();
      return data;
    },
  });

  return useMemo<CpaTargetResult>(() => {
    const explicit = Number(shop?.cpa_target_czk);
    if (Number.isFinite(explicit) && explicit > 0) {
      return { value: explicit, isFallback: false, source: "shop_setting" };
    }
    const median = creatives ? medianCpa(creatives) : null;
    if (median !== null) {
      return { value: median, isFallback: true, source: "median" };
    }
    return {
      value: HARDCODED_FALLBACK,
      isFallback: true,
      source: "hardcoded",
    };
  }, [shop, creatives]);
}
