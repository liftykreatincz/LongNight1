import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getActionValue,
  getCostPerAction,
  getActionRevenue,
  delay,
} from "@/lib/meta-api";

const META_API_VERSION = "v21.0";
const META_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

interface MetaAd {
  id: string;
  name: string;
  status: string;
  creative?: {
    thumbnail_url?: string;
    object_story_spec?: {
      video_data?: { video_id?: string };
    };
  };
  adset?: { id: string; name: string };
  campaign?: { id: string; name: string };
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
    const adsUrl = `${META_BASE}/${accountId}/ads?fields=name,status,creative{thumbnail_url,object_story_spec},adset{id,name},campaign{id,name}&limit=500&access_token=${token}`;

    let allAds: MetaAd[];
    try {
      allAds = await fetchAllPages<MetaAd>(adsUrl);
    } catch (e) {
      return NextResponse.json(
        { error: `Failed to fetch ads: ${(e as Error).message}` },
        { status: 502 }
      );
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
    const rows = allAds.map((ad) => {
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

      return {
        shop_id: shopId,
        ad_id: ad.id,
        ad_name: ad.name,
        status: ad.status,
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
        date_start: insight?.date_start ?? null,
        date_stop: insight?.date_stop ?? null,
        synced_at: new Date().toISOString(),
      };
    });

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
