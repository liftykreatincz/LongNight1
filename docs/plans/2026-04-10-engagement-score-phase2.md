# Engagement Score Phase 2 — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or superpowers:subagent-driven-development) to implement this plan task-by-task.

**Goal:** Add campaign segmentation (`evergreen` / `sale` / `seasonal` / `unknown`) + real video duration from Meta Graph API so Engagement Score benchmarks are calculated per segment with graceful fallback to the shared `all` benchmark.

**Architecture:** A pure classifier library (`src/lib/campaign-classifier/`) parses campaign names and dates to assign a type; Meta sync calls the classifier (never overwriting manual overrides) and fetches video length; `computeBenchmarks` produces segregated benchmarks with sample-size fallback; `resolveBenchmarks` helper chooses primary → `all` → default; `scoreCreative` returns `usedFallback` and `effectiveCampaignType`; UI exposes badges, filter chips, popover edits, unclassified banner, and enriched tooltip.

**Tech Stack:** Next.js 15 App Router, Supabase PostgreSQL + RLS, TanStack Query v5, TypeScript, Tailwind/shadcn, vitest (TDD), Meta Graph API v21, bun toolchain.

**Source design:** `docs/plans/2026-04-10-engagement-score-phase2-design.md`

---

## Task Dependency Graph

```
P2-1 (DB migration)
  ├─ P2-2 (classifier types + keywords)
  │    ├─ P2-3 (classifyByName + tests)
  │    ├─ P2-4 (classifyByDateRange + tests)
  │    └─ P2-5 (classifyCampaign orchestrator + tests)
  │         └─ P2-6 (Meta sync — campaign classification)
  │              └─ P2-7 (Meta sync — video length fetch)
  ├─ P2-8 (ScoreInput + row-adapter extension)
  │    ├─ P2-9 (score.ts — video_duration_seconds recalc)
  │    ├─ P2-10 (resolveBenchmarks helper + tests)
  │    │    └─ P2-11 (scoreCreative API change — benchmarksMap + usedFallback)
  │    └─ P2-12 (computeBenchmarks — segregation)
  │         └─ P2-13 (recompute-helper + endpoint update)
  ├─ P2-14 (useShopBenchmarks — Map<string, BenchmarkSet>)
  ├─ P2-15 (useCreativeAnalysis — campaignType + videoDurationSeconds)
  └─ P2-16 (creatives page — wire new hooks to scored useMemo)
       ├─ P2-17 (CampaignTypeBadge component + tests)
       ├─ P2-18 (CampaignTypePopover with save + invalidation)
       ├─ P2-19 (tree view — render CampaignTypeBadge on CampaignRow)
       ├─ P2-20 (filter chips row — campaign_type URL param)
       ├─ P2-21 (CPA popover — benchmark info row)
       ├─ P2-22 (unclassified banner + count query)
       ├─ P2-23 (EngagementBadge tooltip — type + fallback reason)
       ├─ P2-24 (/api/campaigns/reclassify endpoint)
       └─ P2-25 (Reclassify button on creatives toolbar)
P2-26 (Final verification + typecheck + lint + build + commit)
```

---

## P2-1: DB migration — campaign_type + video_duration + constraint

**Files:**
- Create: `supabase/migrations/20260410_engagement_score_phase2.sql`

**Step 1: Write the migration SQL**

```sql
-- Engagement Score Phase 2: campaign segmentation + real video duration

-- 1) Campaign type on campaigns
alter table public.meta_ad_campaigns
  add column if not exists campaign_type text not null default 'unknown'
    check (campaign_type in ('unknown','evergreen','sale','seasonal')),
  add column if not exists campaign_type_source text not null default 'auto'
    check (campaign_type_source in ('auto','manual')),
  add column if not exists campaign_type_classified_at timestamptz null;

create index if not exists meta_ad_campaigns_type_idx
  on public.meta_ad_campaigns (shop_id, campaign_type);

-- 2) Video duration on creatives
alter table public.meta_ad_creatives
  add column if not exists video_duration_seconds numeric null;

-- 3) Extend shop_benchmarks constraint to allow 'seasonal'
alter table public.shop_benchmarks
  drop constraint if exists shop_benchmarks_campaign_type_check;

alter table public.shop_benchmarks
  add constraint shop_benchmarks_campaign_type_check
    check (campaign_type in ('all','evergreen','sale','seasonal'));
```

**Step 2: Deploy via Supabase SQL Editor**

Ask user to paste and run in Supabase Dashboard → SQL Editor for LongNight project (ID: `ghodnzarypflppzzsmhm`). Wait for user confirmation ("ano", "hotovo") before proceeding.

**Step 3: Commit**

```bash
git add supabase/migrations/20260410_engagement_score_phase2.sql
git commit -m "feat(db): add campaign_type + video_duration_seconds for ES phase 2"
```

---

## P2-2: Classifier types + keywords

**Files:**
- Create: `src/lib/campaign-classifier/types.ts`
- Create: `src/lib/campaign-classifier/keywords.ts`
- Create: `src/lib/campaign-classifier/index.ts`

**Step 1: Create `types.ts`**

```ts
export type CampaignType = "unknown" | "evergreen" | "sale" | "seasonal";
export type ClassificationSource = "auto" | "manual";
export type ClassificationMatchedBy = "name" | "date" | "default";

export interface ClassificationResult {
  type: CampaignType;
  source: ClassificationSource;
  matchedBy: ClassificationMatchedBy;
}

export interface ClassifyInput {
  name: string;
  started_at?: Date | null;
  ended_at?: Date | null;
}
```

**Step 2: Create `keywords.ts`**

```ts
export const SALE_KEYWORDS = [
  "SALE", "SLEVA", "AKCE", "DISCOUNT",
  "VÝPRODEJ", "VYPRODEJ", "DEAL",
] as const;

export const SEASONAL_KEYWORDS = [
  "BF", "BLACKFRIDAY", "BLACK_FRIDAY", "BLACK-FRIDAY",
  "CYBERMONDAY", "CYBER_MONDAY",
  "XMAS", "VANOCE", "VÁNOCE", "CHRISTMAS",
  "VALENTYN", "VALENTINE", "DENMATEK", "DEN_MATEK",
  "VELIKONOCE", "EASTER", "HALLOWEEN",
  "NEWYEAR", "NEW_YEAR", "SILVESTR",
] as const;

export const DISCOUNT_REGEX = /-\d{1,2}\s?%/;
```

**Step 3: Create `index.ts` with barrel exports**

```ts
export * from "./types";
export * from "./keywords";
```

**Step 4: Typecheck**

Run: `/Users/jakubzelenka/.bun/bin/bunx tsc --noEmit`
Expected: clean (no new errors)

**Step 5: Commit**

```bash
git add src/lib/campaign-classifier/types.ts src/lib/campaign-classifier/keywords.ts src/lib/campaign-classifier/index.ts
git commit -m "feat(classifier): add campaign classifier types and default keywords"
```

---

## P2-3: classifyByName + tests

**Files:**
- Create: `src/lib/campaign-classifier/classify-name.ts`
- Create: `src/lib/campaign-classifier/classify-name.test.ts`
- Modify: `src/lib/campaign-classifier/index.ts`

**Step 1: Write failing tests**

```ts
// classify-name.test.ts
import { describe, it, expect } from "vitest";
import { classifyByName } from "./classify-name";

describe("classifyByName", () => {
  it("returns null for empty string", () => {
    expect(classifyByName("")).toBeNull();
  });

  it("returns null for plain campaign names", () => {
    expect(classifyByName("CBO - Pack3 - 530 Kč - L3")).toBeNull();
    expect(classifyByName("Prospecting Q1")).toBeNull();
  });

  it("detects SALE prefix case-insensitive", () => {
    expect(classifyByName("SALE_2025_winter")).toBe("sale");
    expect(classifyByName("sale_2025")).toBe("sale");
    expect(classifyByName("Sale Promotion")).toBe("sale");
  });

  it("detects SLEVA keyword", () => {
    expect(classifyByName("SLEVA 30%")).toBe("sale");
    expect(classifyByName("sleva_vanoce")).toBe("seasonal"); // seasonal wins
  });

  it("detects Czech keywords", () => {
    expect(classifyByName("AKCE leto")).toBe("sale");
    expect(classifyByName("VÝPRODEJ")).toBe("sale");
    expect(classifyByName("Vyprodej zbozi")).toBe("sale");
  });

  it("detects discount regex -XX%", () => {
    expect(classifyByName("Produkt -30% leto")).toBe("sale");
    expect(classifyByName("-50% dnes")).toBe("sale");
    expect(classifyByName("Sleva -5 %")).toBe("sale");
  });

  it("detects seasonal BF keyword", () => {
    expect(classifyByName("BF_2025")).toBe("seasonal");
    expect(classifyByName("BlackFriday weekend")).toBe("seasonal");
    expect(classifyByName("Black_Friday deal")).toBe("seasonal");
  });

  it("detects Christmas keywords", () => {
    expect(classifyByName("XMAS_drop")).toBe("seasonal");
    expect(classifyByName("VANOCE 2025")).toBe("seasonal");
    expect(classifyByName("Vánoce last chance")).toBe("seasonal");
  });

  it("seasonal has priority over sale in mixed names", () => {
    expect(classifyByName("BF_SALE_2025")).toBe("seasonal");
    expect(classifyByName("XMAS -40% drop")).toBe("seasonal");
  });

  it("handles spaces and underscores interchangeably", () => {
    expect(classifyByName("Black Friday deal")).toBe("seasonal");
    expect(classifyByName("Black-Friday")).toBe("seasonal");
  });

  it("matches substring inside longer name", () => {
    expect(classifyByName("Q4_BF_evergreen_test")).toBe("seasonal");
  });

  it("returns null for names containing BF as part of another word", () => {
    // "BFG" should NOT match BF — the regex uses word boundary approach via replace
    // NOTE: current implementation uses .includes() so this IS a known limitation
    // Document it:
    expect(classifyByName("PROBFG_campaign")).toBe("seasonal"); // known limitation
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `/Users/jakubzelenka/.bun/bin/bunx vitest run src/lib/campaign-classifier/classify-name.test.ts`
Expected: FAIL with "Cannot find module './classify-name'"

**Step 3: Implement `classify-name.ts`**

```ts
import type { CampaignType } from "./types";
import { SALE_KEYWORDS, SEASONAL_KEYWORDS, DISCOUNT_REGEX } from "./keywords";

export function classifyByName(name: string): CampaignType | null {
  if (!name) return null;
  const upper = name.toUpperCase().replace(/[\s-]+/g, "_");

  // Seasonal has priority (BF_SALE_2025 = seasonal, not sale)
  if (SEASONAL_KEYWORDS.some((k) => upper.includes(k))) return "seasonal";

  if (
    SALE_KEYWORDS.some((k) => upper.includes(k)) ||
    DISCOUNT_REGEX.test(name)
  ) {
    return "sale";
  }

  return null;
}
```

**Step 4: Add export to `index.ts`**

Append to `src/lib/campaign-classifier/index.ts`:

```ts
export * from "./classify-name";
```

**Step 5: Run tests to verify they pass**

Run: `/Users/jakubzelenka/.bun/bin/bunx vitest run src/lib/campaign-classifier/classify-name.test.ts`
Expected: all passing

**Step 6: Commit**

```bash
git add src/lib/campaign-classifier/classify-name.ts src/lib/campaign-classifier/classify-name.test.ts src/lib/campaign-classifier/index.ts
git commit -m "feat(classifier): add classifyByName with seasonal/sale keyword parser"
```

---

## P2-4: classifyByDateRange + tests

**Files:**
- Create: `src/lib/campaign-classifier/classify-date.ts`
- Create: `src/lib/campaign-classifier/classify-date.test.ts`
- Modify: `src/lib/campaign-classifier/index.ts`

**Step 1: Write failing tests**

```ts
// classify-date.test.ts
import { describe, it, expect } from "vitest";
import { classifyByDateRange } from "./classify-date";

describe("classifyByDateRange", () => {
  it("returns null when startedAt is missing", () => {
    expect(classifyByDateRange(null, null)).toBeNull();
    expect(classifyByDateRange(undefined, new Date("2025-11-20"))).toBeNull();
  });

  it("returns null for an active evergreen campaign (no end, > 45 days)", () => {
    const start = new Date("2025-01-01");
    const now = new Date("2025-06-01");
    expect(classifyByDateRange(start, null)).toBeNull();
    // Active campaigns without end date fall through to default
  });

  it("detects seasonal campaign starting in November ≤ 45 days", () => {
    const start = new Date("2025-11-20");
    const end = new Date("2025-12-10"); // 20 days
    expect(classifyByDateRange(start, end)).toBe("seasonal");
  });

  it("detects seasonal campaign starting in December ≤ 45 days", () => {
    const start = new Date("2025-12-01");
    const end = new Date("2025-12-26"); // 25 days
    expect(classifyByDateRange(start, end)).toBe("seasonal");
  });

  it("does NOT detect seasonal in January", () => {
    const start = new Date("2025-01-05");
    const end = new Date("2025-01-25"); // 20 days
    // falls through to sale branch (short and ended) → sale
    expect(classifyByDateRange(start, end)).toBe("sale");
  });

  it("detects sale for campaign ≤ 14 days", () => {
    const start = new Date("2025-06-01");
    const end = new Date("2025-06-10"); // 9 days
    expect(classifyByDateRange(start, end)).toBe("sale");
  });

  it("returns null for long-lived campaign that ended", () => {
    const start = new Date("2024-01-01");
    const end = new Date("2025-01-01"); // 365 days
    expect(classifyByDateRange(start, end)).toBeNull();
  });

  it("returns null for seasonal November window that was > 45 days", () => {
    const start = new Date("2025-11-01");
    const end = new Date("2026-01-15"); // 75 days
    expect(classifyByDateRange(start, end)).toBeNull();
  });
});
```

**Step 2: Run tests — FAIL**

Run: `/Users/jakubzelenka/.bun/bin/bunx vitest run src/lib/campaign-classifier/classify-date.test.ts`
Expected: FAIL

**Step 3: Implement `classify-date.ts`**

```ts
import type { CampaignType } from "./types";

const DAY_MS = 86_400_000;
const SALE_MAX_DAYS = 14;
const SEASONAL_MAX_DAYS = 45;

export function classifyByDateRange(
  startedAt?: Date | null,
  endedAt?: Date | null
): CampaignType | null {
  if (!startedAt) return null;
  const end = endedAt ?? null;

  // Seasonal window: November (month 10) or December (month 11), ≤ 45 days, with known end
  if (end) {
    const days = Math.round((end.getTime() - startedAt.getTime()) / DAY_MS);
    const startMonth = startedAt.getUTCMonth(); // 0-based: Nov=10, Dec=11
    if ((startMonth === 10 || startMonth === 11) && days >= 0 && days <= SEASONAL_MAX_DAYS) {
      return "seasonal";
    }
    if (days >= 0 && days <= SALE_MAX_DAYS) {
      return "sale";
    }
  }

  return null;
}
```

**Step 4: Add export to index**

Append to `src/lib/campaign-classifier/index.ts`:

```ts
export * from "./classify-date";
```

**Step 5: Run tests — PASS**

Run: `/Users/jakubzelenka/.bun/bin/bunx vitest run src/lib/campaign-classifier/classify-date.test.ts`

**Step 6: Commit**

```bash
git add src/lib/campaign-classifier/classify-date.ts src/lib/campaign-classifier/classify-date.test.ts src/lib/campaign-classifier/index.ts
git commit -m "feat(classifier): add classifyByDateRange date-heuristic fallback"
```

---

## P2-5: classifyCampaign orchestrator + tests

**Files:**
- Create: `src/lib/campaign-classifier/classify.ts`
- Create: `src/lib/campaign-classifier/classify.test.ts`
- Modify: `src/lib/campaign-classifier/index.ts`

**Step 1: Write failing tests**

```ts
// classify.test.ts
import { describe, it, expect } from "vitest";
import { classifyCampaign } from "./classify";

describe("classifyCampaign", () => {
  it("prioritizes name over date", () => {
    const result = classifyCampaign({
      name: "BF_2025",
      started_at: new Date("2025-01-01"),
      ended_at: new Date("2025-01-05"),
    });
    expect(result).toEqual({ type: "seasonal", source: "auto", matchedBy: "name" });
  });

  it("falls back to date when name gives nothing", () => {
    const result = classifyCampaign({
      name: "Evergreen Q4",
      started_at: new Date("2025-11-20"),
      ended_at: new Date("2025-12-10"),
    });
    expect(result).toEqual({ type: "seasonal", source: "auto", matchedBy: "date" });
  });

  it("falls back to evergreen default when nothing matches", () => {
    const result = classifyCampaign({
      name: "CBO - Pack3 - 530 Kč",
      started_at: new Date("2025-01-01"),
      ended_at: null,
    });
    expect(result).toEqual({ type: "evergreen", source: "auto", matchedBy: "default" });
  });

  it("handles missing dates gracefully", () => {
    const result = classifyCampaign({ name: "SALE_summer" });
    expect(result).toEqual({ type: "sale", source: "auto", matchedBy: "name" });
  });

  it("defaults to evergreen for fully empty input", () => {
    const result = classifyCampaign({ name: "" });
    expect(result).toEqual({ type: "evergreen", source: "auto", matchedBy: "default" });
  });
});
```

**Step 2: Run — FAIL**

Run: `/Users/jakubzelenka/.bun/bin/bunx vitest run src/lib/campaign-classifier/classify.test.ts`

**Step 3: Implement `classify.ts`**

```ts
import type { ClassificationResult, ClassifyInput } from "./types";
import { classifyByName } from "./classify-name";
import { classifyByDateRange } from "./classify-date";

export function classifyCampaign(input: ClassifyInput): ClassificationResult {
  const byName = classifyByName(input.name);
  if (byName) {
    return { type: byName, source: "auto", matchedBy: "name" };
  }

  const byDate = classifyByDateRange(input.started_at, input.ended_at);
  if (byDate) {
    return { type: byDate, source: "auto", matchedBy: "date" };
  }

  return { type: "evergreen", source: "auto", matchedBy: "default" };
}
```

**Step 4: Add export**

Append to `src/lib/campaign-classifier/index.ts`:

```ts
export * from "./classify";
```

**Step 5: Run — PASS**

**Step 6: Commit**

```bash
git add src/lib/campaign-classifier/classify.ts src/lib/campaign-classifier/classify.test.ts src/lib/campaign-classifier/index.ts
git commit -m "feat(classifier): add classifyCampaign orchestrator (name → date → default)"
```

---

## P2-6: Meta sync — classify campaigns during sync

**Files:**
- Modify: `src/app/api/creatives/sync/route.ts`

**Step 1: Locate campaign upsert logic**

Grep for `meta_ad_campaigns` in the file and identify the upsert block.

**Step 2: Wire the classifier**

Before upsert of a campaign row, check for existing manual override and call classifier:

```ts
import { classifyCampaign } from "@/lib/campaign-classifier";

// Inside the campaign sync loop, BEFORE upserting a campaign row:
const { data: existingCampaign } = await supabase
  .from("meta_ad_campaigns")
  .select("campaign_type, campaign_type_source")
  .eq("id", metaCampaign.id)
  .maybeSingle();

let campaignType = existingCampaign?.campaign_type ?? "unknown";
let campaignTypeSource = existingCampaign?.campaign_type_source ?? "auto";
let classifiedAt: string | null = null;

if (existingCampaign?.campaign_type_source !== "manual") {
  const result = classifyCampaign({
    name: metaCampaign.name ?? "",
    started_at: metaCampaign.start_time ? new Date(metaCampaign.start_time) : null,
    ended_at: metaCampaign.stop_time ? new Date(metaCampaign.stop_time) : null,
  });
  campaignType = result.type;
  campaignTypeSource = "auto";
  classifiedAt = new Date().toISOString();
}

// Add to upsert payload:
// campaign_type: campaignType,
// campaign_type_source: campaignTypeSource,
// campaign_type_classified_at: classifiedAt,
```

**Step 3: Typecheck + lint**

Run: `/Users/jakubzelenka/.bun/bin/bunx tsc --noEmit && /Users/jakubzelenka/.bun/bin/bunx next lint --file src/app/api/creatives/sync/route.ts`
Expected: clean

**Step 4: Commit**

```bash
git add src/app/api/creatives/sync/route.ts
git commit -m "feat(meta-sync): classify campaigns on sync (respecting manual overrides)"
```

---

## P2-7: Meta sync — fetch video length for video creatives

**Files:**
- Modify: `src/app/api/creatives/sync/route.ts`

**Step 1: Locate creative upsert loop**

Find where `meta_ad_creatives` rows are upserted.

**Step 2: Add video length fetch**

For creatives with `creative_type === "video"`, when `video_duration_seconds` is null or this is the first fetch, call Graph API:

```ts
async function fetchVideoDuration(
  adCreativeId: string,
  accessToken: string
): Promise<number | null> {
  try {
    const creativeRes = await fetch(
      `https://graph.facebook.com/v21.0/${adCreativeId}?fields=video_id&access_token=${accessToken}`
    );
    if (!creativeRes.ok) return null;
    const creative = await creativeRes.json();
    const videoId = creative.video_id;
    if (!videoId) return null;

    const videoRes = await fetch(
      `https://graph.facebook.com/v21.0/${videoId}?fields=length&access_token=${accessToken}`
    );
    if (!videoRes.ok) return null;
    const video = await videoRes.json();
    const len = Number(video.length);
    return Number.isFinite(len) && len > 0 ? len : null;
  } catch {
    return null;
  }
}

// Inside creative upsert loop:
let videoDurationSeconds: number | null = null;
if (creativeType === "video") {
  videoDurationSeconds = await fetchVideoDuration(adCreativeId, accessToken);
}

// Add to upsert payload: video_duration_seconds: videoDurationSeconds,
```

**Step 3: Verify non-fatal behavior**

Read the code: confirm that a `null` result doesn't break the sync loop. The helper swallows errors.

**Step 4: Typecheck**

Run: `/Users/jakubzelenka/.bun/bin/bunx tsc --noEmit`

**Step 5: Commit**

```bash
git add src/app/api/creatives/sync/route.ts
git commit -m "feat(meta-sync): fetch video_duration_seconds from Graph API (non-fatal)"
```

---

## P2-8: ScoreInput + row-adapter extension

**Files:**
- Modify: `src/lib/engagement-score/types.ts`
- Modify: `src/lib/engagement-score/row-adapter.ts`
- Modify: `src/hooks/useCreativeAnalysis.ts` (interface only — extending CreativeRow)

**Step 1: Extend `ScoreInput` in `types.ts`**

Add fields:

```ts
import type { CampaignType } from "@/lib/campaign-classifier";

export interface ScoreInput {
  // ... existing fields ...
  campaignType: CampaignType;
  videoDurationSeconds: number | null;
}
```

**Step 2: Extend `CreativeRow` in `useCreativeAnalysis.ts`**

```ts
import type { CampaignType } from "@/lib/campaign-classifier";

export interface CreativeRow {
  // ... existing fields ...
  campaignType: CampaignType;
  campaignTypeSource: "auto" | "manual";
  videoDurationSeconds: number | null;
}
```

Update the query SELECT to JOIN `meta_ad_campaigns` and tahat `campaign_type`, `campaign_type_source` + `video_duration_seconds` from `meta_ad_creatives`.

Update the mapping:
```ts
campaignType: (r.meta_ad_campaigns?.campaign_type ?? "unknown") as CampaignType,
campaignTypeSource: (r.meta_ad_campaigns?.campaign_type_source ?? "auto") as "auto"|"manual",
videoDurationSeconds: r.video_duration_seconds != null ? Number(r.video_duration_seconds) : null,
```

**Step 3: Update `row-adapter.ts`**

```ts
export function creativeRowToScoreInput(row: CreativeRow): ScoreInput {
  return {
    // ... existing fields ...
    campaignType: row.campaignType,
    videoDurationSeconds: row.videoDurationSeconds,
  };
}
```

**Step 4: Typecheck**

Run: `/Users/jakubzelenka/.bun/bin/bunx tsc --noEmit`
Expected: may surface follow-up errors in tests using `ScoreInput` — fix next.

**Step 5: Fix test-file factories**

Search for `ScoreInput` literal objects in tests:
Run: `grep -rn "ScoreInput" src/lib/ src/components/ src/app/`
Update each to include `campaignType: "all"` (use string literal — test helper) and `videoDurationSeconds: null`.

**Step 6: Typecheck again — clean**

**Step 7: Commit**

```bash
git add src/lib/engagement-score/types.ts src/lib/engagement-score/row-adapter.ts src/hooks/useCreativeAnalysis.ts src/lib/engagement-score/*.test.ts src/lib/creative-aggregation.test.ts
git commit -m "feat(score): extend ScoreInput and CreativeRow with campaignType + videoDurationSeconds"
```

---

## P2-9: score.ts — real video_duration recalculation

**Files:**
- Modify: `src/lib/engagement-score/score.ts`
- Modify: `src/lib/engagement-score/score.test.ts`

**Step 1: Write failing test**

Add to `score.test.ts`:

```ts
describe("avg_watch_pct calculation", () => {
  it("uses real video_duration_seconds when provided", () => {
    const input: ScoreInput = {
      // ... base video input with videoAvgWatchTime: 30 ...
      videoDurationSeconds: 60, // 60s video
    };
    // expect avg_watch_pct ~ 50% via the normalization / scoring chain
    const result = scoreCreative(input, fakeBenchmarks, 300);
    // assert: exposed engagement metrics reflect 30/60 = 50%
    // (or test helper that exposes computed avg_watch_pct)
  });

  it("falls back to /15 proxy when videoDurationSeconds is null", () => {
    const input: ScoreInput = {
      // videoAvgWatchTime: 7.5, videoDurationSeconds: null
    };
    // expect avg_watch_pct = 50% via proxy (7.5/15*100)
    const result = scoreCreative(input, fakeBenchmarks, 300);
    // assert same
  });
});
```

Since score.ts doesn't directly expose avg_watch_pct, the cleanest test is to export an internal helper `computeAvgWatchPct(input)` and test it:

```ts
// score.ts export:
export function computeAvgWatchPct(input: ScoreInput): number {
  if (input.videoDurationSeconds && input.videoDurationSeconds > 0) {
    return (input.videoAvgWatchTime / input.videoDurationSeconds) * 100;
  }
  return (input.videoAvgWatchTime / 15) * 100;
}
```

Then test it directly:

```ts
import { computeAvgWatchPct } from "./score";

describe("computeAvgWatchPct", () => {
  it("uses real duration when provided", () => {
    expect(
      computeAvgWatchPct({ videoAvgWatchTime: 30, videoDurationSeconds: 60 } as any)
    ).toBe(50);
  });
  it("falls back to /15 when null", () => {
    expect(
      computeAvgWatchPct({ videoAvgWatchTime: 7.5, videoDurationSeconds: null } as any)
    ).toBe(50);
  });
  it("falls back to /15 when 0", () => {
    expect(
      computeAvgWatchPct({ videoAvgWatchTime: 7.5, videoDurationSeconds: 0 } as any)
    ).toBe(50);
  });
});
```

**Step 2: Run — FAIL**

**Step 3: Implement**

Add `computeAvgWatchPct` to `score.ts` and replace the inline `/ 15` calculation in `scoreCreative` with a call to this helper.

**Step 4: Run — PASS**

Run: `/Users/jakubzelenka/.bun/bin/bunx vitest run src/lib/engagement-score/score.test.ts`

**Step 5: Commit**

```bash
git add src/lib/engagement-score/score.ts src/lib/engagement-score/score.test.ts
git commit -m "feat(score): use real video_duration_seconds for avg_watch_pct with proxy fallback"
```

---

## P2-10: resolveBenchmarks helper + tests

**Files:**
- Create: `src/lib/engagement-score/resolve-benchmarks.ts`
- Create: `src/lib/engagement-score/resolve-benchmarks.test.ts`
- Modify: `src/lib/engagement-score/index.ts`

**Step 1: Write failing test**

```ts
import { describe, it, expect } from "vitest";
import { resolveBenchmarks } from "./resolve-benchmarks";
import type { BenchmarkSet } from "./types";

function makeSet(sample_size: number, marker = "X"): BenchmarkSet {
  return {
    sample_size,
    metrics: { marker } as any, // test-only tag
  } as any as BenchmarkSet;
}

describe("resolveBenchmarks", () => {
  it("returns primary when sample_size >= 15", () => {
    const map = new Map<string, BenchmarkSet>();
    map.set("video:sale", makeSet(20, "sale"));
    map.set("video:all", makeSet(100, "all"));
    const r = resolveBenchmarks(map, "video", "sale");
    expect(r.usedFallback).toBe(false);
    expect(r.effectiveCampaignType).toBe("sale");
    expect((r.set as any).metrics.marker).toBe("sale");
  });

  it("falls back to all when primary sample too small", () => {
    const map = new Map<string, BenchmarkSet>();
    map.set("video:sale", makeSet(5, "sale"));
    map.set("video:all", makeSet(100, "all"));
    const r = resolveBenchmarks(map, "video", "sale");
    expect(r.usedFallback).toBe(true);
    expect(r.effectiveCampaignType).toBe("all");
    expect(r.fallbackReason).toContain("sale");
  });

  it("falls back to all when primary missing entirely", () => {
    const map = new Map<string, BenchmarkSet>();
    map.set("video:all", makeSet(100, "all"));
    const r = resolveBenchmarks(map, "video", "seasonal");
    expect(r.usedFallback).toBe(true);
    expect(r.effectiveCampaignType).toBe("all");
  });

  it("marks unknown campaign type with specific reason", () => {
    const map = new Map<string, BenchmarkSet>();
    map.set("video:all", makeSet(100, "all"));
    const r = resolveBenchmarks(map, "video", "unknown");
    expect(r.usedFallback).toBe(true);
    expect(r.fallbackReason).toContain("klasifikov");
  });

  it("returns default agency benchmark when all is missing", () => {
    const map = new Map<string, BenchmarkSet>();
    const r = resolveBenchmarks(map, "video", "sale");
    expect(r.usedFallback).toBe(true);
    expect(r.effectiveCampaignType).toBe("all");
    expect(r.fallbackReason).toContain("Výchozí");
  });
});
```

**Step 2: Run — FAIL**

**Step 3: Implement**

```ts
// resolve-benchmarks.ts
import type { CampaignType } from "@/lib/campaign-classifier";
import type { BenchmarkSet, CreativeFormat } from "./types";
import { DEFAULT_AGENCY_BENCHMARKS } from "./defaults";

export interface ResolvedBenchmarks {
  set: BenchmarkSet;
  usedFallback: boolean;
  fallbackReason: string | null;
  effectiveCampaignType: CampaignType | "all";
}

const MIN_SAMPLE_SIZE = 15;

export function resolveBenchmarks(
  benchmarks: Map<string, BenchmarkSet>,
  format: CreativeFormat,
  campaignType: CampaignType
): ResolvedBenchmarks {
  const primaryKey = `${format}:${campaignType}`;
  const primary = benchmarks.get(primaryKey);
  if (primary && primary.sample_size >= MIN_SAMPLE_SIZE) {
    return {
      set: primary,
      usedFallback: false,
      fallbackReason: null,
      effectiveCampaignType: campaignType,
    };
  }

  const fallback = benchmarks.get(`${format}:all`);
  if (fallback) {
    const reason =
      campaignType === "unknown"
        ? "Kampaň není klasifikovaná"
        : `Málo dat v segmentu ${campaignType} (n=${primary?.sample_size ?? 0})`;
    return {
      set: fallback,
      usedFallback: true,
      fallbackReason: reason,
      effectiveCampaignType: "all",
    };
  }

  return {
    set: DEFAULT_AGENCY_BENCHMARKS[format],
    usedFallback: true,
    fallbackReason: "Výchozí agenturní benchmark",
    effectiveCampaignType: "all",
  };
}
```

**Step 4: Add export**

Append to `src/lib/engagement-score/index.ts`:
```ts
export * from "./resolve-benchmarks";
```

**Step 5: Run — PASS**

**Step 6: Commit**

```bash
git add src/lib/engagement-score/resolve-benchmarks.ts src/lib/engagement-score/resolve-benchmarks.test.ts src/lib/engagement-score/index.ts
git commit -m "feat(score): add resolveBenchmarks with primary → all → default chain"
```

---

## P2-11: scoreCreative API change — accept benchmarks Map, return usedFallback

**Files:**
- Modify: `src/lib/engagement-score/score.ts`
- Modify: `src/lib/engagement-score/score.test.ts`
- Modify: `src/lib/engagement-score/types.ts` (EngagementResult)

**Step 1: Extend EngagementResult type**

```ts
export interface EngagementResult {
  // ... existing fields ...
  usedFallback: boolean;
  fallbackReason: string | null;
  effectiveCampaignType: CampaignType | "all";
}
```

**Step 2: Update scoreCreative signature**

Change:
```ts
// OLD:
export function scoreCreative(input: ScoreInput, benchmarks: BenchmarkSet, cpaTarget: number): EngagementResult

// NEW:
export function scoreCreative(
  input: ScoreInput,
  benchmarks: Map<string, BenchmarkSet>,
  cpaTarget: number
): EngagementResult {
  const resolved = resolveBenchmarks(benchmarks, input.creativeType, input.campaignType);
  // ... existing pipeline against resolved.set ...
  return {
    // ... existing fields ...
    usedFallback: resolved.usedFallback,
    fallbackReason: resolved.fallbackReason,
    effectiveCampaignType: resolved.effectiveCampaignType,
  };
}
```

**Step 3: Update existing tests**

All `scoreCreative` test fixtures now build a Map:
```ts
const benchmarksMap = new Map<string, BenchmarkSet>();
benchmarksMap.set("video:evergreen", fakeSet);
benchmarksMap.set("video:all", fakeSet);
```

Add expectations for `usedFallback`, `fallbackReason`, `effectiveCampaignType`.

**Step 4: Run — PASS**

Run: `/Users/jakubzelenka/.bun/bin/bunx vitest run src/lib/engagement-score/`

**Step 5: Commit**

```bash
git add src/lib/engagement-score/score.ts src/lib/engagement-score/score.test.ts src/lib/engagement-score/types.ts
git commit -m "feat(score): scoreCreative accepts benchmarks Map with fallback metadata"
```

---

## P2-12: computeBenchmarks — segmented benchmark generation

**Files:**
- Modify: `src/lib/engagement-score/compute-benchmarks.ts`
- Modify: `src/lib/engagement-score/compute-benchmarks.test.ts`

**Step 1: Add failing test**

```ts
describe("computeBenchmarks with segmentation", () => {
  it("computes separate benchmarks per segment when sample >= 15", () => {
    const creatives = [
      ...Array.from({ length: 20 }, () => mkRow({ format: "video", campaign_type: "sale" })),
      ...Array.from({ length: 20 }, () => mkRow({ format: "video", campaign_type: "evergreen" })),
    ];
    const result = computeBenchmarks(creatives);
    // expect 3 sets for video: all + sale + evergreen
    expect(result.find((r) => r.format === "video" && r.campaign_type === "sale")).toBeDefined();
    expect(result.find((r) => r.format === "video" && r.campaign_type === "evergreen")).toBeDefined();
    expect(result.find((r) => r.format === "video" && r.campaign_type === "all")).toBeDefined();
  });

  it("skips segment under 15 but still produces all", () => {
    const creatives = [
      ...Array.from({ length: 3 }, () => mkRow({ format: "video", campaign_type: "sale" })),
      ...Array.from({ length: 20 }, () => mkRow({ format: "video", campaign_type: "evergreen" })),
    ];
    const result = computeBenchmarks(creatives);
    expect(result.find((r) => r.format === "video" && r.campaign_type === "sale")).toBeUndefined();
    expect(result.find((r) => r.format === "video" && r.campaign_type === "evergreen")).toBeDefined();
    expect(result.find((r) => r.format === "video" && r.campaign_type === "all")).toBeDefined();
  });
});
```

**Step 2: Run — FAIL**

**Step 3: Implement**

Refactor `computeBenchmarks` to iterate `FORMATS × ["all", "evergreen", "sale", "seasonal"]`. For `all`, use every row matching the format. For each specific segment, filter by `campaign_type`. Skip segment if `< 15`.

Keep existing percentile computation per metric intact; wrap in the new loop.

Return shape includes `campaign_type` on each benchmark row (already supported by DB).

**Step 4: Run — PASS**

Run: `/Users/jakubzelenka/.bun/bin/bunx vitest run src/lib/engagement-score/compute-benchmarks.test.ts`

**Step 5: Commit**

```bash
git add src/lib/engagement-score/compute-benchmarks.ts src/lib/engagement-score/compute-benchmarks.test.ts
git commit -m "feat(score): segment benchmarks by campaign_type with < 15 skip"
```

---

## P2-13: recompute-helper + endpoint — pass segmentation through

**Files:**
- Modify: `src/lib/engagement-score/recompute-helper.ts`
- Modify: `src/app/api/benchmarks/recompute/route.ts`

**Step 1: Update recompute-helper**

Ensure the helper pulls `campaign_type` from the creative rows (via JOIN) and passes to `computeBenchmarks`. The upsert to `shop_benchmarks` must write `campaign_type` field from each result.

Code shape:

```ts
const { data: creatives } = await supabase
  .from("meta_ad_creatives")
  .select(`
    *,
    meta_ad_campaigns!inner(campaign_type)
  `)
  .eq("shop_id", shopId);

const rows = creatives.map((c) => ({
  ...c,
  campaign_type: c.meta_ad_campaigns?.campaign_type ?? "unknown",
}));

const benchmarks = computeBenchmarks(rows);

await supabase
  .from("shop_benchmarks")
  .delete()
  .eq("shop_id", shopId);

await supabase
  .from("shop_benchmarks")
  .insert(benchmarks.map((b) => ({ shop_id: shopId, ...b })));
```

**Step 2: Typecheck + run existing tests**

Run: `/Users/jakubzelenka/.bun/bin/bunx tsc --noEmit && /Users/jakubzelenka/.bun/bin/bunx vitest run`

**Step 3: Commit**

```bash
git add src/lib/engagement-score/recompute-helper.ts src/app/api/benchmarks/recompute/route.ts
git commit -m "feat(score): recompute helper writes segmented benchmark rows"
```

---

## P2-14: useShopBenchmarks — return Map

**Files:**
- Modify: `src/hooks/useShopBenchmarks.ts`

**Step 1: Update query + return type**

```ts
export function useShopBenchmarks(shopId: string) {
  return useQuery({
    queryKey: ["shop-benchmarks", shopId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("shop_benchmarks")
        .select("*")
        .eq("shop_id", shopId);
      if (error) throw error;
      const map = new Map<string, BenchmarkSet>();
      for (const row of data ?? []) {
        const key = `${row.format}:${row.campaign_type}`;
        // reduce per-metric rows into a BenchmarkSet; existing logic adapted
        // ...
        map.set(key, buildSetFromRows(rowsForKey));
      }
      return map;
    },
    staleTime: 5 * 60 * 1000,
  });
}
```

Keep backward compat: if no rows, return empty Map (not null).

**Step 2: Typecheck**

Run: `/Users/jakubzelenka/.bun/bin/bunx tsc --noEmit`

**Step 3: Commit**

```bash
git add src/hooks/useShopBenchmarks.ts
git commit -m "feat(hooks): useShopBenchmarks returns Map<format:campaign_type, BenchmarkSet>"
```

---

## P2-15: useCreativeAnalysis — JOIN campaign_type + videoDurationSeconds

**Files:**
- Modify: `src/hooks/useCreativeAnalysis.ts`

Already partially done in P2-8, but now verify the Supabase query actually JOINs and returns the nested campaign row.

**Step 1: Update select**

```ts
const { data } = await supabase
  .from("meta_ad_creatives")
  .select(`
    *,
    meta_ad_campaigns!inner(id, name, campaign_type, campaign_type_source)
  `)
  .eq("shop_id", shopId);
```

**Step 2: Typecheck**

Run: `/Users/jakubzelenka/.bun/bin/bunx tsc --noEmit`

**Step 3: Commit**

```bash
git add src/hooks/useCreativeAnalysis.ts
git commit -m "feat(hooks): useCreativeAnalysis joins meta_ad_campaigns for campaign_type"
```

---

## P2-16: Creatives page — wire Map benchmarks into scored useMemo

**Files:**
- Modify: `src/app/dashboard/[shopId]/creatives/page.tsx`

**Step 1: Update scored useMemo**

Change from single benchmark set to Map:

```ts
const { data: benchmarksMap } = useShopBenchmarks(shopId); // now a Map
const scored = useMemo<ScoredCreativeRow[]>(() => {
  if (!creatives || !benchmarksMap) return [];
  return creatives.map((c) => ({
    ...c,
    engagement: scoreCreative(
      creativeRowToScoreInput(c),
      benchmarksMap,
      cpaTarget
    ),
  }));
}, [creatives, benchmarksMap, cpaTarget]);
```

**Step 2: Typecheck + run build**

Run: `/Users/jakubzelenka/.bun/bin/bunx tsc --noEmit`

**Step 3: Commit**

```bash
git add src/app/dashboard/[shopId]/creatives/page.tsx
git commit -m "feat(creatives): wire benchmarks Map into scored useMemo"
```

---

## P2-17: CampaignTypeBadge component + tests

**Files:**
- Create: `src/components/creatives/campaign-type-badge.tsx`
- Create: `src/components/creatives/campaign-type-badge.test.tsx`

**Step 1: Write failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { CampaignTypeBadge } from "./campaign-type-badge";

describe("CampaignTypeBadge", () => {
  it("renders evergreen label and leaf-ish text", () => {
    render(<CampaignTypeBadge type="evergreen" source="auto" />);
    expect(screen.getByText(/evergreen/i)).toBeInTheDocument();
  });
  it("renders sale label", () => {
    render(<CampaignTypeBadge type="sale" source="manual" />);
    expect(screen.getByText(/sale/i)).toBeInTheDocument();
  });
  it("renders seasonal label", () => {
    render(<CampaignTypeBadge type="seasonal" source="auto" />);
    expect(screen.getByText(/seasonal|sezón/i)).toBeInTheDocument();
  });
  it("renders unknown with warning marker", () => {
    render(<CampaignTypeBadge type="unknown" source="auto" />);
    expect(screen.getByText(/neklasifikován|unknown/i)).toBeInTheDocument();
  });
});
```

**Step 2: Run — FAIL**

**Step 3: Implement**

```tsx
"use client";
import { Leaf, Tag, Snowflake, HelpCircle } from "lucide-react";
import type { CampaignType } from "@/lib/campaign-classifier";

interface Props {
  type: CampaignType;
  source: "auto" | "manual";
  onClick?: () => void;
}

const CONFIG: Record<CampaignType, { label: string; color: string; bg: string; Icon: typeof Leaf }> = {
  evergreen: { label: "Evergreen", color: "#0071e3", bg: "#e6f0ff", Icon: Leaf },
  sale:      { label: "Sale",      color: "#ff9f0a", bg: "#fff5e0", Icon: Tag },
  seasonal:  { label: "Sezónní",   color: "#bf5af2", bg: "#f4e8ff", Icon: Snowflake },
  unknown:   { label: "Neklasifikováno", color: "#86868b", bg: "#f5f5f7", Icon: HelpCircle },
};

export function CampaignTypeBadge({ type, source, onClick }: Props) {
  const { label, color, bg, Icon } = CONFIG[type];
  const clickable = Boolean(onClick);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
        type === "unknown" ? "animate-pulse border border-dashed" : ""
      } ${clickable ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}
      style={{ color, backgroundColor: bg, borderColor: color }}
      title={source === "manual" ? "Nastaveno manuálně" : "Auto-klasifikováno"}
    >
      <Icon className="h-3 w-3" />
      {label}
    </button>
  );
}
```

**Step 4: Run — PASS**

**Step 5: Commit**

```bash
git add src/components/creatives/campaign-type-badge.tsx src/components/creatives/campaign-type-badge.test.tsx
git commit -m "feat(ui): add CampaignTypeBadge with evergreen/sale/seasonal/unknown variants"
```

---

## P2-18: CampaignTypePopover — edit + save + invalidate

**Files:**
- Create: `src/components/creatives/campaign-type-popover.tsx`

**Step 1: Implement**

```tsx
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
    qc.invalidateQueries({ queryKey: ["creatives", shopId] });
    qc.invalidateQueries({ queryKey: ["shop-benchmarks", shopId] });
    qc.invalidateQueries({ queryKey: ["unclassified-campaigns", shopId] });
    setOpen(false);
  }

  return (
    <div className="relative inline-block">
      <CampaignTypeBadge type={currentType} source={currentSource} onClick={() => setOpen((o) => !o)} />
      {open && (
        <div className="absolute left-0 top-full mt-1 z-30 w-60 rounded-xl border border-[#d2d2d7] bg-white p-3 shadow-lg">
          <p className="text-[11px] text-[#6e6e73] mb-2">
            {currentSource === "manual"
              ? `Manuálně ${classifiedAt ? new Date(classifiedAt).toLocaleDateString("cs-CZ") : ""}`
              : "Auto-klasifikováno"}
          </p>
          <div className="space-y-1">
            {(["evergreen", "sale", "seasonal", "unknown"] as CampaignType[]).map((t) => (
              <label key={t} className="flex items-center gap-2 text-xs cursor-pointer">
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
```

**Step 2: Typecheck + commit**

```bash
git add src/components/creatives/campaign-type-popover.tsx
git commit -m "feat(ui): add CampaignTypePopover with save + query invalidation"
```

---

## P2-19: Tree view — render CampaignTypePopover on CampaignRow

**Files:**
- Modify: `src/app/dashboard/[shopId]/creatives/creatives-tree-view.tsx`

**Step 1: Update CampaignRow props**

Thread `campaignType`, `campaignTypeSource`, `classifiedAt`, `shopId` through `CampaignRow` prop typing.

**Step 2: Render badge popover**

Inside CampaignRow header layout, next to campaign name:

```tsx
<CampaignTypePopover
  campaignId={campaign.id}
  shopId={shopId}
  currentType={campaignType}
  currentSource={campaignTypeSource}
  classifiedAt={classifiedAt}
/>
```

**Step 3: Build the campaignTypeByCampaignId Map** at top-level tree view component and pass down (similar to existing engagementByAdId pattern).

**Step 4: Typecheck + commit**

```bash
git add src/app/dashboard/[shopId]/creatives/creatives-tree-view.tsx
git commit -m "feat(creatives): render CampaignTypePopover in tree view CampaignRow"
```

---

## P2-20: Filter chips row — campaign_type URL param

**Files:**
- Modify: `src/app/dashboard/[shopId]/creatives/page.tsx`

**Step 1: Add state hooked to URL query param**

```ts
import { useSearchParams, useRouter, usePathname } from "next/navigation";

const searchParams = useSearchParams();
const router = useRouter();
const pathname = usePathname();

const campaignTypeFilter = (searchParams.get("campaign_type") ?? "all") as
  | "all" | CampaignType;

function setCampaignTypeFilter(v: "all" | CampaignType) {
  const params = new URLSearchParams(searchParams);
  if (v === "all") params.delete("campaign_type"); else params.set("campaign_type", v);
  router.replace(`${pathname}?${params.toString()}`);
}
```

**Step 2: Add chips row to UI**

Next to format filter chips, render `Vše / Evergreen / Sale / Sezónní / Neklasifikováno` buttons that call `setCampaignTypeFilter`.

**Step 3: Extend filtered derived state**

```ts
const filtered = useMemo(() => {
  return scored.filter((r) => {
    if (campaignTypeFilter !== "all" && r.campaignType !== campaignTypeFilter) return false;
    // ... existing filters ...
    return true;
  });
}, [scored, campaignTypeFilter, /* ... */]);
```

**Step 4: Commit**

```bash
git add src/app/dashboard/[shopId]/creatives/page.tsx
git commit -m "feat(creatives): campaign_type filter chips with URL query param"
```

---

## P2-21: CPA popover — benchmark info row

**Files:**
- Modify: `src/components/creatives/cpa-target-popover.tsx`
- Modify: `src/app/dashboard/[shopId]/creatives/page.tsx` (pass new props)

**Step 1: Extend Props**

```ts
interface Props {
  // existing:
  shopId: string; currentValue: number; isFallback: boolean;
  // NEW:
  benchmarkInfo?: {
    primarySegment: CampaignType | "all";
    effectiveSegment: CampaignType | "all";
    sampleSize: number;
    usedFallback: boolean;
  };
}
```

**Step 2: Render info row inside popover**

Below the input:

```tsx
{benchmarkInfo && (
  <p className="mt-2 text-[11px] text-[#6e6e73]">
    Benchmarky: <strong>{benchmarkInfo.primarySegment}</strong>
    {benchmarkInfo.usedFallback
      ? ` → ${benchmarkInfo.effectiveSegment} (málo dat, n=${benchmarkInfo.sampleSize})`
      : ` (n=${benchmarkInfo.sampleSize})`}
  </p>
)}
```

**Step 3: Derive benchmarkInfo in page.tsx**

From current `campaignTypeFilter` + `benchmarksMap`, look up the relevant set and compute summary.

**Step 4: Commit**

```bash
git add src/components/creatives/cpa-target-popover.tsx src/app/dashboard/[shopId]/creatives/page.tsx
git commit -m "feat(ui): CPA target popover shows active benchmark segment + sample size"
```

---

## P2-22: Unclassified campaign banner

**Files:**
- Create: `src/hooks/useUnclassifiedCampaigns.ts`
- Modify: `src/app/dashboard/[shopId]/creatives/page.tsx`

**Step 1: Create hook**

```ts
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
```

**Step 2: Render banner in page.tsx**

Below the CPA fallback banner:

```tsx
const { data: unclassifiedCount } = useUnclassifiedCampaigns(shopId);

{unclassifiedCount && unclassifiedCount > 0 && (
  <div className="rounded-xl border border-amber-200/60 bg-amber-50 px-4 py-3 text-sm text-amber-900 mt-2">
    ⚠️ {unclassifiedCount} {unclassifiedCount === 1 ? "kampaň není klasifikována" : "kampaní není klasifikováno"}. Zkontroluj v tree view.
  </div>
)}
```

**Step 3: Commit**

```bash
git add src/hooks/useUnclassifiedCampaigns.ts src/app/dashboard/[shopId]/creatives/page.tsx
git commit -m "feat(creatives): unclassified campaigns banner with count hook"
```

---

## P2-23: EngagementBadge tooltip — add type + fallback reason

**Files:**
- Modify: `src/components/creatives/engagement-badge.tsx`

**Step 1: Extend tooltipText**

```ts
function tooltipText(r: EngagementResult, creativeType: CreativeType, campaignType: CampaignType): string {
  // existing lines + NEW:
  lines.push(`Typ: ${campaignType}`);
  if (r.usedFallback) {
    lines.push(`Benchmark: ${r.effectiveCampaignType} (${r.fallbackReason})`);
  }
  return lines.join("\n");
}
```

**Step 2: Update EngagementBadge Props**

Accept `campaignType` prop. Callers in grid/table/tree view pass it from row.

**Step 3: Commit**

```bash
git add src/components/creatives/engagement-badge.tsx
git commit -m "feat(ui): EngagementBadge tooltip shows campaign_type + fallback reason"
```

---

## P2-24: /api/campaigns/reclassify endpoint

**Files:**
- Create: `src/app/api/campaigns/reclassify/route.ts`

**Step 1: Implement POST handler**

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { classifyCampaign } from "@/lib/campaign-classifier";

export async function POST(req: Request) {
  const { shopId } = await req.json();
  if (!shopId) return NextResponse.json({ error: "shopId required" }, { status: 400 });

  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Verify shop ownership
  const { data: shop } = await supabase
    .from("shops")
    .select("id")
    .eq("id", shopId)
    .eq("user_id", userRes.user.id)
    .maybeSingle();
  if (!shop) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Fetch auto campaigns
  const { data: campaigns, error } = await supabase
    .from("meta_ad_campaigns")
    .select("id, name, start_time, stop_time, campaign_type_source")
    .eq("shop_id", shopId)
    .eq("campaign_type_source", "auto");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let updated = 0;
  for (const c of campaigns ?? []) {
    const result = classifyCampaign({
      name: c.name ?? "",
      started_at: c.start_time ? new Date(c.start_time) : null,
      ended_at: c.stop_time ? new Date(c.stop_time) : null,
    });
    const { error: updErr } = await supabase
      .from("meta_ad_campaigns")
      .update({
        campaign_type: result.type,
        campaign_type_classified_at: new Date().toISOString(),
      })
      .eq("id", c.id);
    if (!updErr) updated++;
  }

  return NextResponse.json({ updated });
}
```

**Step 2: Commit**

```bash
git add src/app/api/campaigns/reclassify/route.ts
git commit -m "feat(api): POST /api/campaigns/reclassify for bulk auto re-classification"
```

---

## P2-25: Reclassify button on creatives toolbar

**Files:**
- Modify: `src/app/dashboard/[shopId]/creatives/page.tsx`

**Step 1: Add button**

Next to "Přepočítat benchmarky":

```tsx
async function handleReclassify() {
  setReclassifying(true);
  try {
    const res = await fetch("/api/campaigns/reclassify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ shopId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Error");
    toast.success(`Reklasifikováno ${data.updated} kampaní`);
    qc.invalidateQueries({ queryKey: ["creatives", shopId] });
    qc.invalidateQueries({ queryKey: ["unclassified-campaigns", shopId] });
  } catch (e: any) {
    toast.error(`Chyba: ${e.message}`);
  } finally {
    setReclassifying(false);
  }
}
```

Add button:

```tsx
<button type="button" onClick={handleReclassify} disabled={reclassifying}
  className="inline-flex items-center gap-1.5 rounded-full border border-[#d2d2d7] bg-white px-3 py-1.5 text-xs font-medium text-[#1d1d1f] hover:bg-[#f5f5f7]">
  <Sparkles className="h-3.5 w-3.5" />
  Reklasifikovat
</button>
```

**Step 2: Commit**

```bash
git add src/app/dashboard/[shopId]/creatives/page.tsx
git commit -m "feat(creatives): add Reclassify button wired to POST /api/campaigns/reclassify"
```

---

## P2-26: Final verification — typecheck + lint + tests + build

**Step 1: Typecheck**

Run: `/Users/jakubzelenka/.bun/bin/bunx tsc --noEmit`
Expected: clean

**Step 2: Vitest — full suite**

Run: `/Users/jakubzelenka/.bun/bin/bunx vitest run`
Expected: all tests passing (classifier + engagement-score + components)

**Step 3: Lint new files**

Run: `/Users/jakubzelenka/.bun/bin/bunx next lint`
Expected: no new errors introduced by P2 code (pre-existing tree-view lint from Phase 1 may remain, untouched).

**Step 4: Production build**

Run: `/Users/jakubzelenka/.bun/bin/bunx next build`
Expected: successful build; no new errors.

**Step 5: Manual smoke test via curl**

Start dev server: `cd "/Users/jakubzelenka/Downloads/AI hub/LongNight" && /Users/jakubzelenka/.bun/bin/bun run dev`

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/login
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/campaigns/reclassify -X POST -H "content-type: application/json" -d '{}'
```

Expected: 200 for /login; 401 or 400 for reclassify without auth (auth gate works).

**Step 6: Commit empty marker if nothing changed**

```bash
git commit --allow-empty -m "chore: ES phase 2 implementation complete"
```

**Step 7: Push**

Ask user for confirmation to `git push origin main`.

---

## Appendix A — Things explicitly NOT in Phase 2

- ❌ Editor keywords v UI (hardcoded v `keywords.ts`, YAGNI)
- ❌ Samostatná `/dashboard/[shopId]/campaigns` stránka (YAGNI)
- ❌ Weekly snapshots / Fatigue Index (Fáze 4)
- ❌ Detailní diagnostická matice + action framework panel (Fáze 5)
- ❌ Cron auto-recompute (Fáze 3+)
- ❌ E-mail alerty
- ❌ Regional calendar heuristika pro seasonal (pouze listopad/prosinec)

## Appendix B — Known limitations

1. `classifyByName` používá `.includes()` → "PROBFG" by falešně matchlo BF. Acceptable trade-off pro jednoduchost.
2. `classifyByDateRange` je volná heuristika — uživatel opraví přes popover.
3. Video length fetch přidá 2 API volání per video kreativa. Pro 200+ video kreativ sync potrvá cca + 5-10 s.
4. Při benchmark recompute se smaže celé `shop_benchmarks` pro shop a znovu vloží — není atomické. Při výpadku v polovině může shop skončit bez benchmarku. Acceptable (user klikne znovu).
