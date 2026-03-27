import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface AnalyzeRequestBody {
  shopId: string;
  creativeAdId: string;
}

async function fetchImageAsBase64(
  url: string
): Promise<{ base64: string; mediaType: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const contentType = res.headers.get("content-type") || "image/jpeg";
    const mediaType = contentType.split(";")[0].trim();
    return { base64, mediaType };
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    // 1. Auth
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse body
    const body: AnalyzeRequestBody = await request.json().catch(() => ({} as AnalyzeRequestBody));
    const { shopId, creativeAdId } = body;

    if (!shopId || !creativeAdId) {
      return NextResponse.json(
        { error: "shopId and creativeAdId are required" },
        { status: 400 }
      );
    }

    // Verify shop belongs to user
    const { data: shop, error: shopError } = await supabase
      .from("shops")
      .select("id, meta_token")
      .eq("id", shopId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (shopError || !shop) {
      return NextResponse.json(
        { error: "Shop not found or access denied" },
        { status: 404 }
      );
    }

    // 2. Fetch the creative
    const { data: creative, error: creativeError } = await supabase
      .from("meta_ad_creatives")
      .select("*")
      .eq("ad_id", creativeAdId)
      .eq("shop_id", shopId)
      .maybeSingle();

    if (creativeError || !creative) {
      return NextResponse.json(
        { error: "Creative not found" },
        { status: 404 }
      );
    }

    // 3. Fetch ALL creatives for the shop (for average calculations)
    const { data: allCreatives } = await supabase
      .from("meta_ad_creatives")
      .select(
        "spend, impressions, reach, clicks, ctr, cpc, cpm, purchases, cost_per_purchase, roas, add_to_cart, video_views_3s, video_thruplay, likes, comments, shares"
      )
      .eq("shop_id", shopId);

    // 4. Calculate average metrics
    const creativesList = allCreatives || [];
    const count = creativesList.length || 1;

    const avgMetrics = {
      spend:
        creativesList.reduce(
          (s: number, c: Record<string, unknown>) => s + (Number(c.spend) || 0),
          0
        ) / count,
      ctr:
        creativesList.reduce(
          (s: number, c: Record<string, unknown>) => s + (Number(c.ctr) || 0),
          0
        ) / count,
      cpc:
        creativesList.reduce(
          (s: number, c: Record<string, unknown>) => s + (Number(c.cpc) || 0),
          0
        ) / count,
      cpm:
        creativesList.reduce(
          (s: number, c: Record<string, unknown>) => s + (Number(c.cpm) || 0),
          0
        ) / count,
      roas:
        creativesList.reduce(
          (s: number, c: Record<string, unknown>) => s + (Number(c.roas) || 0),
          0
        ) / count,
      purchases:
        creativesList.reduce(
          (s: number, c: Record<string, unknown>) => s + (Number(c.purchases) || 0),
          0
        ) / count,
      costPerPurchase:
        creativesList.reduce(
          (s: number, c: Record<string, unknown>) =>
            s + (Number(c.cost_per_purchase) || 0),
          0
        ) / count,
    };

    // 5. Get Meta token from shop
    const metaToken = shop.meta_token || null;

    // 6. Build image contents for Claude
    const imageContents: Array<{
      type: "image";
      source: { type: "base64"; media_type: string; data: string };
    }> = [];

    if (
      creative.creative_type === "video" &&
      creative.video_id &&
      metaToken
    ) {
      try {
        const thumbRes = await fetch(
          `https://graph.facebook.com/v21.0/${creative.video_id}?fields=thumbnails&access_token=${metaToken}`
        );
        if (thumbRes.ok) {
          const thumbData = await thumbRes.json();
          const thumbnails = thumbData.thumbnails?.data || [];
          const framesToUse =
            thumbnails.length <= 30
              ? thumbnails
              : thumbnails
                  .filter(
                    (_: unknown, i: number) =>
                      i % Math.ceil(thumbnails.length / 30) === 0
                  )
                  .slice(0, 30);

          const results = await Promise.all(
            framesToUse.map((thumb: { uri?: string }) =>
              thumb.uri
                ? fetchImageAsBase64(thumb.uri)
                : Promise.resolve(null)
            )
          );
          for (const result of results) {
            if (result) {
              imageContents.push({
                type: "image",
                source: {
                  type: "base64",
                  media_type: result.mediaType,
                  data: result.base64,
                },
              });
            }
          }
        }
      } catch (e) {
        console.warn("[analyze-creative] Failed to fetch video thumbnails:", e);
      }

      // Fallback to thumbnail_url if no thumbnails fetched
      if (imageContents.length === 0 && creative.thumbnail_url) {
        const fallback = await fetchImageAsBase64(creative.thumbnail_url);
        if (fallback) {
          imageContents.push({
            type: "image",
            source: {
              type: "base64",
              media_type: fallback.mediaType,
              data: fallback.base64,
            },
          });
        }
      }
    } else if (creative.thumbnail_url) {
      const imgData = await fetchImageAsBase64(creative.thumbnail_url);
      if (imgData) {
        imageContents.push({
          type: "image",
          source: {
            type: "base64",
            media_type: imgData.mediaType,
            data: imgData.base64,
          },
        });
      }
    }

    // 7. Build the prompt
    const isVideo = creative.creative_type === "video";
    const metricsText = `
METRIKA TÉTO KREATIVY:
- Spend: ${creative.spend} Kč
- Impressions: ${creative.impressions}
- Reach: ${creative.reach}
- Clicks: ${creative.clicks}
- CTR: ${creative.ctr}%
- CPC: ${creative.cpc} Kč
- CPM: ${creative.cpm} Kč
- Nákupy: ${creative.purchases}
- Cena za nákup: ${creative.cost_per_purchase} Kč
- ROAS: ${creative.roas}x
- Add to Cart: ${creative.add_to_cart}
- Likes: ${creative.likes}, Comments: ${creative.comments}, Shares: ${creative.shares}
${isVideo ? `- Video Views 3s: ${creative.video_views_3s}\n- ThruPlay: ${creative.video_thruplay}` : ""}

PRŮMĚRNÉ METRIKY VŠECH KREATIV:
- Spend: ${avgMetrics.spend.toFixed(2)} Kč
- CTR: ${avgMetrics.ctr.toFixed(2)}%
- CPC: ${avgMetrics.cpc.toFixed(2)} Kč
- CPM: ${avgMetrics.cpm.toFixed(2)} Kč
- ROAS: ${avgMetrics.roas.toFixed(2)}x
- Nákupy: ${avgMetrics.purchases.toFixed(1)}
- Cena za nákup: ${avgMetrics.costPerPurchase.toFixed(2)} Kč
`;

    const bodyText = creative.body
      ? `\nTEXT REKLAMY:\n${creative.body}\n`
      : "";

    const videoPromptPart = isVideo
      ? `
Výše vidíš ${imageContents.length} framů z videa v chronologickém pořadí — od začátku do konce. Analyzuj celé video jako celek:
- Kolik je viditelných střihů (scene changes)
- Co se děje v úvodu (hook — první 3 sekundy)
- Kdo je v záběru — člověk/produkt/grafika, muž/žena, jak mluví
- Jsou vidět titulky/text overlay? Jaký styl?
- Jaký je vizuální styl a barevná paleta
- Jak se mění záběry — tempo, dynamika
- Je na konci CTA (výzva k akci)?
- Co by zákazník viděl jako první a co si zapamatuje

Přidej navíc sekci "video_analysis" s těmito poli:
- "hook": detailní popis prvních 3 sekund a zda je hook efektivní
- "pacing": tempo videa, přibližný počet střihů, dynamika
- "speaker": kdo je v záběru, jak mluví, jaký je styl prezentace
- "subtitles": jsou titulky? jaký styl, barva, čitelnost?
- "cta": výzva k akci — je jasná? kde se objeví?
`
      : "";

    const promptText = `Jsi expert na analýzu reklamních kreativ pro Meta Ads (Facebook/Instagram). Analyzuj tuto kreativu pro český e-shop s doplňky stravy a fitness produkty.

Název reklamy: ${creative.ad_name}
Kampaň: ${creative.campaign_name}
Ad set: ${creative.adset_name}
Typ: ${creative.creative_type}
Status: ${creative.status}
${bodyText}
${metricsText}

Analyzuj vizuální stránku kreativy (obrázek${isVideo ? "/video záběry" : ""} výše), text reklamy, a metriky. Porovnej s průměrem ostatních kreativ.
${videoPromptPart}
Odpověz POUZE validním JSON objektem (bez markdown, bez code blocku) v tomto formátu:
{
  "score": <číslo 1-10>,
  "summary": "<krátké shrnutí výkonu kreativy>",
  "visual_analysis": "<co vidíš na kreativě, vizuální hodnocení>",
  "copy_analysis": "<analýza textu reklamy>",
  "strengths": ["<silná stránka 1>", "<silná stránka 2>"],
  "weaknesses": ["<slabá stránka 1>", "<slabá stránka 2>"],
  "recommendations": ["<doporučení 1>", "<doporučení 2>"],
  "vs_average": "<srovnání s průměrem ostatních kreativ>"${
    isVideo
      ? `,
  "video_analysis": {
    "hook": "<první 3 sekundy>",
    "pacing": "<tempo, počet střihů>",
    "speaker": "<kdo mluví, jak>",
    "subtitles": "<titulky ano/ne, styl>",
    "cta": "<výzva k akci>"
  }`
      : ""
  }
}`;

    // 8. Call Claude API
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY not configured" },
        { status: 500 }
      );
    }

    const claudeMessages = [
      {
        role: "user" as const,
        content: [
          ...imageContents,
          { type: "text" as const, text: promptText },
        ],
      },
    ];

    console.log(
      `[analyze-creative] Calling Claude API with ${imageContents.length} images for creative ${creativeAdId}`
    );

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 3000,
        messages: claudeMessages,
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text().catch(() => "");
      console.error(
        `[analyze-creative] Claude API error: ${claudeRes.status} - ${errText.slice(0, 500)}`
      );
      return NextResponse.json(
        { error: `Claude API error: ${claudeRes.status}` },
        { status: 502 }
      );
    }

    const claudeData = await claudeRes.json();
    const analysisText = claudeData.content?.[0]?.text || "";

    // 9. Parse response
    let analysis: Record<string, unknown>;
    try {
      const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found in response");
      }
    } catch {
      console.error(
        "[analyze-creative] Failed to parse Claude response:",
        analysisText.slice(0, 500)
      );
      return NextResponse.json(
        { error: "Failed to parse analysis response" },
        { status: 500 }
      );
    }

    // 10. Store analysis
    const { error: updateError } = await supabase
      .from("meta_ad_creatives")
      .update({ ai_analysis: JSON.stringify(analysis) })
      .eq("ad_id", creativeAdId)
      .eq("shop_id", shopId);

    if (updateError) {
      console.error(
        "[analyze-creative] Failed to store analysis:",
        JSON.stringify(updateError)
      );
    }

    console.log(
      `[analyze-creative] Analysis complete for creative ${creativeAdId}, score: ${analysis.score}`
    );

    // 11. Return
    return NextResponse.json({ success: true, analysis });
  } catch (error) {
    console.error("[analyze-creative] Unexpected error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
