"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { CampaignType } from "@/lib/campaign-classifier";

export interface CreativeAnalysis {
  score: number;
  summary: string;
  visual_analysis: string;
  copy_analysis: string;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  vs_average: string;
  video_analysis?: {
    hook: string;
    pacing: string;
    speaker: string;
    subtitles: string;
    cta: string;
  };
}

export interface CreativeRow {
  adId: string;
  adName: string;
  campaignId: string;
  campaignName: string;
  adsetId: string;
  adsetName: string;
  status: string;
  thumbnailUrl: string | null;
  creativeType: string;
  videoUrl: string | null;
  body: string | null;
  dateStart: string | null;
  dateStop: string | null;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  purchases: number;
  costPerPurchase: number;
  roas: number;
  purchaseRevenue: number;
  addToCart: number;
  costPerAddToCart: number;
  initiateCheckout: number;
  linkClicks: number;
  landingPageViews: number;
  videoViews3s: number;
  videoThruplay: number;
  videoPlays: number;
  videoAvgWatchTime: number;
  frequency: number;
  likes: number;
  comments: number;
  shares: number;
  syncedAt: string;
  aiAnalysis: CreativeAnalysis | null;
  campaignType: CampaignType;
  campaignTypeSource: "auto" | "manual";
  videoDurationSeconds: number | null;
}

export function useCreativeAnalysis(shopId: string) {
  const supabase = createClient();

  return useQuery({
    queryKey: ["creative-analysis", shopId],
    retry: 1,
    staleTime: 60_000,
    queryFn: async (): Promise<CreativeRow[]> => {
      // Fetch creatives and campaigns in parallel — no FK in schema cache, so
      // we merge campaign_type client-side by campaign_id.
      const [creativesRes, campaignsRes] = await Promise.all([
        supabase
          .from("meta_ad_creatives")
          .select("*")
          .eq("shop_id", shopId)
          .order("spend", { ascending: false }),
        supabase
          .from("meta_ad_campaigns")
          .select("id, campaign_type, campaign_type_source")
          .eq("shop_id", shopId),
      ]);

      if (creativesRes.error) throw creativesRes.error;
      if (campaignsRes.error) throw campaignsRes.error;

      const campaignMap = new Map<
        string,
        { campaign_type?: string; campaign_type_source?: string }
      >();
      for (const c of campaignsRes.data ?? []) {
        campaignMap.set(c.id as string, {
          campaign_type: c.campaign_type as string | undefined,
          campaign_type_source: c.campaign_type_source as string | undefined,
        });
      }

      return (creativesRes.data ?? []).map((r: Record<string, unknown>) => {
        const campaignMeta = campaignMap.get((r.campaign_id as string) || "");
        return {
        adId: r.ad_id as string,
        adName: (r.ad_name as string) || "",
        campaignId: (r.campaign_id as string) || "",
        campaignName: (r.campaign_name as string) || "",
        adsetId: (r.adset_id as string) || "",
        adsetName: (r.adset_name as string) || "",
        status: (r.status as string) || "unknown",
        thumbnailUrl: r.thumbnail_url as string | null,
        creativeType: (r.creative_type as string) || "image",
        videoUrl: (r.video_url as string) || null,
        body: r.body as string | null,
        dateStart: r.date_start as string | null,
        dateStop: r.date_stop as string | null,
        spend: Number(r.spend),
        impressions: Number(r.impressions),
        reach: Number(r.reach),
        clicks: Number(r.clicks),
        ctr: Number(r.ctr),
        cpc: Number(r.cpc),
        cpm: Number(r.cpm),
        purchases: Number(r.purchases),
        costPerPurchase: Number(r.cost_per_purchase),
        roas: Number(r.roas),
        purchaseRevenue: Number(r.purchase_revenue ?? 0),
        addToCart: Number(r.add_to_cart),
        costPerAddToCart: Number(r.cost_per_add_to_cart),
        initiateCheckout: Number(r.initiate_checkout),
        linkClicks: Number(r.link_clicks ?? 0),
        landingPageViews: Number(r.landing_page_views ?? 0),
        videoViews3s: Number(r.video_views_3s),
        videoThruplay: Number(r.video_thruplay),
        videoPlays: Number(r.video_plays ?? 0),
        videoAvgWatchTime: Number(r.video_avg_watch_time ?? 0),
        frequency: Number(r.frequency ?? 0),
        likes: Number(r.likes),
        comments: Number(r.comments),
        shares: Number(r.shares),
        syncedAt: r.synced_at as string,
        aiAnalysis: r.ai_analysis
          ? typeof r.ai_analysis === "string"
            ? JSON.parse(r.ai_analysis)
            : (r.ai_analysis as CreativeAnalysis)
          : null,
        campaignType: (campaignMeta?.campaign_type ?? "unknown") as CampaignType,
        campaignTypeSource: (campaignMeta?.campaign_type_source ?? "auto") as
          | "auto"
          | "manual",
        videoDurationSeconds:
          r.video_duration_seconds != null
            ? Number(r.video_duration_seconds)
            : null,
        };
      });
    },
  });
}

export function useSyncCreatives(shopId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/creatives/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Sync failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["creative-analysis", shopId],
      });
    },
  });
}
