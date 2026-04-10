"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface DailyInsightRow {
  date: string;
  impressions: number;
  clicks: number;
  ctr: number;
  cpm: number;
  spend: number;
  frequency: number;
  purchases: number;
  link_clicks: number;
}

export function useDailyInsights(shopId: string, adId: string) {
  const supabase = createClient();

  return useQuery({
    queryKey: ["daily-insights", shopId, adId],
    enabled: !!shopId && !!adId,
    staleTime: 60_000,
    queryFn: async (): Promise<DailyInsightRow[]> => {
      const { data, error } = await supabase
        .from("meta_ad_creative_daily")
        .select("date,impressions,clicks,ctr,cpm,spend,frequency,purchases,link_clicks")
        .eq("shop_id", shopId)
        .eq("ad_id", adId)
        .order("date", { ascending: true });

      if (error) throw error;

      return (data ?? []).map((r: Record<string, unknown>) => ({
        date: r.date as string,
        impressions: Number(r.impressions),
        clicks: Number(r.clicks),
        ctr: Number(r.ctr),
        cpm: Number(r.cpm),
        spend: Number(r.spend),
        frequency: Number(r.frequency),
        purchases: Number(r.purchases),
        link_clicks: Number(r.link_clicks),
      }));
    },
  });
}
