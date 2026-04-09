import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const MODEL = "claude-sonnet-4-20250514";
const MAX_CREATIVES = 60;
const MIN_CREATIVES = 3;

interface CreativeDbRow {
  ad_id: string;
  ad_name: string | null;
  campaign_name: string | null;
  adset_name: string | null;
  creative_type: string | null;
  status: string | null;
  body: string | null;
  spend: number | null;
  impressions: number | null;
  clicks: number | null;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  purchases: number | null;
  cost_per_purchase: number | null;
  roas: number | null;
  add_to_cart: number | null;
  video_views_3s: number | null;
  video_thruplay: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  ai_analysis: string | Record<string, unknown> | null;
}

interface AiAnalysisShape {
  score?: number;
  summary?: string;
  visual_analysis?: string;
  copy_analysis?: string;
  strengths?: string[];
  weaknesses?: string[];
  video_analysis?: {
    hook?: string;
    pacing?: string;
    speaker?: string;
    cta?: string;
  };
}

function safeParse(s: string): AiAnalysisShape | null {
  try {
    return JSON.parse(s) as AiAnalysisShape;
  } catch {
    return null;
  }
}

function truncate(s: string, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function buildPayload(creatives: CreativeDbRow[]): string {
  const totalSpend = creatives.reduce(
    (s, c) => s + Number(c.spend || 0),
    0
  );
  const totalPurchases = creatives.reduce(
    (s, c) => s + Number(c.purchases || 0),
    0
  );
  const avgCtr =
    creatives.reduce((s, c) => s + Number(c.ctr || 0), 0) / creatives.length;
  const avgRoas =
    creatives.reduce((s, c) => s + Number(c.roas || 0), 0) / creatives.length;
  const avgCpp =
    creatives.reduce((s, c) => s + Number(c.cost_per_purchase || 0), 0) /
    creatives.length;
  const videoCount = creatives.filter(
    (c) => c.creative_type === "video"
  ).length;
  const imageCount = creatives.length - videoCount;

  const aggregate = `
AGREGOVANÉ METRIKY (${creatives.length} kreativ):
- Celkový spend: ${totalSpend.toFixed(0)} Kč
- Celkem nákupů: ${totalPurchases}
- Průměrný CTR: ${avgCtr.toFixed(2)}%
- Průměrný ROAS: ${avgRoas.toFixed(2)}x
- Průměrná cena za nákup: ${avgCpp.toFixed(0)} Kč
- Rozložení: ${videoCount} videí, ${imageCount} fotek
`.trim();

  const perCreative = creatives
    .map((c, i) => {
      const ai: AiAnalysisShape | null =
        typeof c.ai_analysis === "string"
          ? safeParse(c.ai_analysis)
          : (c.ai_analysis as AiAnalysisShape | null);
      const score = ai?.score ?? "?";
      const summary = truncate(ai?.summary || "", 200);
      const visual = truncate(ai?.visual_analysis || "", 300);
      const copy = truncate(ai?.copy_analysis || "", 300);
      const strengths = Array.isArray(ai?.strengths)
        ? ai.strengths.slice(0, 3).join("; ")
        : "";
      const weaknesses = Array.isArray(ai?.weaknesses)
        ? ai.weaknesses.slice(0, 3).join("; ")
        : "";
      const body = truncate(c.body || "", 200);

      let videoBlock = "";
      if (c.creative_type === "video" && ai?.video_analysis) {
        const v = ai.video_analysis;
        videoBlock = `\n    Video: Hook="${truncate(v.hook || "", 100)}" | Pacing="${truncate(v.pacing || "", 80)}" | Speaker="${truncate(v.speaker || "", 80)}" | CTA="${truncate(v.cta || "", 80)}"`;
      }

      return `[${i + 1}] ${String(c.creative_type || "image").toUpperCase()} "${c.ad_name}" · ad_id=${c.ad_id}
    Skóre: ${score}/10 · ROAS ${Number(c.roas || 0).toFixed(1)}x · Spend ${Number(c.spend || 0).toFixed(0)} Kč · Purchases ${c.purchases ?? 0} · CTR ${Number(c.ctr || 0).toFixed(2)}% · CPP ${Number(c.cost_per_purchase || 0).toFixed(0)} Kč
    Kampaň: ${c.campaign_name} | Ad set: ${c.adset_name}
    Body: "${body}"
    Summary: ${summary}
    Visual: ${visual}
    Copy: ${copy}
    Strengths: ${strengths}
    Weaknesses: ${weaknesses}${videoBlock}`;
    })
    .join("\n\n");

  return `Jsi expert na analýzu reklamních kreativ pro Meta Ads (Facebook/Instagram) pro český e-shop.

Tvůj úkol: udělat META-ANALÝZU napříč všemi níže uvedenými kreativami. Každá kreativa už má svou individuální AI analýzu (summary, visual, copy, strengths, weaknesses) — tvůj úkol není analyzovat znovu jednotlivosti, ale NAJÍT VZORY napříč všemi, identifikovat trendy, a navrhnout blueprint pro další nadprůměrnou kreativu.

${aggregate}

KREATIVY:
${perCreative}

Odpověz POUZE validním JSON objektem (bez markdown, bez code blocku) přesně v tomto formátu:
{
  "executive_summary": "<2-3 věty: celkový obraz toho, co se v tomto portfoliu kreativ děje>",
  "top_performers": [
    { "ad_name": "<název>", "ad_id": "<ad_id>", "why_works": "<proč funguje>", "key_lesson": "<co si z toho vzít>" }
  ],
  "worst_performers": [
    { "ad_name": "<název>", "ad_id": "<ad_id>", "why_fails": "<proč nefunguje>" }
  ],
  "patterns": {
    "visual_trends": ["<vizuální vzor 1>", "<vzor 2>"],
    "copy_trends": ["<vzor v textu 1>", "<vzor 2>"],
    "format_trends": ["<insights o video vs image>"]
  },
  "what_works": ["<co nejvíc funguje 1>", "<2>", "<3>"],
  "what_to_avoid": ["<čemu se vyhnout 1>", "<2>"],
  "next_creative_blueprint": {
    "concept": "<detailní koncept nadprůměrné další kreativy>",
    "hook": "<konkrétní hook — prvních 3 sekund / první co uvidí>",
    "visual_direction": "<vizuální směr — co natočit / vyfotit, jaká paleta, kompozice>",
    "copy_angle": "<angle pro text reklamy, tón, framework>",
    "cta": "<konkrétní CTA>",
    "why_above_average": "<proč by tato kreativa měla outperformovat průměr — s odkazem na data výše>"
  },
  "key_takeaways": ["<hlavní poučení 1>", "<2>", "<3>", "<4>", "<5>"]
}

Buď konkrétní, datově podložený, a česky. V "top_performers" vyber 3-5 kreativ, v "worst_performers" 2-3. Blueprint musí být okamžitě realizovatelný.`;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      shopId?: string;
      scope?: "all" | "filtered";
      ad_ids?: string[];
      filter_context?: Record<string, unknown> | null;
      min_spend?: number;
    };

    const { shopId } = body;
    if (!shopId) {
      return NextResponse.json({ error: "Missing shopId" }, { status: 400 });
    }

    const scope: "all" | "filtered" =
      body.scope === "filtered" ? "filtered" : "all";
    const adIdsFilter = Array.isArray(body.ad_ids) ? body.ad_ids : null;
    const filterContext = body.filter_context ?? null;
    const minSpend = Number(body.min_spend ?? 0);

    if (scope === "filtered" && (!adIdsFilter || adIdsFilter.length === 0)) {
      return NextResponse.json(
        { error: "ad_ids required when scope=filtered" },
        { status: 400 }
      );
    }

    // Verify shop ownership
    const { data: shop, error: shopError } = await supabase
      .from("shops")
      .select("id")
      .eq("id", shopId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (shopError || !shop) {
      return NextResponse.json(
        { error: "Shop not found or access denied" },
        { status: 404 }
      );
    }

    // Load creatives with ai_analysis
    let query = supabase
      .from("meta_ad_creatives")
      .select(
        "ad_id, ad_name, campaign_name, adset_name, creative_type, status, body, spend, impressions, clicks, ctr, cpc, cpm, purchases, cost_per_purchase, roas, add_to_cart, video_views_3s, video_thruplay, likes, comments, shares, ai_analysis"
      )
      .eq("shop_id", shopId)
      .not("ai_analysis", "is", null)
      .order("spend", { ascending: false })
      .limit(MAX_CREATIVES);

    if (scope === "filtered" && adIdsFilter) {
      query = query.in("ad_id", adIdsFilter);
    }

    if (minSpend > 0) {
      query = query.gte("spend", minSpend);
    }

    const { data: creatives, error: loadErr } = await query;
    if (loadErr) {
      console.error("[meta-analyze] load error", loadErr);
      return NextResponse.json(
        { error: "Failed to load creatives" },
        { status: 500 }
      );
    }

    const rows = (creatives ?? []) as CreativeDbRow[];

    if (rows.length < MIN_CREATIVES) {
      return NextResponse.json(
        {
          error: `Nejdřív analyzuj alespoň ${MIN_CREATIVES} kreativy (nalezeno ${rows.length})`,
        },
        { status: 400 }
      );
    }

    const payloadText = buildPayload(rows);

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY not configured" },
        { status: 500 }
      );
    }

    console.log(
      `[meta-analyze] calling Claude with ${rows.length} creatives, ${payloadText.length} chars`
    );

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4000,
        messages: [
          { role: "user", content: [{ type: "text", text: payloadText }] },
        ],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text().catch(() => "");
      console.error(
        `[meta-analyze] Claude error ${claudeRes.status}: ${errText.slice(0, 500)}`
      );
      return NextResponse.json(
        { error: `Claude API error: ${claudeRes.status}` },
        { status: 502 }
      );
    }

    const claudeData = await claudeRes.json();
    const rawText: string = claudeData.content?.[0]?.text || "";

    let analysis: Record<string, unknown>;
    try {
      const match = rawText.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("No JSON found");
      analysis = JSON.parse(match[0]);
    } catch {
      console.error(
        "[meta-analyze] parse failed:",
        rawText.slice(0, 500)
      );
      return NextResponse.json(
        { error: "Failed to parse Claude response" },
        { status: 500 }
      );
    }

    const adIds = rows.map((c) => c.ad_id);

    const row = {
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      creatives_count: rows.length,
      scope,
      filter_context: filterContext,
      ad_ids: adIds,
      analysis,
      model: MODEL,
    };

    return NextResponse.json({ success: true, row });
  } catch (error) {
    console.error("[meta-analyze] unexpected", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
