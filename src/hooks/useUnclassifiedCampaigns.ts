"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export function useUnclassifiedCampaigns(shopId: string) {
  return useQuery({
    queryKey: ["unclassified-campaigns", shopId],
    queryFn: async () => {
      const supabase = createClient();
      const { count } = await supabase
        .from("meta_ad_campaigns")
        .select("*", { count: "exact", head: true })
        .eq("shop_id", shopId)
        .eq("campaign_type", "unknown");
      return count ?? 0;
    },
    staleTime: 5 * 60 * 1000,
  });
}
