import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getActionValue,
  getCostPerAction,
  getActionRevenue,
  delay,
} from "@/lib/meta-api";
import { classifyCampaign, type CampaignType } from "@/lib/campaign-classifier";
import { computeFatigue } from "@/lib/fatigue/compute";
import type { DailyRow } from "@/lib/fatigue/types";
import { computeAlerts } from "@/lib/alerts/compute";
import type { AlertInput } from "@/lib/alerts/types";

const META_API_VERSION = "v21.0";
const META_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

interface MetaAd {
  id: string;
  name: string;
  status: string;
  creative?: {
    id?: string;
    thumbnail_url?: string;
    object_story_spec?: {
      video_data?: { video_id?: string };
    };
  };
  adset?: { id: string; name: string };
  campaign?: { id: string; name: string };
}

interface MetaCampaign {
  id: string;
  name: string;
  status?: string;
  start_time?: string;
  stop_time?: string;
}

interface MetaInsight {
  ad_id: string;
  ad_name: string;
  spend: string;
  impressions: string;
  reach: string;
  clicks: string;
  ctr: string;
  cpc: string;
  cpm: string;
  actions?: { action_type: string; value: string }[];
  cost_per_action_type?: { action_type: string; value: string }[];
  action_values?: { action_type: string; value: string }[];
  frequency?: string;
  video_play_actions?: { action_type: string; value: string }[];
  video_avg_time_watched_actions?: { action_type: string; value: string }[];
  date_start: string;
  date_stop: string;
}

interface MetaDailyInsight {
  ad_id: string;
  date_start: string;
  date_stop: string;
  spend: string;
  impressions: string;
  clicks: string;
  ctr: string;
  cpm: string;
  frequency?: string;
  actions?: { action_type: string; value: string }[];
}

function getVideoAvgWatchSeconds(
  videoAvgTimeWatched: Array<{ action_type: string; value: string }> | undefined
): number {
  if (!videoAvgTimeWatched) return 0;
  // Use the main video_view action type
  const entry = videoAvgTimeWatched.find((a) => a.action_type === "video_view");
  return entry ? parseFloat(entry.value) || 0 : 0;
}

function getVideoPlays(
  videoPlayActions: Array<{ action_type: string; value: string }> | undefined
): number {
  if (!videoPlayActions) return 0;
  // Sum all video play action entries; Meta splits by platform
  return videoPlayActions.reduce((sum, a) => sum + (parseFloat(a.value) || 0), 0);
}

interface MetaPaginatedResponse<T> {
  data: T[];
  paging?: { next?: string };
}

async function fetchVideoDuration(
  adCreativeId: string,
  accessToken: string
): Promise<number | null> {
  try {
    const creativeRes = await fetch(
      `${META_BASE}/${adCreativeId}?fields=video_id&access_token=${encodeURIComponent(accessToken)}`
    );
    if (!creativeRes.ok) return null;
    const creative = (await creativeRes.json()) as { video_id?: string };
    const videoId = creative.video_id;
    if (!videoId) return null;

    const videoRes = await fetch(
      `${META_BASE}/${videoId}?fields=length&access_token=${encodeURIComponent(accessToken)}`
    );
    if (!videoRes.ok) return null;
    const video = (await videoRes.json()) as { length?: number | string };
    const len = Number(video.length);
    return Number.isFinite(len) && len > 0 ? len : null;
  } catch {
    return null;
  }
}

async function fetchAllPages<T>(url: string): Promise<T[]> {
  const results: T[] = [];
  let nextUrl: string | undefined = url;

  while (nextUrl) {
    const res = await fetch(nextUrl);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(
        `Meta API error ${res.status}: ${JSON.stringify(err)}`
      );
    }
    const json: MetaPaginatedResponse<T> = await res.json();
    results.push(...json.data);
    nextUrl = json.paging?.next;
  }

  return results;
}

async function fetchAllPagesWithDelay<T>(
  url: string,
  delayMs: number
): Promise<T[]> {
  const results: T[] = [];
  let nextUrl: string | undefined = url;

  while (nextUrl) {
    const res = await fetch(nextUrl);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(
        `Meta API error ${res.status}: ${JSON.stringify(err)}`
      );
    }
    const json: MetaPaginatedResponse<T> = await res.json();
    results.push(...json.data);
    nextUrl = json.paging?.next;
    if (nextUrl) await delay(delayMs);
  }

  return results;
}

export async function POST(request: Request) {
  try {
    // Auth
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Parse body
    const body = await request.json().catch(() => null);
    const shopId = body?.shopId;
    if (!shopId) {
      return NextResponse.json(
        { error: "Missing shopId" },
        { status: 400 }
      );
    }

    // Get shop + Meta credentials
    const { data: shop, error: shopError } = await supabase
      .from("shops")
      .select("id, meta_token, meta_account_id")
      .eq("id", shopId)
      .eq("user_id", user.id)
      .single();

    if (shopError || !shop) {
      return NextResponse.json(
        { error: "Shop not found or access denied" },
        { status: 400 }
      );
    }

    const token = shop.meta_token;
    const rawAccountId = shop.meta_account_id;

    if (!token || !rawAccountId) {
      return NextResponse.json(
        { error: "Meta credentials not configured for this shop" },
        { status: 400 }
      );
    }

    // Ensure act_ prefix
    const accountId = rawAccountId.startsWith("act_")
      ? rawAccountId
      : `act_${rawAccountId}`;

    // Step 1 — Fetch ALL ads with pagination
    const adsUrl = `${META_BASE}/${accountId}/ads?fields=name,status,creative{id,thumbnail_url,object_story_spec},adset{id,name},campaign{id,name}&limit=500&access_token=${token}`;

    let allAds: MetaAd[];
    try {
      allAds = await fetchAllPages<MetaAd>(adsUrl);
    } catch (e) {
      return NextResponse.json(
        { error: `Failed to fetch ads: ${(e as Error).message}` },
        { status: 502 }
      );
    }

    // Step 1b — Fetch ALL campaigns with pagination and classify them
    const campaignsUrl = `${META_BASE}/${accountId}/campaigns?fields=name,status,start_time,stop_time&limit=500&access_token=${token}`;

    let allCampaigns: MetaCampaign[];
    try {
      allCampaigns = await fetchAllPages<MetaCampaign>(campaignsUrl);
    } catch (e) {
      return NextResponse.json(
        { error: `Failed to fetch campaigns: ${(e as Error).message}` },
        { status: 502 }
      );
    }

    for (const metaCampaign of allCampaigns) {
      const { data: existingCampaign } = await supabase
        .from("meta_ad_campaigns")
        .select("campaign_type, campaign_type_source")
        .eq("id", metaCampaign.id)
        .maybeSingle();

      const isManual = existingCampaign?.campaign_type_source === "manual";

      const basePayload: {
        id: string;
        shop_id: string;
        name: string;
        status: string | null;
        start_time: string | null;
        stop_time: string | null;
      } = {
        id: metaCampaign.id,
        shop_id: shopId,
        name: metaCampaign.name ?? "",
        status: metaCampaign.status ?? null,
        start_time: metaCampaign.start_time ?? null,
        stop_time: metaCampaign.stop_time ?? null,
      };

      let upsertPayload:
        | typeof basePayload
        | (typeof basePayload & {
            campaign_type: CampaignType;
            campaign_type_source: "auto" | "manual";
            campaign_type_classified_at: string;
          });

      if (isManual) {
        // Preserve existing manual override — do not touch classification fields.
        upsertPayload = basePayload;
      } else {
        const result = classifyCampaign({
          name: metaCampaign.name ?? "",
          started_at: metaCampaign.start_time
            ? new Date(metaCampaign.start_time)
            : null,
          ended_at: metaCampaign.stop_time
            ? new Date(metaCampaign.stop_time)
            : null,
        });
        upsertPayload = {
          ...basePayload,
          campaign_type: result.type,
          campaign_type_source: "auto",
          campaign_type_classified_at: new Date().toISOString(),
        };
      }

      const { error: campaignUpsertError } = await supabase
        .from("meta_ad_campaigns")
        .upsert(upsertPayload, { onConflict: "id" });

      if (campaignUpsertError) {
        return NextResponse.json(
          {
            error: `Campaign upsert failed: ${campaignUpsertError.message}`,
          },
          { status: 500 }
        );
      }
    }

    // Step 2 — Fetch ALL ad insights with pagination (36-month window)
    const now = new Date();
    const sinceDate = new Date(
      now.getFullYear() - 3,
      now.getMonth(),
      now.getDate()
    );
    const since = sinceDate.toISOString().split("T")[0];
    const until = now.toISOString().split("T")[0];
    const timeRange = JSON.stringify({ since, until });

    const insightsUrl = `${META_BASE}/${accountId}/insights?level=ad&time_range=${encodeURIComponent(timeRange)}&fields=ad_id,ad_name,spend,impressions,reach,clicks,ctr,cpc,cpm,actions,cost_per_action_type,action_values,frequency,video_play_actions,video_avg_time_watched_actions,date_start,date_stop&limit=500&access_token=${token}`;

    let allInsights: MetaInsight[];
    try {
      allInsights = await fetchAllPagesWithDelay<MetaInsight>(insightsUrl, 100);
    } catch (e) {
      return NextResponse.json(
        { error: `Failed to fetch insights: ${(e as Error).message}` },
        { status: 502 }
      );
    }

    // Build insights lookup by ad_id
    const insightsMap = new Map<string, MetaInsight>();
    for (const insight of allInsights) {
      insightsMap.set(insight.ad_id, insight);
    }

    // Step 2b — Fetch daily insights for fatigue (30-day window)
    const dailySince = new Date();
    dailySince.setDate(dailySince.getDate() - 30);
    const dailyTimeRange = JSON.stringify({
      since: dailySince.toISOString().split("T")[0],
      until: now.toISOString().split("T")[0],
    });

    const dailyInsightsUrl = `${META_BASE}/${accountId}/insights?level=ad&time_increment=1&time_range=${encodeURIComponent(dailyTimeRange)}&fields=ad_id,date_start,date_stop,spend,impressions,clicks,ctr,cpm,frequency,actions&limit=500&access_token=${token}`;

    let dailyInsights: MetaDailyInsight[] = [];
    try {
      dailyInsights = await fetchAllPagesWithDelay<MetaDailyInsight>(dailyInsightsUrl, 100);
    } catch {
      // Non-fatal — fatigue will be null if daily data fails
    }

    // Group daily insights by ad_id
    const dailyByAd = new Map<string, MetaDailyInsight[]>();
    for (const d of dailyInsights) {
      const arr = dailyByAd.get(d.ad_id) || [];
      arr.push(d);
      dailyByAd.set(d.ad_id, arr);
    }

    // Step 3 — Fetch video source URLs
    const videoIds: string[] = [];
    for (const ad of allAds) {
      const videoId =
        ad.creative?.object_story_spec?.video_data?.video_id;
      if (videoId) videoIds.push(videoId);
    }

    const videoSourceMap = new Map<string, string>();
    const uniqueVideoIds = [...new Set(videoIds)];

    for (let i = 0; i < uniqueVideoIds.length; i += 50) {
      const batch = uniqueVideoIds.slice(i, i + 50).join(",");
      const videoUrl = `${META_BASE}/?ids=${batch}&fields=source&access_token=${token}`;

      try {
        const res = await fetch(videoUrl);
        if (res.ok) {
          const json = await res.json();
          for (const [id, data] of Object.entries(json)) {
            const videoData = data as { source?: string };
            if (videoData.source) {
              videoSourceMap.set(id, videoData.source);
            }
          }
        }
      } catch {
        // Non-fatal — continue without video sources for this batch
      }

      if (i + 50 < uniqueVideoIds.length) await delay(100);
    }

    // Step 4 — Merge and upsert
    const rows = await Promise.all(
      allAds.map(async (ad) => {
      const insight = insightsMap.get(ad.id);
      const actions = insight?.actions;
      const costPerActions = insight?.cost_per_action_type;
      const actionValues = insight?.action_values;
      const spend = insight ? parseFloat(insight.spend) || 0 : 0;

      const purchases = getActionValue(
        actions,
        "offsite_conversion.fb_pixel_purchase"
      );
      const addToCart = getActionValue(
        actions,
        "offsite_conversion.fb_pixel_add_to_cart"
      );
      const initiateCheckout = getActionValue(
        actions,
        "offsite_conversion.fb_pixel_initiate_checkout"
      );
      const likes = getActionValue(actions, "post_reaction");
      const comments = getActionValue(actions, "comment");
      const shares = getActionValue(actions, "post");

      const costPerPurchaseFromApi = getCostPerAction(
        costPerActions,
        "offsite_conversion.fb_pixel_purchase"
      );
      const costPerPurchase =
        costPerPurchaseFromApi > 0
          ? costPerPurchaseFromApi
          : purchases > 0
            ? spend / purchases
            : 0;

      const costPerAddToCartFromApi = getCostPerAction(
        costPerActions,
        "offsite_conversion.fb_pixel_add_to_cart"
      );
      const costPerAddToCart =
        costPerAddToCartFromApi > 0
          ? costPerAddToCartFromApi
          : addToCart > 0
            ? spend / addToCart
            : 0;

      const purchaseRevenue = getActionRevenue(
        actionValues,
        "offsite_conversion.fb_pixel_purchase"
      );
      const roas = spend > 0 ? purchaseRevenue / spend : 0;

      const videoViews3s = getActionValue(actions, "video_view");
      const videoThruplay = getActionValue(actions, "video_play");

      const linkClicks = getActionValue(actions, "link_click");
      const landingPageViews = getActionValue(actions, "landing_page_view");

      const videoId =
        ad.creative?.object_story_spec?.video_data?.video_id;
      const videoUrl = videoId
        ? videoSourceMap.get(videoId) ?? null
        : null;

      // P2-7: fetch video length from Graph API for video creatives. Non-fatal.
      let videoDurationSeconds: number | null = null;
      const adCreativeId = ad.creative?.id;
      if (videoId && adCreativeId) {
        videoDurationSeconds = await fetchVideoDuration(adCreativeId, token);
      }

      return {
        shop_id: shopId,
        ad_id: ad.id,
        ad_name: ad.name,
        status: ad.status,
        creative_type: videoId ? "video" : "image",
        campaign_id: ad.campaign?.id ?? null,
        campaign_name: ad.campaign?.name ?? null,
        adset_id: ad.adset?.id ?? null,
        adset_name: ad.adset?.name ?? null,
        thumbnail_url: ad.creative?.thumbnail_url ?? null,
        video_url: videoUrl,
        spend,
        impressions: insight ? parseInt(insight.impressions, 10) || 0 : 0,
        reach: insight ? parseInt(insight.reach, 10) || 0 : 0,
        clicks: insight ? parseInt(insight.clicks, 10) || 0 : 0,
        ctr: insight ? parseFloat(insight.ctr) || 0 : 0,
        cpc: insight ? parseFloat(insight.cpc) || 0 : 0,
        cpm: insight ? parseFloat(insight.cpm) || 0 : 0,
        purchases,
        add_to_cart: addToCart,
        initiate_checkout: initiateCheckout,
        likes,
        comments,
        shares,
        cost_per_purchase: costPerPurchase,
        cost_per_add_to_cart: costPerAddToCart,
        roas,
        purchase_revenue: purchaseRevenue,
        link_clicks: linkClicks,
        landing_page_views: landingPageViews,
        video_views_3s: videoViews3s,
        video_thruplay: videoThruplay,
        frequency: insight ? parseFloat(insight.frequency ?? "0") || 0 : 0,
        video_plays: getVideoPlays(insight?.video_play_actions),
        video_avg_watch_time: getVideoAvgWatchSeconds(
          insight?.video_avg_time_watched_actions
        ),
        video_duration_seconds: videoDurationSeconds,
        date_start: insight?.date_start ?? null,
        date_stop: insight?.date_stop ?? null,
        synced_at: new Date().toISOString(),
      };
      })
    );

    // Upsert in batches to avoid payload limits
    const BATCH_SIZE = 200;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const { error: upsertError } = await supabase
        .from("meta_ad_creatives")
        .upsert(batch, { onConflict: "shop_id,ad_id" });

      if (upsertError) {
        return NextResponse.json(
          { error: `Upsert failed: ${upsertError.message}` },
          { status: 500 }
        );
      }
    }

    // Step 5 — Upsert daily data and compute fatigue
    if (dailyInsights.length > 0) {
      const dailyRows: Array<{
        shop_id: string;
        ad_id: string;
        date: string;
        impressions: number;
        clicks: number;
        ctr: number;
        cpm: number;
        spend: number;
        frequency: number;
        purchases: number;
        link_clicks: number;
      }> = [];

      for (const d of dailyInsights) {
        const purchases = getActionValue(d.actions, "offsite_conversion.fb_pixel_purchase");
        const linkClicks = getActionValue(d.actions, "link_click");
        dailyRows.push({
          shop_id: shopId,
          ad_id: d.ad_id,
          date: d.date_start,
          impressions: parseInt(d.impressions, 10) || 0,
          clicks: parseInt(d.clicks, 10) || 0,
          ctr: parseFloat(d.ctr) || 0,
          cpm: parseFloat(d.cpm) || 0,
          spend: parseFloat(d.spend) || 0,
          frequency: parseFloat(d.frequency ?? "0") || 0,
          purchases,
          link_clicks: linkClicks,
        });
      }

      // Batch upsert daily rows
      for (let i = 0; i < dailyRows.length; i += 200) {
        const batch = dailyRows.slice(i, i + 200);
        await supabase
          .from("meta_ad_creative_daily")
          .upsert(batch, { onConflict: "shop_id,ad_id,date" });
      }

      // Compute fatigue per ad
      for (const [adId, dailyList] of dailyByAd.entries()) {
        const fatigueDays: DailyRow[] = dailyList.map((d) => ({
          date: d.date_start,
          impressions: parseInt(d.impressions, 10) || 0,
          clicks: parseInt(d.clicks, 10) || 0,
          ctr: parseFloat(d.ctr) || 0,
          cpm: parseFloat(d.cpm) || 0,
          spend: parseFloat(d.spend) || 0,
          frequency: parseFloat(d.frequency ?? "0") || 0,
          purchases: getActionValue(d.actions, "offsite_conversion.fb_pixel_purchase"),
          link_clicks: getActionValue(d.actions, "link_click"),
        }));

        const result = computeFatigue(fatigueDays);
        await supabase
          .from("meta_ad_creatives")
          .update({
            fatigue_score: result.score,
            fatigue_signal: result.signal,
            fatigue_computed_at: new Date().toISOString(),
          })
          .eq("shop_id", shopId)
          .eq("ad_id", adId);
      }
    }

    // Step 6 — Compute smart alerts (non-fatal)
    try {
      // Get CPA target for thresholds
      const { data: shopData } = await supabase
        .from("shops")
        .select("cpa_target_czk")
        .eq("id", shopId)
        .maybeSingle();
      const cpaTarget = Number(shopData?.cpa_target_czk) || 300;

      // Build alert inputs from synced rows + fatigue + daily CTR change
      const alertInputs: AlertInput[] = rows.map((r) => {
        // Compute CTR change from daily data (last 7d vs prev 7d)
        let ctrChange: number | null = null;
        const daily = dailyByAd.get(r.ad_id);
        if (daily && daily.length >= 14) {
          const sorted = [...daily].sort((a, b) =>
            a.date_start.localeCompare(b.date_start)
          );
          const last7 = sorted.slice(-7);
          const prev7 = sorted.slice(-14, -7);
          const avgLast = last7.reduce((s, d) => s + (parseFloat(d.ctr) || 0), 0) / 7;
          const avgPrev = prev7.reduce((s, d) => s + (parseFloat(d.ctr) || 0), 0) / 7;
          if (avgPrev > 0) ctrChange = avgLast / avgPrev;
        }

        return {
          adId: r.ad_id,
          adName: r.ad_name,
          spend: r.spend,
          purchases: r.purchases,
          roas: r.spend > 0 ? r.purchase_revenue / r.spend : 0,
          fatigueSignal: null, // will be filled below
          ctrChange,
        };
      });

      // Fill in fatigue signals from the fatigue computation
      if (dailyInsights.length > 0) {
        for (const input of alertInputs) {
          const daily = dailyByAd.get(input.adId);
          if (daily) {
            const fatigueDays: DailyRow[] = daily.map((d) => ({
              date: d.date_start,
              impressions: parseInt(d.impressions, 10) || 0,
              clicks: parseInt(d.clicks, 10) || 0,
              ctr: parseFloat(d.ctr) || 0,
              cpm: parseFloat(d.cpm) || 0,
              spend: parseFloat(d.spend) || 0,
              frequency: parseFloat(d.frequency ?? "0") || 0,
              purchases: getActionValue(d.actions, "offsite_conversion.fb_pixel_purchase"),
              link_clicks: getActionValue(d.actions, "link_click"),
            }));
            const result = computeFatigue(fatigueDays);
            input.fatigueSignal = result.signal;
          }
        }
      }

      const newAlerts = computeAlerts({ inputs: alertInputs, cpaTarget });

      if (newAlerts.length > 0) {
        // Clear old undismissed alerts for this shop, then insert new ones
        await supabase
          .from("creative_alerts")
          .delete()
          .eq("shop_id", shopId)
          .is("dismissed_at", null);

        const alertRows = newAlerts.map((a) => ({
          shop_id: shopId,
          ad_id: a.ad_id,
          alert_type: a.alert_type,
          message: a.message,
          severity: a.severity,
        }));

        for (let i = 0; i < alertRows.length; i += 200) {
          await supabase
            .from("creative_alerts")
            .insert(alertRows.slice(i, i + 200));
        }
      }
    } catch (e) {
      console.error("[sync] alert computation failed:", e);
      // Non-fatal — sync response stays 200
    }

    // Auto-recompute benchmarks if stale (>24h) — non-fatal.
    // Sync response must never fail because of a benchmark recompute error.
    try {
      const { data: lastBenchmark } = await supabase
        .from("shop_benchmarks")
        .select("computed_at")
        .eq("shop_id", shopId)
        .order("computed_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const staleHours = lastBenchmark?.computed_at
        ? (Date.now() -
            new Date(lastBenchmark.computed_at as string).getTime()) /
          3_600_000
        : Infinity;

      if (staleHours > 24) {
        const { recomputeBenchmarksForShop } = await import(
          "@/lib/engagement-score/recompute-helper"
        );
        await recomputeBenchmarksForShop(supabase, shopId);
      }
    } catch (e) {
      console.error("[sync] benchmark auto-recompute failed:", e);
      // Non-fatal — sync response stays 200
    }

    return NextResponse.json({
      success: true,
      ads_synced: rows.length,
      ads_total: allAds.length,
      insights_found: allInsights.length,
      videos_found: videoSourceMap.size,
    });
  } catch (e) {
    console.error("Creative sync error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
