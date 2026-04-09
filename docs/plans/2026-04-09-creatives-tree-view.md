# Creatives Tree View Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Přidat na stránku Kreativ přepínač mezi plochým seznamem a hierarchickým stromem Kampaň → Ad Set → Reklama s vážené průměrovanými metrikami na rodičovských úrovních.

**Architecture:** Čisté klientské grupování nad už načtenými daty z TanStack Query. Pure helper s testy pro agregaci (vážené průměry se snadno splete). Nová komponenta tree view sousedí s existující plochou tabulkou; přepínač uloží volbu do `localStorage`.

**Tech Stack:** React 19, Next.js 15 client components, TanStack Query (už v projektu), vitest (pokud není, přidat jako dev), Tailwind + lucide-react ikony, shadcn styly inline.

**Design doc:** `docs/plans/2026-04-09-creatives-tree-view-design.md`

**Prerequisite (řeší Task 1):** Současné schéma `meta_ad_creatives` a `useCreativeAnalysis` hook **neukládá** `campaign_id` a `adset_id`, jen jména. Pro stabilní grupování (přejmenování Meta, kolize jmen) přidáme ID sloupce + sync update + mapping rozšíření.

---

## Task 0: Pre-flight check

**Step 1:** Přečti design doc `docs/plans/2026-04-09-creatives-tree-view-design.md`.

**Step 2:**

```bash
cd "/Users/jakubzelenka/Downloads/AI hub/LongNight"
git status
```

Expected: clean working tree nebo jen známé změny.

**Step 3:** Zjisti, jestli projekt má vitest:

```bash
cat package.json | grep -E "vitest|\"test\""
```

Pokud **není**, přidáme ho v Task 2. Pokud **je**, přeskočíme instalaci.

---

## Task 1: Rozšiř schema a sync o campaign_id / adset_id

**Files:**
- Create: `supabase/migrations/20260409_creative_campaign_adset_ids.sql`
- Modify: `src/app/api/creatives/sync/route.ts` (ř. 23–24, 150, 293–294)
- Modify: `src/hooks/useCreativeAnalysis.ts` (type + mapping)

**Step 1:** Migrace:

```sql
alter table public.meta_ad_creatives
  add column if not exists campaign_id text,
  add column if not exists adset_id text;

create index if not exists meta_ad_creatives_shop_campaign_idx
  on public.meta_ad_creatives (shop_id, campaign_id);
create index if not exists meta_ad_creatives_shop_adset_idx
  on public.meta_ad_creatives (shop_id, adset_id);
```

Spusť v Supabase dashboardu.

**Step 2:** V `src/app/api/creatives/sync/route.ts`:

Rozšiř interface (ř. 23–24):
```ts
adset?: { id: string; name: string };
campaign?: { id: string; name: string };
```

Změň `fields` v `adsUrl` (ř. 150) z:
```
adset{name},campaign{name}
```
na:
```
adset{id,name},campaign{id,name}
```

Do upsert row (ř. 293–294) přidej:
```ts
campaign_id: ad.campaign?.id ?? null,
adset_id: ad.adset?.id ?? null,
campaign_name: ad.campaign?.name ?? null,
adset_name: ad.adset?.name ?? null,
```

**Step 3:** V `src/hooks/useCreativeAnalysis.ts` rozšiř `CreativeRow`:

```ts
export interface CreativeRow {
  adId: string;
  adName: string;
  campaignId: string;
  campaignName: string;
  adsetId: string;
  adsetName: string;
  // … zbytek zůstává
}
```

A mapping (kolem ř. 79):

```ts
campaignId: (r.campaign_id as string) || "",
campaignName: (r.campaign_name as string) || "",
adsetId: (r.adset_id as string) || "",
adsetName: (r.adset_name as string) || "",
```

**Step 4:** Ověř, že existující kód na jiných místech nepoužívá jen `campaignName`/`adsetName` způsobem, který se rozbije:

```bash
grep -rn "campaignName\|adsetName" src/ | head -30
```

Expected: jen čtení, žádné build errory (typ pouze přidává, ne odebírá).

**Step 5:** Typecheck:

```bash
bunx tsc --noEmit 2>&1 | grep -E "error" | head -10 || echo "no errors"
```

**Step 6:** Commit:

```bash
git add supabase/migrations/20260409_creative_campaign_adset_ids.sql \
  src/app/api/creatives/sync/route.ts \
  src/hooks/useCreativeAnalysis.ts
git commit -m "feat(creatives): store campaign_id and adset_id from Meta API"
```

**Step 7:** Ruční ověření — otevři app, klikni "Synchronizovat" na Kreativách. Pak v Supabase:

```sql
select campaign_id, campaign_name, adset_id, adset_name
from meta_ad_creatives
limit 5;
```

Expected: IDs nejsou null u čerstvě syncnutých řádků.

---

## Task 2: Setup vitest (pokud chybí)

**Skip, pokud vitest už existuje v package.json.**

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

**Step 1:** Install:

```bash
bun add -d vitest @vitest/ui
```

**Step 2:** `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
```

**Step 3:** Přidej do `package.json` scripts:

```json
"test": "vitest run",
"test:watch": "vitest"
```

**Step 4:** Smoke:

```bash
bun run test
```

Expected: "No test files found" nebo úspěšné 0/0.

**Step 5:** Commit:

```bash
git add package.json bun.lockb vitest.config.ts
git commit -m "chore: add vitest for unit tests"
```

---

## Task 3: Pure agregace + testy (TDD)

**Files:**
- Create: `src/lib/creative-aggregation.test.ts`
- Create: `src/lib/creative-aggregation.ts`

**Step 1:** Napiš testy první:

```ts
// src/lib/creative-aggregation.test.ts
import { describe, it, expect } from "vitest";
import type { CreativeRow } from "@/hooks/useCreativeAnalysis";
import { aggregateMetrics, groupIntoTree } from "./creative-aggregation";

function makeAd(overrides: Partial<CreativeRow>): CreativeRow {
  return {
    adId: "a",
    adName: "Ad",
    campaignId: "c1",
    campaignName: "C",
    adsetId: "s1",
    adsetName: "S",
    status: "active",
    thumbnailUrl: null,
    creativeType: "image",
    videoUrl: null,
    body: null,
    dateStart: null,
    dateStop: null,
    spend: 0,
    impressions: 0,
    reach: 0,
    clicks: 0,
    ctr: 0,
    cpc: 0,
    cpm: 0,
    purchases: 0,
    costPerPurchase: 0,
    roas: 0,
    addToCart: 0,
    costPerAddToCart: 0,
    initiateCheckout: 0,
    linkClicks: 0,
    landingPageViews: 0,
    videoViews3s: 0,
    videoThruplay: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    syncedAt: "2026-01-01T00:00:00Z",
    aiAnalysis: null,
    ...overrides,
  };
}

describe("aggregateMetrics", () => {
  it("returns zeros and nulls for empty array", () => {
    const m = aggregateMetrics([]);
    expect(m.spend).toBe(0);
    expect(m.impressions).toBe(0);
    expect(m.ctr).toBeNull();
    expect(m.cpc).toBeNull();
    expect(m.cpa).toBeNull();
    expect(m.roas).toBeNull();
  });

  it("sums additive metrics", () => {
    const ads = [
      makeAd({ spend: 100, impressions: 1000, clicks: 20, purchases: 2, purchase_revenue: 300 } as Partial<CreativeRow>),
      makeAd({ spend: 50, impressions: 500, clicks: 30, purchases: 1, purchase_revenue: 150 } as Partial<CreativeRow>),
    ];
    const m = aggregateMetrics(ads);
    expect(m.spend).toBe(150);
    expect(m.impressions).toBe(1500);
    expect(m.clicks).toBe(50);
    expect(m.purchases).toBe(3);
  });

  it("computes weighted CTR from sums, not per-ad average", () => {
    const ads = [
      makeAd({ impressions: 1000, clicks: 20 }), // CTR 2%
      makeAd({ impressions: 500, clicks: 30 }),  // CTR 6%
    ];
    const m = aggregateMetrics(ads);
    // Weighted: 50/1500 = 3.333...%, NOT (2+6)/2 = 4%
    expect(m.ctr).toBeCloseTo(50 / 1500, 6);
  });

  it("returns null for ratios when denominator is zero", () => {
    const ads = [makeAd({ spend: 10, purchases: 0, impressions: 0 })];
    const m = aggregateMetrics(ads);
    expect(m.cpa).toBeNull();
    expect(m.ctr).toBeNull();
  });

  it("computes ROAS as revenue / spend", () => {
    const ads = [
      makeAd({ spend: 100 } as Partial<CreativeRow>),
    ];
    // hack: purchase_revenue not on CreativeRow yet — see Note below
    const m = aggregateMetrics(ads);
    expect(m.roas).toBeNull(); // spend > 0 but no revenue → 0/100 = 0, not null
  });
});

describe("groupIntoTree", () => {
  it("groups ads by campaign and ad set", () => {
    const ads = [
      makeAd({ adId: "1", campaignId: "c1", adsetId: "s1" }),
      makeAd({ adId: "2", campaignId: "c1", adsetId: "s1" }),
      makeAd({ adId: "3", campaignId: "c1", adsetId: "s2" }),
      makeAd({ adId: "4", campaignId: "c2", adsetId: "s3" }),
    ];
    const tree = groupIntoTree(ads);
    expect(tree).toHaveLength(2);
    const c1 = tree.find((c) => c.id === "c1")!;
    expect(c1.adSets).toHaveLength(2);
    const s1 = c1.adSets.find((s) => s.id === "s1")!;
    expect(s1.ads).toHaveLength(2);
  });

  it("places ads without IDs into sentinel groups", () => {
    const ads = [makeAd({ campaignId: "", adsetId: "" })];
    const tree = groupIntoTree(ads);
    expect(tree[0].id).toBe("__no_campaign__");
    expect(tree[0].adSets[0].id).toBe("__no_adset__");
  });
});
```

**⚠ Note o purchase_revenue:** `CreativeRow` aktuálně nemá pole `purchase_revenue` — používá odvozené `roas`. Pro korektní agregaci ROAS z vážených součtů potřebujeme buď:

- **a)** Přidat `purchase_revenue` do `CreativeRow` + mapping v hooku (`purchase_revenue: Number(r.purchase_revenue ?? 0)`), a v `aggregateMetrics` používat `SUM(revenue) / SUM(spend)`.
- **b)** Počítat revenue jako `ad.spend * ad.roas` při agregaci. Křehké, ale nepotřebuje změnu schématu ani hooku.

**→ Zvolíme (a)**, je to čisté a migrace už column má (byla přidaná v minulém commitu `purchase_revenue`).

**Proto před psaním testů upraven `useCreativeAnalysis.ts`:** přidej `purchase_revenue: Number(r.purchase_revenue ?? 0)` do mappingu a `purchase_revenue: number` do interface. Pak přepiš test `makeAd` defaults s `purchase_revenue: 0`.

**Step 2:** Spusť test:

```bash
bun run test src/lib/creative-aggregation.test.ts
```

Expected: FAIL — soubor `creative-aggregation.ts` neexistuje.

**Step 3:** Napiš implementaci `src/lib/creative-aggregation.ts`:

```ts
import type { CreativeRow } from "@/hooks/useCreativeAnalysis";

export type MetricBundle = {
  spend: number;
  impressions: number;
  clicks: number;
  linkClicks: number;
  landingPageViews: number;
  purchases: number;
  purchaseRevenue: number;
  ctr: number | null;
  cpc: number | null;
  cpa: number | null;
  roas: number | null;
  cvr: number | null;
};

const safeDiv = (a: number, b: number): number | null =>
  b > 0 ? a / b : null;

export function aggregateMetrics(ads: CreativeRow[]): MetricBundle {
  const sum = ads.reduce(
    (acc, ad) => ({
      spend: acc.spend + (ad.spend || 0),
      impressions: acc.impressions + (ad.impressions || 0),
      clicks: acc.clicks + (ad.clicks || 0),
      linkClicks: acc.linkClicks + (ad.linkClicks || 0),
      landingPageViews: acc.landingPageViews + (ad.landingPageViews || 0),
      purchases: acc.purchases + (ad.purchases || 0),
      purchaseRevenue:
        acc.purchaseRevenue + (ad.purchaseRevenue || 0),
    }),
    {
      spend: 0,
      impressions: 0,
      clicks: 0,
      linkClicks: 0,
      landingPageViews: 0,
      purchases: 0,
      purchaseRevenue: 0,
    }
  );

  return {
    ...sum,
    ctr: safeDiv(sum.clicks, sum.impressions),
    cpc: safeDiv(sum.spend, sum.clicks),
    cpa: safeDiv(sum.spend, sum.purchases),
    roas: safeDiv(sum.purchaseRevenue, sum.spend),
    cvr: safeDiv(sum.purchases, sum.linkClicks),
  };
}

export type AdSetNode = {
  id: string;
  name: string;
  metrics: MetricBundle;
  ads: CreativeRow[];
};

export type CampaignNode = {
  id: string;
  name: string;
  metrics: MetricBundle;
  adSets: AdSetNode[];
};

const NO_CAMPAIGN = "__no_campaign__";
const NO_ADSET = "__no_adset__";

export function groupIntoTree(ads: CreativeRow[]): CampaignNode[] {
  // Group: Map<campaignId, { name, adsets: Map<adsetId, { name, ads }> }>
  const campaigns = new Map<
    string,
    {
      name: string;
      adsets: Map<string, { name: string; ads: CreativeRow[] }>;
    }
  >();

  for (const ad of ads) {
    const campaignId = ad.campaignId || NO_CAMPAIGN;
    const campaignName =
      ad.campaignName || (campaignId === NO_CAMPAIGN ? "(Bez kampaně)" : campaignId);
    const adsetId = ad.adsetId || NO_ADSET;
    const adsetName =
      ad.adsetName || (adsetId === NO_ADSET ? "(Bez ad setu)" : adsetId);

    let campaign = campaigns.get(campaignId);
    if (!campaign) {
      campaign = { name: campaignName, adsets: new Map() };
      campaigns.set(campaignId, campaign);
    }

    let adset = campaign.adsets.get(adsetId);
    if (!adset) {
      adset = { name: adsetName, ads: [] };
      campaign.adsets.set(adsetId, adset);
    }

    adset.ads.push(ad);
  }

  return Array.from(campaigns.entries()).map(([campaignId, c]) => {
    const adSets: AdSetNode[] = Array.from(c.adsets.entries()).map(
      ([adsetId, s]) => ({
        id: adsetId,
        name: s.name,
        metrics: aggregateMetrics(s.ads),
        ads: s.ads,
      })
    );
    const allAds = adSets.flatMap((s) => s.ads);
    return {
      id: campaignId,
      name: c.name,
      metrics: aggregateMetrics(allAds),
      adSets,
    };
  });
}
```

**Step 4:** Spusť testy znovu:

```bash
bun run test src/lib/creative-aggregation.test.ts
```

Expected: všechno zelené. Uprav hlavičku makeAd o `purchaseRevenue: 0` pokud test failuje na typech.

**Step 5:** Commit:

```bash
git add src/lib/creative-aggregation.ts src/lib/creative-aggregation.test.ts src/hooks/useCreativeAnalysis.ts
git commit -m "feat(creatives): add creative-aggregation helper with weighted ratios"
```

---

## Task 4: Komponenta tree view

**Files:**
- Create: `src/app/dashboard/[shopId]/creatives/creatives-tree-view.tsx`

**Step 1:** Napiš client komponentu. Rozhraní:

```tsx
"use client";

import { useState, useMemo, useCallback } from "react";
import { ChevronRight, ChevronDown, Sparkles, Swords } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CreativeRow } from "@/hooks/useCreativeAnalysis";
import {
  groupIntoTree,
  type CampaignNode,
  type AdSetNode,
  type MetricBundle,
} from "@/lib/creative-aggregation";

/* ── Formátování ── */
const fmt = (n: number) => Math.round(n).toLocaleString("cs-CZ");
const fmtUsd = (n: number | null) =>
  n === null ? "—" : `${n.toFixed(2).replace(".", ",")}`;
const fmtPct = (n: number | null) =>
  n === null ? "—" : `${(n * 100).toFixed(2).replace(".", ",")}%`;
const fmtRoas = (n: number | null) =>
  n === null ? "—" : `${n.toFixed(2).replace(".", ",")}×`;

interface CreativesTreeViewProps {
  ads: CreativeRow[];
  onAnalyze: (ad: CreativeRow) => void;
  onOpenMedia: (ad: CreativeRow, e: React.MouseEvent) => void;
  analyzeLoadingId?: string | null;
}

export function CreativesTreeView({
  ads,
  onAnalyze,
  onOpenMedia,
  analyzeLoadingId,
}: CreativesTreeViewProps) {
  const tree = useMemo(() => groupIntoTree(ads), [ads]);
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(
    new Set()
  );
  const [expandedAdSets, setExpandedAdSets] = useState<Set<string>>(new Set());

  const toggleCampaign = useCallback((id: string) => {
    setExpandedCampaigns((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAdSet = useCallback((id: string) => {
    setExpandedAdSets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const expandAll = () => {
    setExpandedCampaigns(new Set(tree.map((c) => c.id)));
    setExpandedAdSets(
      new Set(tree.flatMap((c) => c.adSets.map((s) => s.id)))
    );
  };

  const collapseAll = () => {
    setExpandedCampaigns(new Set());
    setExpandedAdSets(new Set());
  };

  if (tree.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[#d2d2d7] bg-white/60 py-16 text-center text-[#6e6e73]">
        Žádné kreativy neodpovídají filtrům.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <button
          onClick={expandAll}
          className="rounded-full border border-[#d2d2d7] bg-white px-3 py-1 text-xs font-semibold text-[#1d1d1f] hover:bg-black/[0.03]"
        >
          Rozbalit vše
        </button>
        <button
          onClick={collapseAll}
          className="rounded-full border border-[#d2d2d7] bg-white px-3 py-1 text-xs font-semibold text-[#1d1d1f] hover:bg-black/[0.03]"
        >
          Sbalit vše
        </button>
      </div>

      {/* Header řádek */}
      <div className="grid grid-cols-[1fr_80px_80px_80px_80px_80px_80px_80px] gap-2 px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-[#86868b]">
        <div>Název</div>
        <div className="text-right">Spend</div>
        <div className="text-right">Impr</div>
        <div className="text-right">CTR</div>
        <div className="text-right">Clicks</div>
        <div className="text-right">Purch</div>
        <div className="text-right">CPA</div>
        <div className="text-right">ROAS</div>
      </div>

      {/* Tree body */}
      <div className="overflow-hidden rounded-2xl border border-[#d2d2d7]/60 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)] divide-y divide-[#d2d2d7]/60">
        {tree.map((campaign) => (
          <CampaignRow
            key={campaign.id}
            campaign={campaign}
            expanded={expandedCampaigns.has(campaign.id)}
            onToggle={() => toggleCampaign(campaign.id)}
            expandedAdSets={expandedAdSets}
            onToggleAdSet={toggleAdSet}
            onAnalyze={onAnalyze}
            onOpenMedia={onOpenMedia}
            analyzeLoadingId={analyzeLoadingId}
          />
        ))}
      </div>
    </div>
  );
}

/* ── Row komponenty ── */

function MetricCells({ m }: { m: MetricBundle }) {
  return (
    <>
      <div className="text-right text-sm tabular-nums">{fmtUsd(m.spend)}</div>
      <div className="text-right text-sm tabular-nums">{fmt(m.impressions)}</div>
      <div className="text-right text-sm tabular-nums">{fmtPct(m.ctr)}</div>
      <div className="text-right text-sm tabular-nums">{fmt(m.clicks)}</div>
      <div className="text-right text-sm tabular-nums">{fmt(m.purchases)}</div>
      <div className="text-right text-sm tabular-nums">{fmtUsd(m.cpa)}</div>
      <div className="text-right text-sm tabular-nums">{fmtRoas(m.roas)}</div>
    </>
  );
}

function CampaignRow({
  campaign,
  expanded,
  onToggle,
  expandedAdSets,
  onToggleAdSet,
  onAnalyze,
  onOpenMedia,
  analyzeLoadingId,
}: {
  campaign: CampaignNode;
  expanded: boolean;
  onToggle: () => void;
  expandedAdSets: Set<string>;
  onToggleAdSet: (id: string) => void;
  onAnalyze: (ad: CreativeRow) => void;
  onOpenMedia: (ad: CreativeRow, e: React.MouseEvent) => void;
  analyzeLoadingId?: string | null;
}) {
  const totalAds = campaign.adSets.reduce((n, s) => n + s.ads.length, 0);
  return (
    <>
      <div
        onClick={onToggle}
        className="grid cursor-pointer grid-cols-[1fr_80px_80px_80px_80px_80px_80px_80px] gap-2 px-4 py-3 hover:bg-black/[0.02]"
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-[#6e6e73]" />
          ) : (
            <ChevronRight className="h-4 w-4 text-[#6e6e73]" />
          )}
          <span className="font-semibold text-[#1d1d1f]">{campaign.name}</span>
          <span className="text-xs text-[#86868b]">
            {campaign.adSets.length} ad{campaign.adSets.length === 1 ? " set" : " setů"} · {totalAds} reklam
          </span>
        </div>
        <MetricCells m={campaign.metrics} />
      </div>
      {expanded &&
        campaign.adSets.map((adset) => (
          <AdSetRow
            key={adset.id}
            adset={adset}
            expanded={expandedAdSets.has(adset.id)}
            onToggle={() => onToggleAdSet(adset.id)}
            onAnalyze={onAnalyze}
            onOpenMedia={onOpenMedia}
            analyzeLoadingId={analyzeLoadingId}
          />
        ))}
    </>
  );
}

function AdSetRow({
  adset,
  expanded,
  onToggle,
  onAnalyze,
  onOpenMedia,
  analyzeLoadingId,
}: {
  adset: AdSetNode;
  expanded: boolean;
  onToggle: () => void;
  onAnalyze: (ad: CreativeRow) => void;
  onOpenMedia: (ad: CreativeRow, e: React.MouseEvent) => void;
  analyzeLoadingId?: string | null;
}) {
  return (
    <>
      <div
        onClick={onToggle}
        className="grid cursor-pointer grid-cols-[1fr_80px_80px_80px_80px_80px_80px_80px] gap-2 bg-black/[0.015] px-4 py-2.5 pl-10 hover:bg-black/[0.03]"
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-[#6e6e73]" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-[#6e6e73]" />
          )}
          <span className="text-sm font-medium text-[#1d1d1f]">{adset.name}</span>
          <span className="text-xs text-[#86868b]">
            {adset.ads.length} reklam
          </span>
        </div>
        <MetricCells m={adset.metrics} />
      </div>
      {expanded &&
        adset.ads.map((ad) => (
          <AdRow
            key={ad.adId}
            ad={ad}
            onAnalyze={onAnalyze}
            onOpenMedia={onOpenMedia}
            loading={analyzeLoadingId === ad.adId}
          />
        ))}
    </>
  );
}

function AdRow({
  ad,
  onAnalyze,
  onOpenMedia,
  loading,
}: {
  ad: CreativeRow;
  onAnalyze: (ad: CreativeRow) => void;
  onOpenMedia: (ad: CreativeRow, e: React.MouseEvent) => void;
  loading: boolean;
}) {
  const metrics: MetricBundle = {
    spend: ad.spend,
    impressions: ad.impressions,
    clicks: ad.clicks,
    linkClicks: ad.linkClicks,
    landingPageViews: ad.landingPageViews,
    purchases: ad.purchases,
    purchaseRevenue: ad.purchaseRevenue,
    ctr: ad.impressions > 0 ? ad.clicks / ad.impressions : null,
    cpc: ad.clicks > 0 ? ad.spend / ad.clicks : null,
    cpa: ad.purchases > 0 ? ad.spend / ad.purchases : null,
    roas: ad.spend > 0 ? ad.purchaseRevenue / ad.spend : null,
    cvr: ad.linkClicks > 0 ? ad.purchases / ad.linkClicks : null,
  };

  return (
    <div className="grid grid-cols-[1fr_80px_80px_80px_80px_80px_80px_80px] gap-2 px-4 py-2.5 pl-16">
      <div className="flex items-center gap-3 min-w-0">
        {ad.thumbnailUrl ? (
          <button
            onClick={(e) => onOpenMedia(ad, e)}
            className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-black/5"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={ad.thumbnailUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          </button>
        ) : (
          <div className="h-10 w-10 shrink-0 rounded-lg bg-black/5" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-[#1d1d1f]">{ad.adName}</p>
          <button
            onClick={() => onAnalyze(ad)}
            disabled={loading}
            className="mt-1 inline-flex items-center gap-1 rounded-full bg-black/[0.04] px-2 py-0.5 text-[11px] font-semibold text-[#1d1d1f] hover:bg-black/[0.08] disabled:opacity-50"
          >
            <Sparkles className="h-3 w-3" />
            {loading ? "Analyzuji…" : "Analyze"}
          </button>
        </div>
      </div>
      <MetricCells m={metrics} />
    </div>
  );
}
```

**⚠ Pozor:** `CreativeRow` musí mít `purchaseRevenue: number` a `linkClicks: number` (už má jako `linkClicks`). Přidej `purchaseRevenue` do `useCreativeAnalysis.ts` mapping + interface pokud ještě není (mělo by se stát v Task 3 Step 1).

**Step 2:** Typecheck:

```bash
bunx tsc --noEmit 2>&1 | grep -E "creatives-tree-view|error" | head -20 || echo "no errors"
```

Oprav jakékoliv type errory, které se objeví (typicky chybějící pole v `CreativeRow`).

**Step 3:** Commit:

```bash
git add "src/app/dashboard/[shopId]/creatives/creatives-tree-view.tsx"
git commit -m "feat(creatives): add hierarchical tree view component"
```

---

## Task 5: Integrace do stránky Kreativy — view toggle

**Files:**
- Modify: `src/app/dashboard/[shopId]/creatives/page.tsx`

**Step 1:** Přidej import komponenty:

```ts
import { CreativesTreeView } from "./creatives-tree-view";
```

**Step 2:** `viewMode` už existuje v komponentě (`"grid" | "table"`). Rozšiř typ o `"tree"`:

```ts
const [viewMode, setViewMode] = useState<"grid" | "table" | "tree">(() => {
  if (typeof window === "undefined") return "grid";
  const stored = localStorage.getItem("longnight-creatives-view-mode");
  if (stored === "table" || stored === "tree") return stored;
  return "grid";
});
```

**Step 3:** Najdi stávající view toggle (grep):

```bash
grep -nE "LayoutGrid|TableIcon|viewMode" src/app/dashboard/\[shopId\]/creatives/page.tsx | head -20
```

Přidej třetí button pro `"tree"`. Příklad (přidej vedle existujících grid/table buttonů):

```tsx
<button
  onClick={() => setViewMode("tree")}
  className={cn(
    "flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition-colors",
    viewMode === "tree"
      ? "bg-[#1d1d1f] text-white"
      : "text-[#6e6e73] hover:bg-black/[0.04]"
  )}
  aria-label="Strom"
>
  <ChevronRight className="h-4 w-4" />
  Strom
</button>
```

**Step 4:** V render sekci, kde se rozhoduje mezi grid a table, přidej třetí větev:

```tsx
{viewMode === "tree" ? (
  <CreativesTreeView
    ads={filtered}
    onAnalyze={(ad) => analyzeMutation.mutate(ad.adId)}
    onOpenMedia={openMedia}
    analyzeLoadingId={analyzeMutation.isPending ? analyzeMutation.variables : null}
  />
) : viewMode === "table" ? (
  /* existující tabulka */
) : (
  /* existující grid */
)}
```

**Poznámka:** Přesná forma ternárního výrazu musí zapadnout do existujícího JSX — přečti si strukturu kolem `{viewMode === "table" ? ... : ...}` v současném `page.tsx` a vlož `tree` větev nahoru.

**Step 5:** Typecheck + lint:

```bash
bunx tsc --noEmit 2>&1 | grep error | head -10 || echo "no errors"
bun run lint 2>&1 | tail -20
```

**Step 6:** Commit:

```bash
git add "src/app/dashboard/[shopId]/creatives/page.tsx"
git commit -m "feat(creatives): add tree view toggle to creatives page"
```

---

## Task 6: Search auto-expand (matches v reklamách rozbalí rodiče)

**Files:**
- Modify: `src/app/dashboard/[shopId]/creatives/creatives-tree-view.tsx`

**Step 1:** Přidej prop `autoExpandOnSearch?: boolean` a detekci změn `ads` (která implicitně odráží search filter).

Jednodušší cesta: přidej `useEffect` v `CreativesTreeView` který při změně `ads` (když je jich málo vzhledem k celku) rozbalí všechny rodiče. Ale to je křehké.

**Lepší cesta:** přidej prop `searchQuery: string` a pokud je neprázdný, rozbal všechny rodiče s alespoň jednou reklamou:

```tsx
interface CreativesTreeViewProps {
  ads: CreativeRow[];
  onAnalyze: (ad: CreativeRow) => void;
  onOpenMedia: (ad: CreativeRow, e: React.MouseEvent) => void;
  analyzeLoadingId?: string | null;
  searchQuery?: string;
}
```

```tsx
// Uvnitř komponenty, po tree useMemo:
useEffect(() => {
  if (searchQuery && searchQuery.trim().length > 0) {
    setExpandedCampaigns(new Set(tree.map((c) => c.id)));
    setExpandedAdSets(
      new Set(tree.flatMap((c) => c.adSets.map((s) => s.id)))
    );
  }
}, [searchQuery, tree]);
```

**Step 2:** V `page.tsx` předej `searchQuery={searchQuery}` do `<CreativesTreeView>`.

**Step 3:** Typecheck:

```bash
bunx tsc --noEmit 2>&1 | grep error | head -10 || echo "no errors"
```

**Step 4:** Commit:

```bash
git add "src/app/dashboard/[shopId]/creatives/creatives-tree-view.tsx" \
  "src/app/dashboard/[shopId]/creatives/page.tsx"
git commit -m "feat(creatives): auto-expand tree rows on active search"
```

---

## Task 7: Manuální smoke test

**Step 1:** Spusť dev server:

```bash
bun run dev
```

**Step 2:** Otevři `http://localhost:3000/dashboard/<shopId>/creatives`.

**Step 3:** Ověř:

- [ ] Toggle nahoře ukazuje tři varianty (Grid / Tabulka / Strom).
- [ ] Default je stále původní (grid nebo poslední volba z localStorage).
- [ ] Přepnutí na "Strom" ukazuje seznam kampaní se součty.
- [ ] Kliknutí na kampaň ji rozbalí → vidíš ad sety.
- [ ] Kliknutí na ad set → vidíš jednotlivé reklamy s thumbnaily.
- [ ] Součet spend ad setů v kampani = spend kampaně (jasně vizuálně).
- [ ] CTR kampaně **není** prostý průměr CTR reklam. Ověř na reálných datech: `SUM(clicks) / SUM(impressions)`.
- [ ] "Rozbalit vše" rozbalí všechny kampaně i ad sety.
- [ ] "Sbalit vše" schová všechno.
- [ ] Filtrace status/type stále funguje a strom se aktualizuje.
- [ ] Search ("abc") → rodiče se auto-rozbalí.
- [ ] Klik na Analyze na reklamě spustí analýzu.
- [ ] Refresh stránky → poslední volba view se drží (localStorage).

**Step 4:** Zkontroluj, že konzole neukazuje React warnings (key props, missing deps).

**Step 5:** Push:

```bash
git push
```

---

## Done criteria

- [ ] Migrace `campaign_id` / `adset_id` + sync je aktualizovaný a populuje je
- [ ] `CreativeRow` má `campaignId`, `adsetId`, `purchaseRevenue`
- [ ] `src/lib/creative-aggregation.ts` existuje s `aggregateMetrics` + `groupIntoTree`
- [ ] Testy `creative-aggregation.test.ts` procházejí (weighted CTR, zero-div guards, grouping)
- [ ] `CreativesTreeView` komponenta renderuje tři úrovně se správnými odsazeními
- [ ] `viewMode` v page.tsx podporuje `"tree"` a persistuje do localStorage
- [ ] Search auto-rozbaluje rodiče
- [ ] Smoke test prošel bez chyb
- [ ] Pushnuto do main
