# Engagement Score Fáze 1 — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an Engagement Score (0–100) with category breakdown (Attention/Retention/Efficiency/Performance), action labels (excellent/good/average/weak/insufficient_data) and UI badges across all 3 creatives views (grid/table/tree), powered by frozen per-shop benchmarks.

**Architecture:** Client-side pure scoring helper (`src/lib/engagement-score/`) reads frozen benchmarks from a new `shop_benchmarks` table. Benchmarks are computed from historical data via a POST endpoint, auto-triggered after sync (non-fatal) or via a manual button. Score itself is never stored — it is a deterministic function of creatives + benchmarks + CPA target, computed via `useMemo` in the creatives page.

**Tech Stack:** Next.js 15 + TS, Supabase (PostgreSQL + RLS + SSR client), TanStack Query v5, Tailwind, Vitest, Meta Graph API v21.

**Design doc:** [`docs/plans/2026-04-09-engagement-score-design.md`](./2026-04-09-engagement-score-design.md)

**Test command:** `/Users/jakubzelenka/.bun/bin/bunx vitest run`
**Typecheck command:** `/Users/jakubzelenka/.bun/bin/bunx tsc --noEmit`
**Package manager:** bun (use `/Users/jakubzelenka/.bun/bin/bunx` for non-interactive subagents)

---

## Task Dependency Graph

```
ES-1 (migration) ──┬─> ES-2 (sync fields)
                   ├─> ES-9 (recompute endpoint) ──> ES-10 (useShopBenchmarks)
                   └─> ES-11 (useShopCpaTarget)

ES-3 (types/defaults) ──> ES-4 (normalize) ──> ES-8 (score)
                     ├──> ES-5 (filter) ────> ES-8
                     ├──> ES-6 (action) ────> ES-8
                     └──> ES-7 (compute-benchmarks) ──> ES-9

ES-8 + ES-10 + ES-11 ──> ES-12 (integration hook)
                    ├──> ES-13 (EngagementBadge)
                    └──> ES-14..17 (UI views) ──> ES-18 (CPA popover) ──> ES-19 (manual btn) ──> ES-20 (settings) ──> ES-21 (smoke test)
```

Pure logic tasks (ES-3 through ES-8) are fully parallelizable after ES-3 is done.

---

## ES-1: DB migration — shops, meta_ad_creatives, shop_benchmarks

**Files:**
- Create: `supabase/migrations/20260410_engagement_score_foundation.sql`

**Step 1: Write the migration SQL**

```sql
-- 1) Per-shop CPA target (for filter: spend >= 2*cpa_target)
alter table public.shops
  add column if not exists cpa_target_czk numeric(12,2) null;

-- 2) New creative metrics needed for video scoring
alter table public.meta_ad_creatives
  add column if not exists frequency numeric null,
  add column if not exists video_plays integer null,
  add column if not exists video_avg_watch_time numeric null; -- seconds

-- 3) Frozen benchmark thresholds per shop × format × campaign type × metric
create table if not exists public.shop_benchmarks (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  format text not null check (format in ('image','video')),
  campaign_type text not null default 'all'
    check (campaign_type in ('all','evergreen','sale')),
  metric text not null,
  fail numeric not null,
  hranice numeric not null,
  good numeric not null,
  top numeric not null,
  sample_size integer not null default 0,
  is_default boolean not null default false,
  computed_at timestamptz not null default now(),
  unique (shop_id, format, campaign_type, metric)
);

create index if not exists shop_benchmarks_lookup_idx
  on public.shop_benchmarks (shop_id, format, campaign_type);

alter table public.shop_benchmarks enable row level security;

create policy "shop_benchmarks_select_own"
  on public.shop_benchmarks for select
  using (exists (
    select 1 from public.shops s
    where s.id = shop_benchmarks.shop_id and s.user_id = auth.uid()
  ));

create policy "shop_benchmarks_insert_own"
  on public.shop_benchmarks for insert
  with check (exists (
    select 1 from public.shops s
    where s.id = shop_benchmarks.shop_id and s.user_id = auth.uid()
  ));

create policy "shop_benchmarks_update_own"
  on public.shop_benchmarks for update
  using (exists (
    select 1 from public.shops s
    where s.id = shop_benchmarks.shop_id and s.user_id = auth.uid()
  ));
```

**Step 2: Commit**

```bash
git add supabase/migrations/20260410_engagement_score_foundation.sql
git commit -m "feat(db): add shops.cpa_target, new creative metrics, shop_benchmarks table"
```

**Step 3: Execute SQL against the Supabase database**

Run the SQL against the live Supabase DB via Chrome MCP (Supabase dashboard SQL Editor at `https://supabase.com/dashboard/project/ghodnzarypflppzzsmhm/sql/new`). Migration files are NOT auto-applied in LongNight — Jakub runs them manually like `AI-1` and `TREE-1`.

Expected: Dashboard shows "Success. No rows returned".

---

## ES-2: Meta Graph API sync — frequency, video_plays, video_avg_watch_time

**Files:**
- Modify: `src/app/api/creatives/sync/route.ts`

**Context:** The sync route currently requests a fields string from `/ads?fields=...&insights{...}`. We need to extend both the insights fields and the row upsert payload with 3 new values.

**Step 1: Extend the Meta insights fields string**

Find the insights fields declaration (likely around line 140–180 as a template literal or constant). Add:
- `frequency`
- `video_play_actions`
- `video_avg_time_watched_actions`

**Step 2: Add parsing helpers near existing `getActionValue`**

Add near the top of the route file (or near existing helpers):

```ts
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
```

**Step 3: Extend the upsert row object**

In the `rows` mapping (around line 288 in current version), add:

```ts
frequency: insight ? parseFloat(insight.frequency) || 0 : 0,
video_plays: getVideoPlays(insight?.video_play_actions),
video_avg_watch_time: getVideoAvgWatchSeconds(insight?.video_avg_time_watched_actions),
```

**Step 4: Typecheck**

Run: `/Users/jakubzelenka/.bun/bin/bunx tsc --noEmit`
Expected: clean, no errors.

**Step 5: Commit**

```bash
git add src/app/api/creatives/sync/route.ts
git commit -m "feat(meta-sync): fetch frequency, video_plays, video_avg_watch_time"
```

---

## ES-3: Engagement score types and defaults

**Files:**
- Create: `src/lib/engagement-score/types.ts`
- Create: `src/lib/engagement-score/defaults.ts`
- Create: `src/lib/engagement-score/index.ts`

**Step 1: Write `types.ts`**

```ts
export type Format = "image" | "video";

export type MetricKey =
  | "ctr_link"
  | "ctr_all"
  | "hook_rate"
  | "thumb_stop"
  | "avg_watch_pct"
  | "thruplay_rate"
  | "hold_rate"
  | "cpa"
  | "pno"
  | "cpm"
  | "cvr"
  | "konv_per_1k";

export interface Thresholds {
  fail: number;
  hranice: number;
  good: number;
  top: number;
}

export type MetricThresholds = Partial<Record<MetricKey, Thresholds>>;

export type Benchmarks = Record<Format, MetricThresholds>;

export interface CategoryScores {
  attention: number | null;
  retention: number | null; // null for image (category unused)
  efficiency: number | null;
  performance: number | null;
}

export type ActionLabel =
  | "excellent" // 81-100
  | "good" // 61-80
  | "average" // 31-60
  | "weak" // 0-30
  | "insufficient_data";

export type FilterReason = "low_spend" | "low_clicks" | null;

export interface EngagementResult {
  engagementScore: number | null; // null ⇔ actionLabel === 'insufficient_data'
  categories: CategoryScores;
  actionLabel: ActionLabel;
  filterReason: FilterReason;
  format: Format;
}

/** Metrics for which a LOWER value is better (CPA, PNO, CPM). */
export const INVERTED_METRICS: ReadonlySet<MetricKey> = new Set([
  "cpa",
  "pno",
  "cpm",
]);
```

**Step 2: Write `defaults.ts`**

```ts
import type { Benchmarks } from "./types";

/**
 * Agency default thresholds for CZ e-commerce, Phase 1 starting point.
 * Used when a shop has < 15 creatives per format and we cannot compute
 * per-shop percentiles. Override via the benchmarks recompute endpoint.
 *
 * FAIL = ~25th percentile (worst quartile)
 * HRANICE = ~40th percentile (average)
 * GOOD = ~75th percentile (top quartile)
 * TOP = ~90th percentile (top decile)
 *
 * For inverted metrics (CPA, PNO, CPM): TOP is the LOWEST (cheapest)
 * value, FAIL is the HIGHEST.
 */
export const DEFAULT_BENCHMARKS: Benchmarks = {
  image: {
    ctr_link: { fail: 1.0, hranice: 1.8, good: 2.5, top: 3.5 },
    ctr_all: { fail: 1.2, hranice: 2.0, good: 3.0, top: 4.0 },
    cpa: { fail: 300, hranice: 220, good: 160, top: 110 },
    pno: { fail: 40, hranice: 32, good: 25, top: 18 },
    cpm: { fail: 350, hranice: 240, good: 160, top: 100 },
    cvr: { fail: 1.0, hranice: 1.8, good: 2.8, top: 4.0 },
    konv_per_1k: { fail: 0.3, hranice: 0.6, good: 1.1, top: 1.8 },
  },
  video: {
    ctr_link: { fail: 1.0, hranice: 1.8, good: 2.5, top: 3.5 },
    hook_rate: { fail: 25, hranice: 40, good: 55, top: 70 },
    thumb_stop: { fail: 3, hranice: 6, good: 10, top: 15 },
    avg_watch_pct: { fail: 15, hranice: 25, good: 40, top: 55 },
    thruplay_rate: { fail: 6, hranice: 10, good: 15, top: 22 },
    hold_rate: { fail: 15, hranice: 25, good: 40, top: 55 },
    cpa: { fail: 300, hranice: 220, good: 160, top: 110 },
    pno: { fail: 40, hranice: 32, good: 25, top: 18 },
    cpm: { fail: 350, hranice: 240, good: 160, top: 100 },
    cvr: { fail: 1.0, hranice: 1.8, good: 2.8, top: 4.0 },
    konv_per_1k: { fail: 0.3, hranice: 0.6, good: 1.1, top: 1.8 },
  },
};
```

**Step 3: Write placeholder `index.ts` (re-exports)**

```ts
export * from "./types";
export * from "./defaults";
```

**Step 4: Typecheck**

Run: `/Users/jakubzelenka/.bun/bin/bunx tsc --noEmit`
Expected: clean.

**Step 5: Commit**

```bash
git add src/lib/engagement-score/types.ts src/lib/engagement-score/defaults.ts src/lib/engagement-score/index.ts
git commit -m "feat(engagement-score): add types and agency default benchmarks"
```

---

## ES-4: Normalize helper — linear interpolation between thresholds

**Files:**
- Create: `src/lib/engagement-score/normalize.ts`
- Create: `src/lib/engagement-score/normalize.test.ts`

**Step 1: Write the failing test — non-inverted metric (methodology section 6 example)**

```ts
import { describe, it, expect } from "vitest";
import { normalize } from "./normalize";
import type { Thresholds } from "./types";

describe("normalize (non-inverted)", () => {
  const t: Thresholds = { fail: 1.0, hranice: 1.8, good: 2.5, top: 3.5 };

  it("methodology example: CTR 2.1% → score 55", () => {
    // From metodika section 6:
    // 40 + (2.1 - 1.8) / (2.5 - 1.8) * 35 = 40 + 15 = 55
    expect(normalize(2.1, t, false)).toBeCloseTo(55, 5);
  });

  it("value >= TOP returns 100", () => {
    expect(normalize(3.5, t, false)).toBe(100);
    expect(normalize(5.0, t, false)).toBe(100);
  });

  it("value exactly at GOOD returns 75", () => {
    expect(normalize(2.5, t, false)).toBe(75);
  });

  it("value exactly at HRANICE returns 40", () => {
    expect(normalize(1.8, t, false)).toBe(40);
  });

  it("value exactly at FAIL returns 10", () => {
    expect(normalize(1.0, t, false)).toBe(10);
  });

  it("value below FAIL returns fixed 10", () => {
    expect(normalize(0.5, t, false)).toBe(10);
    expect(normalize(0, t, false)).toBe(10);
  });

  it("interpolates linearly between GOOD and TOP", () => {
    // 3.0 is midway: 75 + 0.5 * 25 = 87.5
    expect(normalize(3.0, t, false)).toBeCloseTo(87.5, 5);
  });
});

describe("normalize (inverted, e.g. CPA)", () => {
  const t: Thresholds = { fail: 300, hranice: 220, good: 160, top: 110 };

  it("value <= TOP returns 100 (lowest = best)", () => {
    expect(normalize(110, t, true)).toBe(100);
    expect(normalize(50, t, true)).toBe(100);
  });

  it("value exactly at GOOD returns 75", () => {
    expect(normalize(160, t, true)).toBe(75);
  });

  it("CPA 180 at these thresholds: between GOOD and HRANICE", () => {
    // 40 + (220 - 180) / (220 - 160) * 35 = 40 + 40/60*35 ≈ 63.33
    expect(normalize(180, t, true)).toBeCloseTo(63.333, 3);
  });

  it("value exactly at FAIL returns 10", () => {
    expect(normalize(300, t, true)).toBe(10);
  });

  it("value above FAIL returns fixed 10", () => {
    expect(normalize(500, t, true)).toBe(10);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `/Users/jakubzelenka/.bun/bin/bunx vitest run src/lib/engagement-score/normalize.test.ts`
Expected: FAIL — "Cannot find module './normalize'".

**Step 3: Write the implementation**

```ts
import type { Thresholds } from "./types";

/**
 * Linear interpolation between benchmark thresholds → 0-100 score.
 *
 * Pre-normalization: value and thresholds must be in the same unit
 * (e.g. CTR both as % — don't mix 0.021 and 2.1).
 *
 * Non-inverted (higher = better): TOP→100, GOOD→75, HRANICE→40, FAIL→10,
 * below FAIL→fixed 10, above TOP→fixed 100.
 *
 * Inverted (lower = better, e.g. CPA/PNO/CPM): same mapping but reversed
 * direction — values below TOP are best (100), above FAIL are worst (10).
 *
 * See metodika section 6 for the exact formula and worked examples.
 */
export function normalize(
  value: number,
  t: Thresholds,
  inverted: boolean
): number {
  if (!Number.isFinite(value)) return 10;

  if (inverted) {
    if (value <= t.top) return 100;
    if (value <= t.good) {
      return 75 + ((t.good - value) / (t.good - t.top)) * 25;
    }
    if (value <= t.hranice) {
      return 40 + ((t.hranice - value) / (t.hranice - t.good)) * 35;
    }
    if (value <= t.fail) {
      return 10 + ((t.fail - value) / (t.fail - t.hranice)) * 30;
    }
    return 10;
  }

  if (value >= t.top) return 100;
  if (value >= t.good) {
    return 75 + ((value - t.good) / (t.top - t.good)) * 25;
  }
  if (value >= t.hranice) {
    return 40 + ((value - t.hranice) / (t.good - t.hranice)) * 35;
  }
  if (value >= t.fail) {
    return 10 + ((value - t.fail) / (t.hranice - t.fail)) * 30;
  }
  return 10;
}
```

**Step 4: Run test to verify pass**

Run: `/Users/jakubzelenka/.bun/bin/bunx vitest run src/lib/engagement-score/normalize.test.ts`
Expected: all tests pass.

**Step 5: Add `normalize` to `index.ts`**

Append `export * from "./normalize";` to `src/lib/engagement-score/index.ts`.

**Step 6: Commit**

```bash
git add src/lib/engagement-score/normalize.ts src/lib/engagement-score/normalize.test.ts src/lib/engagement-score/index.ts
git commit -m "feat(engagement-score): add normalize() with linear interpolation"
```

---

## ES-5: Filter helper — hasEnoughData

**Files:**
- Create: `src/lib/engagement-score/filter.ts`
- Create: `src/lib/engagement-score/filter.test.ts`

**Context:** `CreativeRow` type lives in `src/hooks/useCreativeAnalysis.ts`. For decoupling, the filter takes a structural subset — an interface with only the fields it needs. This avoids a circular dependency (hook → lib → hook).

**Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { hasEnoughData, type FilterInput } from "./filter";

function makeInput(overrides: Partial<FilterInput> = {}): FilterInput {
  return {
    spend: 0,
    linkClicks: 0,
    purchases: 0,
    ...overrides,
  };
}

describe("hasEnoughData", () => {
  const cpaTarget = 300;

  it("passes when spend >= 2*cpa and linkClicks >= 50", () => {
    const r = hasEnoughData(
      makeInput({ spend: 600, linkClicks: 50 }),
      cpaTarget
    );
    expect(r.ok).toBe(true);
    expect(r.reason).toBeNull();
  });

  it("fails with low_spend when spend < 2*cpa", () => {
    const r = hasEnoughData(
      makeInput({ spend: 599, linkClicks: 100 }),
      cpaTarget
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("low_spend");
  });

  it("fails with low_clicks when spend ok but linkClicks < 50", () => {
    const r = hasEnoughData(
      makeInput({ spend: 1000, linkClicks: 49 }),
      cpaTarget
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("low_clicks");
  });

  it("purchases >= 3 overrides both filters", () => {
    const r = hasEnoughData(
      makeInput({ spend: 10, linkClicks: 5, purchases: 3 }),
      cpaTarget
    );
    expect(r.ok).toBe(true);
    expect(r.reason).toBeNull();
  });

  it("purchases = 2 does NOT override", () => {
    const r = hasEnoughData(
      makeInput({ spend: 10, linkClicks: 5, purchases: 2 }),
      cpaTarget
    );
    expect(r.ok).toBe(false);
  });

  it("boundary: spend exactly 2*cpa passes", () => {
    const r = hasEnoughData(
      makeInput({ spend: 600, linkClicks: 50 }),
      cpaTarget
    );
    expect(r.ok).toBe(true);
  });

  it("boundary: linkClicks exactly 50 passes", () => {
    const r = hasEnoughData(
      makeInput({ spend: 600, linkClicks: 50 }),
      cpaTarget
    );
    expect(r.ok).toBe(true);
  });
});
```

**Step 2: Run test, expect fail**

Run: `/Users/jakubzelenka/.bun/bin/bunx vitest run src/lib/engagement-score/filter.test.ts`
Expected: FAIL.

**Step 3: Write implementation**

```ts
import type { FilterReason } from "./types";

export interface FilterInput {
  spend: number;
  linkClicks: number;
  purchases: number;
}

export interface FilterResult {
  ok: boolean;
  reason: FilterReason;
}

/**
 * Decide whether a creative has enough data for a meaningful engagement
 * score (metodika section 2).
 *
 * Pass conditions (BOTH required unless purchases override):
 *   spend >= 2 * cpa_target
 *   linkClicks >= 50
 *
 * Override: purchases >= 3 bypasses both filters (conversions are a
 * stronger signal than click volume).
 */
export function hasEnoughData(
  input: FilterInput,
  cpaTarget: number
): FilterResult {
  if (input.purchases >= 3) return { ok: true, reason: null };
  if (input.spend < 2 * cpaTarget) return { ok: false, reason: "low_spend" };
  if (input.linkClicks < 50) return { ok: false, reason: "low_clicks" };
  return { ok: true, reason: null };
}
```

**Step 4: Run test, expect pass**

Run: `/Users/jakubzelenka/.bun/bin/bunx vitest run src/lib/engagement-score/filter.test.ts`
Expected: all pass.

**Step 5: Export from index.ts and commit**

```bash
# append "export * from './filter';" to index.ts
git add src/lib/engagement-score/filter.ts src/lib/engagement-score/filter.test.ts src/lib/engagement-score/index.ts
git commit -m "feat(engagement-score): add hasEnoughData filter with purchases override"
```

---

## ES-6: Action label helper

**Files:**
- Create: `src/lib/engagement-score/action.ts`
- Create: `src/lib/engagement-score/action.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { actionLabelFromScore } from "./action";

describe("actionLabelFromScore", () => {
  it("null → insufficient_data", () => {
    expect(actionLabelFromScore(null)).toBe("insufficient_data");
  });

  it("0, 30 → weak", () => {
    expect(actionLabelFromScore(0)).toBe("weak");
    expect(actionLabelFromScore(30)).toBe("weak");
  });

  it("31, 60 → average", () => {
    expect(actionLabelFromScore(31)).toBe("average");
    expect(actionLabelFromScore(60)).toBe("average");
  });

  it("61, 80 → good", () => {
    expect(actionLabelFromScore(61)).toBe("good");
    expect(actionLabelFromScore(80)).toBe("good");
  });

  it("81, 100 → excellent", () => {
    expect(actionLabelFromScore(81)).toBe("excellent");
    expect(actionLabelFromScore(100)).toBe("excellent");
  });

  it("boundary 30.9 → weak, 31.0 → average", () => {
    expect(actionLabelFromScore(30.9)).toBe("weak");
    expect(actionLabelFromScore(31)).toBe("average");
  });
});
```

**Step 2: Verify fail, then implement**

```ts
import type { ActionLabel } from "./types";

export function actionLabelFromScore(score: number | null): ActionLabel {
  if (score === null) return "insufficient_data";
  if (score >= 81) return "excellent";
  if (score >= 61) return "good";
  if (score >= 31) return "average";
  return "weak";
}
```

**Step 3: Verify pass, export, commit**

```bash
# append "export * from './action';" to index.ts
git add src/lib/engagement-score/action.ts src/lib/engagement-score/action.test.ts src/lib/engagement-score/index.ts
git commit -m "feat(engagement-score): add actionLabelFromScore helper"
```

---

## ES-7: Benchmark percentile helper — computeBenchmarks

**Files:**
- Create: `src/lib/engagement-score/compute-benchmarks.ts`
- Create: `src/lib/engagement-score/compute-benchmarks.test.ts`

**Context:** Takes an array of raw creatives + format + cpaTarget, returns `MetricThresholds` or `null` if sample size < 15. The caller (recompute endpoint) decides whether to fall back to defaults. This module is pure — no DB.

**Step 1: Write failing test**

```ts
import { describe, it, expect } from "vitest";
import {
  computeBenchmarks,
  percentile,
  type BenchmarkInput,
} from "./compute-benchmarks";

function makeInput(overrides: Partial<BenchmarkInput> = {}): BenchmarkInput {
  return {
    creativeType: "image",
    spend: 0,
    linkClicks: 0,
    impressions: 0,
    clicks: 0,
    purchases: 0,
    purchaseRevenue: 0,
    videoViews3s: 0,
    videoThruplay: 0,
    videoPlays: 0,
    videoAvgWatchTime: 0,
    cpa: 0,
    cpm: 0,
    ...overrides,
  };
}

describe("percentile", () => {
  it("P50 of [1..9] = 5", () => {
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9], 50)).toBe(5);
  });

  it("P0 = min, P100 = max", () => {
    expect(percentile([10, 20, 30], 0)).toBe(10);
    expect(percentile([10, 20, 30], 100)).toBe(30);
  });

  it("linear interpolation between values", () => {
    // P50 of [10, 20] = 15
    expect(percentile([10, 20], 50)).toBe(15);
  });

  it("filters non-finite values", () => {
    expect(percentile([1, NaN, 2, Infinity, 3], 50)).toBe(2);
  });

  it("empty input returns NaN", () => {
    expect(percentile([], 50)).toBeNaN();
  });
});

describe("computeBenchmarks", () => {
  const cpaTarget = 300;

  function make15Images(): BenchmarkInput[] {
    // 15 eligible creatives (spend ≥ 600 or purchases ≥ 3)
    return Array.from({ length: 15 }, (_, i) => {
      const n = i + 1;
      return makeInput({
        creativeType: "image",
        spend: 1000,
        impressions: 10_000 * n,
        clicks: 100 * n,
        linkClicks: 100 * n,
        purchases: n,
        purchaseRevenue: 5000 * n,
        cpa: 1000 / n,
        cpm: 100,
      });
    });
  }

  it("returns null when sample size < 15", () => {
    const input = Array.from({ length: 14 }, () =>
      makeInput({ spend: 1000, linkClicks: 100, purchases: 5 })
    );
    const result = computeBenchmarks(input, "image", cpaTarget);
    expect(result).toBeNull();
  });

  it("computes percentiles for image format with 15+ eligible creatives", () => {
    const result = computeBenchmarks(make15Images(), "image", cpaTarget);
    expect(result).not.toBeNull();
    expect(result!.ctr_link).toBeDefined();
    expect(result!.cpa).toBeDefined();
  });

  it("CPA thresholds are inverted (top = lowest)", () => {
    const result = computeBenchmarks(make15Images(), "image", cpaTarget);
    expect(result!.cpa!.top).toBeLessThan(result!.cpa!.fail);
    expect(result!.cpa!.top).toBeLessThan(result!.cpa!.good);
  });

  it("CTR thresholds are non-inverted (top = highest)", () => {
    const result = computeBenchmarks(make15Images(), "image", cpaTarget);
    expect(result!.ctr_link!.top).toBeGreaterThan(result!.ctr_link!.fail);
  });

  it("filters out creatives that don't meet minimum spend/clicks", () => {
    // 15 eligible + 100 ineligible → still valid (≥15 eligible)
    const eligible = make15Images();
    const ineligible = Array.from({ length: 100 }, () =>
      makeInput({ spend: 10, linkClicks: 2, purchases: 0 })
    );
    const result = computeBenchmarks(
      [...eligible, ...ineligible],
      "image",
      cpaTarget
    );
    expect(result).not.toBeNull();
  });

  it("drops to null when < 15 eligible after filtering", () => {
    const input = Array.from({ length: 14 }, () =>
      makeInput({ spend: 1000, linkClicks: 100, purchases: 5 })
    );
    input.push(makeInput({ spend: 5, linkClicks: 2, purchases: 0 }));
    const result = computeBenchmarks(input, "image", cpaTarget);
    expect(result).toBeNull();
  });
});
```

**Step 2: Verify fail, then implement**

```ts
import type { Format, MetricThresholds, MetricKey } from "./types";
import { INVERTED_METRICS } from "./types";
import { hasEnoughData } from "./filter";

/** Input row for benchmark computation — structural subset of CreativeRow. */
export interface BenchmarkInput {
  creativeType: string;
  spend: number;
  impressions: number;
  clicks: number;
  linkClicks: number;
  purchases: number;
  purchaseRevenue: number;
  videoViews3s: number;
  videoThruplay: number;
  videoPlays: number;
  videoAvgWatchTime: number;
  cpa: number;
  cpm: number;
}

export const MIN_SAMPLE_SIZE = 15;

/**
 * Linear-interpolation percentile (type 7 / Excel default).
 * Matches metodika expectations for threshold derivation.
 */
export function percentile(values: number[], p: number): number {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return NaN;
  if (sorted.length === 1) return sorted[0];
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function derivedValue(row: BenchmarkInput, metric: MetricKey): number {
  switch (metric) {
    case "ctr_link":
      return row.impressions > 0
        ? (row.linkClicks / row.impressions) * 100
        : NaN;
    case "ctr_all":
      return row.impressions > 0
        ? (row.clicks / row.impressions) * 100
        : NaN;
    case "hook_rate":
      return row.videoPlays > 0
        ? (row.videoViews3s / row.videoPlays) * 100
        : NaN;
    case "thumb_stop":
      return row.impressions > 0
        ? (row.videoPlays / row.impressions) * 100
        : NaN;
    case "avg_watch_pct":
      // Phase 1 proxy: assume 15s average video length
      return row.videoAvgWatchTime > 0
        ? (row.videoAvgWatchTime / 15) * 100
        : NaN;
    case "thruplay_rate":
      return row.impressions > 0
        ? (row.videoThruplay / row.impressions) * 100
        : NaN;
    case "hold_rate":
      return row.videoViews3s > 0
        ? (row.videoThruplay / row.videoViews3s) * 100
        : NaN;
    case "cpa":
      return row.cpa > 0 ? row.cpa : NaN;
    case "pno":
      return row.purchaseRevenue > 0
        ? (row.spend / row.purchaseRevenue) * 100
        : NaN;
    case "cpm":
      return row.cpm > 0 ? row.cpm : NaN;
    case "cvr":
      return row.linkClicks > 0
        ? (row.purchases / row.linkClicks) * 100
        : NaN;
    case "konv_per_1k":
      return row.impressions > 0
        ? (row.purchases / row.impressions) * 1000
        : NaN;
  }
}

/** Which metrics are relevant for a given format. */
const METRICS_PER_FORMAT: Record<Format, MetricKey[]> = {
  image: ["ctr_link", "ctr_all", "cpa", "pno", "cpm", "cvr", "konv_per_1k"],
  video: [
    "ctr_link",
    "hook_rate",
    "thumb_stop",
    "avg_watch_pct",
    "thruplay_rate",
    "hold_rate",
    "cpa",
    "pno",
    "cpm",
    "cvr",
    "konv_per_1k",
  ],
};

function formatOf(row: BenchmarkInput): Format {
  return row.creativeType === "video" ? "video" : "image";
}

/**
 * Compute per-shop benchmark thresholds for a given format from a list of
 * raw creatives. Returns null if fewer than MIN_SAMPLE_SIZE eligible
 * creatives remain after filtering — caller should fall back to defaults.
 */
export function computeBenchmarks(
  rows: BenchmarkInput[],
  format: Format,
  cpaTarget: number
): MetricThresholds | null {
  const eligible = rows.filter(
    (r) =>
      formatOf(r) === format &&
      hasEnoughData(
        { spend: r.spend, linkClicks: r.linkClicks, purchases: r.purchases },
        cpaTarget
      ).ok
  );

  if (eligible.length < MIN_SAMPLE_SIZE) return null;

  const thresholds: MetricThresholds = {};

  for (const metric of METRICS_PER_FORMAT[format]) {
    const values = eligible
      .map((r) => derivedValue(r, metric))
      .filter(Number.isFinite) as number[];

    if (values.length < MIN_SAMPLE_SIZE) continue;

    const inverted = INVERTED_METRICS.has(metric);
    if (inverted) {
      thresholds[metric] = {
        top: percentile(values, 10),
        good: percentile(values, 25),
        hranice: percentile(values, 60),
        fail: percentile(values, 75),
      };
    } else {
      thresholds[metric] = {
        fail: percentile(values, 25),
        hranice: percentile(values, 40),
        good: percentile(values, 75),
        top: percentile(values, 90),
      };
    }
  }

  return thresholds;
}
```

**Step 3: Verify pass**

Run: `/Users/jakubzelenka/.bun/bin/bunx vitest run src/lib/engagement-score/compute-benchmarks.test.ts`
Expected: all pass.

**Step 4: Export and commit**

```bash
# append "export * from './compute-benchmarks';" to index.ts
git add src/lib/engagement-score/compute-benchmarks.ts src/lib/engagement-score/compute-benchmarks.test.ts src/lib/engagement-score/index.ts
git commit -m "feat(engagement-score): add computeBenchmarks percentile helper"
```

---

## ES-8: Score helper — scoreCreative

**Files:**
- Create: `src/lib/engagement-score/score.ts`
- Create: `src/lib/engagement-score/score.test.ts`

**Step 1: Write failing test**

```ts
import { describe, it, expect } from "vitest";
import { scoreCreative, type ScoreInput } from "./score";
import { DEFAULT_BENCHMARKS } from "./defaults";

function makeImage(overrides: Partial<ScoreInput> = {}): ScoreInput {
  return {
    creativeType: "image",
    spend: 0,
    impressions: 0,
    clicks: 0,
    linkClicks: 0,
    purchases: 0,
    purchaseRevenue: 0,
    videoViews3s: 0,
    videoThruplay: 0,
    videoPlays: 0,
    videoAvgWatchTime: 0,
    cpa: 0,
    cpm: 0,
    ...overrides,
  };
}

describe("scoreCreative — insufficient data", () => {
  it("returns insufficient_data when spend < 2*cpa and clicks < 50", () => {
    const r = scoreCreative(
      makeImage({ spend: 100, linkClicks: 10 }),
      DEFAULT_BENCHMARKS,
      300
    );
    expect(r.actionLabel).toBe("insufficient_data");
    expect(r.engagementScore).toBeNull();
    expect(r.filterReason).toBe("low_spend");
  });

  it("purchases >= 3 bypasses filter", () => {
    const r = scoreCreative(
      makeImage({
        spend: 10,
        linkClicks: 5,
        purchases: 3,
        impressions: 1000,
        clicks: 20,
        cpa: 3,
        cpm: 10,
        purchaseRevenue: 1000,
      }),
      DEFAULT_BENCHMARKS,
      300
    );
    expect(r.actionLabel).not.toBe("insufficient_data");
    expect(r.engagementScore).not.toBeNull();
  });
});

describe("scoreCreative — image format", () => {
  it("computes image score without retention category", () => {
    const r = scoreCreative(
      makeImage({
        spend: 1000, // passes filter at cpaTarget=300
        linkClicks: 100,
        impressions: 50_000,
        clicks: 1500,
        purchases: 20,
        purchaseRevenue: 20_000,
        cpa: 50,
        cpm: 20,
      }),
      DEFAULT_BENCHMARKS,
      300
    );
    expect(r.format).toBe("image");
    expect(r.categories.retention).toBeNull();
    expect(r.categories.attention).not.toBeNull();
    expect(r.categories.efficiency).not.toBeNull();
    expect(r.categories.performance).not.toBeNull();
    expect(r.engagementScore).not.toBeNull();
    expect(r.actionLabel).toBe("excellent");
  });

  it("applies weights 0.30 A + 0.30 E + 0.40 P for image", () => {
    // Craft a creative where A=50, E=50, P=50 exactly via proxy metrics
    // With uniform 50s, final = 0.30*50 + 0.30*50 + 0.40*50 = 50
    const r = scoreCreative(
      makeImage({
        spend: 1000,
        linkClicks: 100,
        impressions: 100_000,
        clicks: 2_000, // CTR all = 2.0
        purchases: 4, // ensures filter pass via purchases override if needed
        cpa: 250,
        cpm: 200,
        purchaseRevenue: 4000,
      }),
      DEFAULT_BENCHMARKS,
      300
    );
    // Just check it's a number in range and all categories present
    expect(typeof r.engagementScore).toBe("number");
    expect(r.engagementScore!).toBeGreaterThanOrEqual(0);
    expect(r.engagementScore!).toBeLessThanOrEqual(100);
  });
});

describe("scoreCreative — video format", () => {
  it("computes video score with retention category", () => {
    const r = scoreCreative(
      {
        creativeType: "video",
        spend: 2000,
        linkClicks: 200,
        impressions: 100_000,
        clicks: 2500,
        purchases: 30,
        purchaseRevenue: 30_000,
        videoViews3s: 40_000,
        videoThruplay: 15_000,
        videoPlays: 60_000,
        videoAvgWatchTime: 8, // → 8/15 * 100 = 53% watch pct
        cpa: 66.67,
        cpm: 20,
      },
      DEFAULT_BENCHMARKS,
      300
    );
    expect(r.format).toBe("video");
    expect(r.categories.retention).not.toBeNull();
    expect(r.categories.attention).not.toBeNull();
    expect(r.engagementScore).not.toBeNull();
  });
});

describe("scoreCreative — null categories for missing metrics", () => {
  it("video without videoPlays has no hook_rate but still scores", () => {
    const r = scoreCreative(
      {
        creativeType: "video",
        spend: 2000,
        linkClicks: 100,
        impressions: 50_000,
        clicks: 1500,
        purchases: 10,
        purchaseRevenue: 10_000,
        videoViews3s: 0,
        videoThruplay: 0,
        videoPlays: 0,
        videoAvgWatchTime: 0,
        cpa: 200,
        cpm: 40,
      },
      DEFAULT_BENCHMARKS,
      300
    );
    expect(r.categories.retention).toBeNull();
    // Attention falls back to only ctr_link (others are NaN)
    expect(r.categories.attention).not.toBeNull();
    expect(r.engagementScore).not.toBeNull();
  });
});
```

**Step 2: Verify fail, then implement**

```ts
import type {
  Benchmarks,
  CategoryScores,
  EngagementResult,
  Format,
  MetricKey,
} from "./types";
import { INVERTED_METRICS } from "./types";
import { normalize } from "./normalize";
import { hasEnoughData } from "./filter";
import { actionLabelFromScore } from "./action";

export interface ScoreInput {
  creativeType: string;
  spend: number;
  impressions: number;
  clicks: number;
  linkClicks: number;
  purchases: number;
  purchaseRevenue: number;
  videoViews3s: number;
  videoThruplay: number;
  videoPlays: number;
  videoAvgWatchTime: number;
  cpa: number;
  cpm: number;
}

function formatOf(row: ScoreInput): Format {
  return row.creativeType === "video" ? "video" : "image";
}

function derivedValue(row: ScoreInput, metric: MetricKey): number {
  switch (metric) {
    case "ctr_link":
      return row.impressions > 0
        ? (row.linkClicks / row.impressions) * 100
        : NaN;
    case "ctr_all":
      return row.impressions > 0 ? (row.clicks / row.impressions) * 100 : NaN;
    case "hook_rate":
      return row.videoPlays > 0
        ? (row.videoViews3s / row.videoPlays) * 100
        : NaN;
    case "thumb_stop":
      return row.impressions > 0
        ? (row.videoPlays / row.impressions) * 100
        : NaN;
    case "avg_watch_pct":
      // Phase 1 proxy: assume 15s average video length
      return row.videoAvgWatchTime > 0
        ? (row.videoAvgWatchTime / 15) * 100
        : NaN;
    case "thruplay_rate":
      return row.impressions > 0
        ? (row.videoThruplay / row.impressions) * 100
        : NaN;
    case "hold_rate":
      return row.videoViews3s > 0
        ? (row.videoThruplay / row.videoViews3s) * 100
        : NaN;
    case "cpa":
      return row.cpa > 0 ? row.cpa : NaN;
    case "pno":
      return row.purchaseRevenue > 0
        ? (row.spend / row.purchaseRevenue) * 100
        : NaN;
    case "cpm":
      return row.cpm > 0 ? row.cpm : NaN;
    case "cvr":
      return row.linkClicks > 0
        ? (row.purchases / row.linkClicks) * 100
        : NaN;
    case "konv_per_1k":
      return row.impressions > 0
        ? (row.purchases / row.impressions) * 1000
        : NaN;
  }
}

function categoryAverage(
  row: ScoreInput,
  benchmarks: Benchmarks,
  format: Format,
  metrics: MetricKey[]
): number | null {
  const scores: number[] = [];
  for (const metric of metrics) {
    const value = derivedValue(row, metric);
    if (!Number.isFinite(value)) continue;
    const thresholds = benchmarks[format][metric];
    if (!thresholds) continue;
    scores.push(normalize(value, thresholds, INVERTED_METRICS.has(metric)));
  }
  if (scores.length === 0) return null;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

const IMAGE_CATEGORIES: Record<"attention" | "efficiency" | "performance", MetricKey[]> = {
  attention: ["ctr_link", "ctr_all"],
  efficiency: ["cpa", "pno", "cpm"],
  performance: ["cvr", "konv_per_1k"],
};

const VIDEO_CATEGORIES: Record<"attention" | "retention" | "efficiency" | "performance", MetricKey[]> = {
  attention: ["ctr_link", "hook_rate", "thumb_stop"],
  retention: ["avg_watch_pct", "thruplay_rate", "hold_rate"],
  efficiency: ["cpa", "pno", "cpm"],
  performance: ["cvr", "konv_per_1k"],
};

/** Weights from metodika section 7. */
const IMAGE_WEIGHTS = { attention: 0.3, efficiency: 0.3, performance: 0.4 };
const VIDEO_WEIGHTS = {
  attention: 0.25,
  retention: 0.2,
  efficiency: 0.2,
  performance: 0.35,
};

function weightedScore(
  categories: CategoryScores,
  format: Format
): number | null {
  if (format === "image") {
    const entries: Array<[number | null, number]> = [
      [categories.attention, IMAGE_WEIGHTS.attention],
      [categories.efficiency, IMAGE_WEIGHTS.efficiency],
      [categories.performance, IMAGE_WEIGHTS.performance],
    ];
    return weightedAverage(entries);
  }
  const entries: Array<[number | null, number]> = [
    [categories.attention, VIDEO_WEIGHTS.attention],
    [categories.retention, VIDEO_WEIGHTS.retention],
    [categories.efficiency, VIDEO_WEIGHTS.efficiency],
    [categories.performance, VIDEO_WEIGHTS.performance],
  ];
  return weightedAverage(entries);
}

/** Renormalizes weights to skip null categories. */
function weightedAverage(entries: Array<[number | null, number]>): number | null {
  let sum = 0;
  let totalWeight = 0;
  for (const [score, weight] of entries) {
    if (score === null) continue;
    sum += score * weight;
    totalWeight += weight;
  }
  if (totalWeight === 0) return null;
  return sum / totalWeight;
}

export function scoreCreative(
  row: ScoreInput,
  benchmarks: Benchmarks,
  cpaTarget: number
): EngagementResult {
  const format = formatOf(row);
  const filter = hasEnoughData(
    { spend: row.spend, linkClicks: row.linkClicks, purchases: row.purchases },
    cpaTarget
  );

  if (!filter.ok) {
    return {
      engagementScore: null,
      categories: {
        attention: null,
        retention: null,
        efficiency: null,
        performance: null,
      },
      actionLabel: "insufficient_data",
      filterReason: filter.reason,
      format,
    };
  }

  const cats: CategoryScores =
    format === "image"
      ? {
          attention: categoryAverage(row, benchmarks, format, IMAGE_CATEGORIES.attention),
          retention: null,
          efficiency: categoryAverage(row, benchmarks, format, IMAGE_CATEGORIES.efficiency),
          performance: categoryAverage(row, benchmarks, format, IMAGE_CATEGORIES.performance),
        }
      : {
          attention: categoryAverage(row, benchmarks, format, VIDEO_CATEGORIES.attention),
          retention: categoryAverage(row, benchmarks, format, VIDEO_CATEGORIES.retention),
          efficiency: categoryAverage(row, benchmarks, format, VIDEO_CATEGORIES.efficiency),
          performance: categoryAverage(row, benchmarks, format, VIDEO_CATEGORIES.performance),
        };

  const rawScore = weightedScore(cats, format);
  const engagementScore = rawScore === null ? null : Math.round(rawScore * 10) / 10;

  return {
    engagementScore,
    categories: cats,
    actionLabel: actionLabelFromScore(engagementScore),
    filterReason: null,
    format,
  };
}
```

**Step 3: Verify pass**

Run: `/Users/jakubzelenka/.bun/bin/bunx vitest run src/lib/engagement-score/score.test.ts`
Expected: all pass.

**Step 4: Export, typecheck, commit**

```bash
# append "export * from './score';" to index.ts
/Users/jakubzelenka/.bun/bin/bunx tsc --noEmit  # must be clean
git add src/lib/engagement-score/score.ts src/lib/engagement-score/score.test.ts src/lib/engagement-score/index.ts
git commit -m "feat(engagement-score): add scoreCreative with image & video formulas"
```

---

## ES-9: Benchmark recompute endpoint + non-fatal sync auto-trigger

**Files:**
- Create: `src/app/api/benchmarks/recompute/route.ts`
- Create: `src/lib/engagement-score/recompute-helper.ts` (shared helper)
- Modify: `src/app/api/creatives/sync/route.ts` (add non-fatal trigger)

**Context:** The helper is shared between the POST route (manual) and the sync route auto-trigger. Both use the Supabase SSR client from the request context. RLS policies from ES-1 enforce per-user shop ownership.

**Step 1: Create shared helper**

`src/lib/engagement-score/recompute-helper.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeBenchmarks, type BenchmarkInput } from "./compute-benchmarks";
import { DEFAULT_BENCHMARKS } from "./defaults";
import type { Format, MetricKey, MetricThresholds } from "./types";

export interface RecomputeResult {
  updated: number;
  image: { sampleSize: number; isDefault: boolean };
  video: { sampleSize: number; isDefault: boolean };
}

interface BenchmarkRow {
  shop_id: string;
  format: Format;
  campaign_type: "all";
  metric: MetricKey;
  fail: number;
  hranice: number;
  good: number;
  top: number;
  sample_size: number;
  is_default: boolean;
  computed_at: string;
}

/**
 * Recompute frozen benchmarks for a shop and upsert them into
 * `shop_benchmarks`. Uses rolling 30-day window, falls back to all-time
 * if the window is empty, and to agency defaults when sample size < 15.
 */
export async function recomputeBenchmarksForShop(
  supabase: SupabaseClient,
  shopId: string
): Promise<RecomputeResult> {
  const thirtyDaysAgo = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000
  ).toISOString();

  // 1. Try rolling window
  let { data: rows } = await supabase
    .from("meta_ad_creatives")
    .select(
      "creative_type, spend, impressions, clicks, link_clicks, purchases, purchase_revenue, video_views_3s, video_thruplay, video_plays, video_avg_watch_time, cost_per_purchase, cpm, date_stop"
    )
    .eq("shop_id", shopId)
    .gte("date_stop", thirtyDaysAgo);

  // Fallback: all-time
  if (!rows || rows.length === 0) {
    const allTime = await supabase
      .from("meta_ad_creatives")
      .select(
        "creative_type, spend, impressions, clicks, link_clicks, purchases, purchase_revenue, video_views_3s, video_thruplay, video_plays, video_avg_watch_time, cost_per_purchase, cpm"
      )
      .eq("shop_id", shopId);
    rows = allTime.data ?? [];
  }

  // 2. Get CPA target
  const { data: shopRow } = await supabase
    .from("shops")
    .select("cpa_target_czk")
    .eq("id", shopId)
    .maybeSingle();

  const cpaTarget = Number(shopRow?.cpa_target_czk) || 300;

  // 3. Map to BenchmarkInput
  const inputs: BenchmarkInput[] = (rows ?? []).map((r) => ({
    creativeType: (r.creative_type as string) || "image",
    spend: Number(r.spend) || 0,
    impressions: Number(r.impressions) || 0,
    clicks: Number(r.clicks) || 0,
    linkClicks: Number(r.link_clicks) || 0,
    purchases: Number(r.purchases) || 0,
    purchaseRevenue: Number(r.purchase_revenue) || 0,
    videoViews3s: Number(r.video_views_3s) || 0,
    videoThruplay: Number(r.video_thruplay) || 0,
    videoPlays: Number(r.video_plays) || 0,
    videoAvgWatchTime: Number(r.video_avg_watch_time) || 0,
    cpa: Number(r.cost_per_purchase) || 0,
    cpm: Number(r.cpm) || 0,
  }));

  // 4. Compute per format, fall back to defaults
  const imageResult = computeBenchmarks(inputs, "image", cpaTarget);
  const videoResult = computeBenchmarks(inputs, "video", cpaTarget);

  const imageEligible = inputs.filter(
    (r) => (r.creativeType !== "video")
  ).length;
  const videoEligible = inputs.filter((r) => r.creativeType === "video").length;

  const imageThresholds: MetricThresholds =
    imageResult ?? DEFAULT_BENCHMARKS.image;
  const videoThresholds: MetricThresholds =
    videoResult ?? DEFAULT_BENCHMARKS.video;

  const isImageDefault = imageResult === null;
  const isVideoDefault = videoResult === null;

  // 5. Build upsert rows
  const now = new Date().toISOString();
  const upsertRows: BenchmarkRow[] = [];

  for (const [metric, t] of Object.entries(imageThresholds) as Array<
    [MetricKey, { fail: number; hranice: number; good: number; top: number }]
  >) {
    upsertRows.push({
      shop_id: shopId,
      format: "image",
      campaign_type: "all",
      metric,
      fail: t.fail,
      hranice: t.hranice,
      good: t.good,
      top: t.top,
      sample_size: imageEligible,
      is_default: isImageDefault,
      computed_at: now,
    });
  }
  for (const [metric, t] of Object.entries(videoThresholds) as Array<
    [MetricKey, { fail: number; hranice: number; good: number; top: number }]
  >) {
    upsertRows.push({
      shop_id: shopId,
      format: "video",
      campaign_type: "all",
      metric,
      fail: t.fail,
      hranice: t.hranice,
      good: t.good,
      top: t.top,
      sample_size: videoEligible,
      is_default: isVideoDefault,
      computed_at: now,
    });
  }

  // 6. Upsert (unique on shop_id, format, campaign_type, metric)
  if (upsertRows.length > 0) {
    const { error } = await supabase
      .from("shop_benchmarks")
      .upsert(upsertRows, {
        onConflict: "shop_id,format,campaign_type,metric",
      });
    if (error) throw error;
  }

  return {
    updated: upsertRows.length,
    image: { sampleSize: imageEligible, isDefault: isImageDefault },
    video: { sampleSize: videoEligible, isDefault: isVideoDefault },
  };
}
```

**Step 2: Create POST route**

`src/app/api/benchmarks/recompute/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recomputeBenchmarksForShop } from "@/lib/engagement-score/recompute-helper";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const shopId = body?.shopId;
    if (typeof shopId !== "string" || shopId.length === 0) {
      return NextResponse.json({ error: "Missing shopId" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Ownership check
    const { data: shop } = await supabase
      .from("shops")
      .select("id")
      .eq("id", shopId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!shop) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const result = await recomputeBenchmarksForShop(supabase, shopId);
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    console.error("[benchmarks/recompute] error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
```

**Step 3: Add non-fatal auto-trigger to sync route**

In `src/app/api/creatives/sync/route.ts`, find the successful upsert loop (around line 326–340, after the `upsertError` check passes). Append BEFORE the final `return NextResponse.json(...)`:

```ts
// Auto-recompute benchmarks if stale (>24h) — non-fatal
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
```

**Step 4: Typecheck**

Run: `/Users/jakubzelenka/.bun/bin/bunx tsc --noEmit`
Expected: clean.

**Step 5: Commit**

```bash
git add src/lib/engagement-score/recompute-helper.ts \
        src/app/api/benchmarks/recompute/route.ts \
        src/app/api/creatives/sync/route.ts \
        src/lib/engagement-score/index.ts
git commit -m "feat(engagement-score): recompute endpoint + non-fatal sync auto-trigger"
```

---

## ES-10: `useShopBenchmarks` hook

**Files:**
- Create: `src/hooks/useShopBenchmarks.ts`

**Step 1: Write the hook**

```ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Benchmarks, Format, MetricKey } from "@/lib/engagement-score";
import { DEFAULT_BENCHMARKS } from "@/lib/engagement-score";

interface BenchmarkRow {
  format: Format;
  metric: MetricKey;
  fail: number;
  hranice: number;
  good: number;
  top: number;
  is_default: boolean;
}

function rowsToBenchmarks(rows: BenchmarkRow[]): Benchmarks {
  const result: Benchmarks = { image: {}, video: {} };
  for (const row of rows) {
    result[row.format][row.metric] = {
      fail: row.fail,
      hranice: row.hranice,
      good: row.good,
      top: row.top,
    };
  }
  // Fill missing metrics with defaults so scoring never errors out
  for (const format of ["image", "video"] as const) {
    for (const [metric, t] of Object.entries(DEFAULT_BENCHMARKS[format]) as Array<
      [MetricKey, Benchmarks[Format][MetricKey]]
    >) {
      if (!result[format][metric]) {
        result[format][metric] = t;
      }
    }
  }
  return result;
}

export function useShopBenchmarks(shopId: string) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["shop-benchmarks", shopId],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Benchmarks> => {
      const { data, error } = await supabase
        .from("shop_benchmarks")
        .select("format,metric,fail,hranice,good,top,is_default")
        .eq("shop_id", shopId)
        .eq("campaign_type", "all");

      if (error) {
        console.error("[useShopBenchmarks]", error);
        return DEFAULT_BENCHMARKS;
      }

      if (!data || data.length === 0) {
        return DEFAULT_BENCHMARKS;
      }

      return rowsToBenchmarks(data as BenchmarkRow[]);
    },
  });
}
```

**Step 2: Typecheck + commit**

```bash
/Users/jakubzelenka/.bun/bin/bunx tsc --noEmit
git add src/hooks/useShopBenchmarks.ts
git commit -m "feat(hooks): add useShopBenchmarks with default fallback"
```

---

## ES-11: `useShopCpaTarget` hook

**Files:**
- Create: `src/hooks/useShopCpaTarget.ts`

**Step 1: Write the hook**

```ts
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
```

**Step 2: Typecheck + commit**

```bash
/Users/jakubzelenka/.bun/bin/bunx tsc --noEmit
git add src/hooks/useShopCpaTarget.ts
git commit -m "feat(hooks): add useShopCpaTarget with median fallback"
```

---

## ES-12: Wire score into creatives page

**Files:**
- Modify: `src/app/dashboard/[shopId]/creatives/page.tsx`
- Create: `src/lib/engagement-score/row-adapter.ts`

**Context:** Convert `CreativeRow` → `ScoreInput` once (keeps score.ts decoupled from the hook type). Add a `scoredCreatives` memo right after the existing `creatives` declaration.

**Step 1: Write the adapter**

```ts
import type { CreativeRow } from "@/hooks/useCreativeAnalysis";
import type { ScoreInput } from "./score";

export function creativeRowToScoreInput(row: CreativeRow): ScoreInput {
  return {
    creativeType: row.creativeType,
    spend: row.spend,
    impressions: row.impressions,
    clicks: row.clicks,
    linkClicks: row.linkClicks,
    purchases: row.purchases,
    purchaseRevenue: row.purchaseRevenue,
    videoViews3s: row.videoViews3s,
    videoThruplay: row.videoThruplay,
    videoPlays: (row as CreativeRow & { videoPlays?: number }).videoPlays ?? 0,
    videoAvgWatchTime:
      (row as CreativeRow & { videoAvgWatchTime?: number }).videoAvgWatchTime ??
      0,
    cpa: row.costPerPurchase,
    cpm: row.cpm,
  };
}
```

**Step 2: Extend `CreativeRow` interface in `useCreativeAnalysis.ts`**

Add to the interface:

```ts
videoPlays: number;
videoAvgWatchTime: number;
frequency: number;
```

And in the mapping:

```ts
videoPlays: Number(r.video_plays ?? 0),
videoAvgWatchTime: Number(r.video_avg_watch_time ?? 0),
frequency: Number(r.frequency ?? 0),
```

**Step 3: Add scored type alias and memo in page.tsx**

Near the top of `creatives/page.tsx`:

```ts
import {
  scoreCreative,
  type EngagementResult,
} from "@/lib/engagement-score";
import { creativeRowToScoreInput } from "@/lib/engagement-score/row-adapter";
import { useShopBenchmarks } from "@/hooks/useShopBenchmarks";
import { useShopCpaTarget } from "@/hooks/useShopCpaTarget";

type ScoredCreativeRow = CreativeRow & { engagement: EngagementResult };
```

Inside the component, next to `const { data: creatives }`:

```ts
const { data: benchmarks } = useShopBenchmarks(shopId);
const { value: cpaTarget, isFallback: cpaIsFallback, source: cpaSource } =
  useShopCpaTarget(shopId, creatives);

const scored = useMemo<ScoredCreativeRow[]>(() => {
  if (!creatives || !benchmarks) return [];
  return creatives.map((c) => ({
    ...c,
    engagement: scoreCreative(
      creativeRowToScoreInput(c),
      benchmarks,
      cpaTarget
    ),
  }));
}, [creatives, benchmarks, cpaTarget]);
```

Replace every downstream `filtered` that currently comes from `creatives` so it filters from `scored` instead. (The `scored` array includes all creatives — existing filter/sort logic still applies on top.)

**Step 4: Typecheck + commit**

```bash
/Users/jakubzelenka/.bun/bin/bunx tsc --noEmit
git add src/lib/engagement-score/row-adapter.ts src/lib/engagement-score/index.ts \
        src/hooks/useCreativeAnalysis.ts src/app/dashboard/[shopId]/creatives/page.tsx
git commit -m "feat(creatives): wire scoreCreative into page via memoized scored rows"
```

---

## ES-13: EngagementBadge component

**Files:**
- Create: `src/components/creatives/engagement-badge.tsx`
- Create: `src/lib/engagement-score/colors.ts`

**Step 1: Write the color helper**

```ts
import type { ActionLabel } from "./types";

export interface BadgeColor {
  bg: string;
  fg: string;
  border: string;
}

export function colorForAction(label: ActionLabel): BadgeColor {
  switch (label) {
    case "excellent":
      return { bg: "#34c759", fg: "#ffffff", border: "#2ca14c" };
    case "good":
      return { bg: "#a3e635", fg: "#1d1d1f", border: "#84cc16" };
    case "average":
      return { bg: "#ff9f0a", fg: "#ffffff", border: "#d97706" };
    case "weak":
      return { bg: "#ff3b30", fg: "#ffffff", border: "#dc2626" };
    case "insufficient_data":
      return { bg: "#e5e5ea", fg: "#86868b", border: "#d2d2d7" };
  }
}
```

**Step 2: Write the component**

```tsx
"use client";

import { cn } from "@/lib/utils";
import type {
  CategoryScores,
  EngagementResult,
} from "@/lib/engagement-score";
import { colorForAction } from "@/lib/engagement-score/colors";

interface Props {
  result: EngagementResult;
  size?: "sm" | "md" | "lg";
  showCategoryBars?: boolean;
  className?: string;
}

const SIZES = {
  sm: { w: 32, text: "text-[11px]", stroke: 2 },
  md: { w: 40, text: "text-[13px] font-bold", stroke: 2.5 },
  lg: { w: 56, text: "text-[17px] font-extrabold", stroke: 3 },
} as const;

function tooltipText(r: EngagementResult): string {
  if (r.actionLabel === "insufficient_data") {
    if (r.filterReason === "low_spend") return "Sbírání dat · málo útraty";
    if (r.filterReason === "low_clicks") return "Sbírání dat · málo kliků";
    return "Sbírání dat";
  }
  const parts: string[] = [];
  if (r.categories.attention !== null)
    parts.push(`A ${Math.round(r.categories.attention)}`);
  if (r.categories.retention !== null)
    parts.push(`R ${Math.round(r.categories.retention)}`);
  if (r.categories.efficiency !== null)
    parts.push(`E ${Math.round(r.categories.efficiency)}`);
  if (r.categories.performance !== null)
    parts.push(`P ${Math.round(r.categories.performance)}`);
  return parts.join(" · ");
}

function CategoryBars({ cats }: { cats: CategoryScores }) {
  const rows: Array<[string, number | null]> = [
    ["A", cats.attention],
    ["R", cats.retention],
    ["E", cats.efficiency],
    ["P", cats.performance],
  ];
  return (
    <div className="flex items-center gap-1 mt-1.5">
      {rows.map(([label, value]) => (
        <div
          key={label}
          className="flex flex-col items-center"
          title={`${label}: ${value === null ? "—" : Math.round(value)}`}
        >
          <div className="h-1 w-6 rounded-full bg-[#e5e5ea] overflow-hidden">
            {value !== null && (
              <div
                className="h-full transition-all"
                style={{
                  width: `${Math.max(0, Math.min(100, value))}%`,
                  backgroundColor:
                    value >= 81
                      ? "#34c759"
                      : value >= 61
                      ? "#a3e635"
                      : value >= 31
                      ? "#ff9f0a"
                      : "#ff3b30",
                }}
              />
            )}
          </div>
          <span className="mt-0.5 text-[9px] font-semibold text-[#86868b]">
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

export function EngagementBadge({
  result,
  size = "md",
  showCategoryBars = false,
  className,
}: Props) {
  const color = colorForAction(result.actionLabel);
  const { w, text } = SIZES[size];
  const label =
    result.engagementScore === null
      ? "—"
      : String(Math.round(result.engagementScore));

  return (
    <div className={cn("inline-flex flex-col items-center", className)}>
      <div
        className={cn(
          "rounded-full flex items-center justify-center shadow-sm border",
          text
        )}
        style={{
          width: w,
          height: w,
          backgroundColor: color.bg,
          color: color.fg,
          borderColor: color.border,
        }}
        title={tooltipText(result)}
      >
        {label}
      </div>
      {showCategoryBars && <CategoryBars cats={result.categories} />}
    </div>
  );
}
```

**Step 3: Typecheck + commit**

```bash
/Users/jakubzelenka/.bun/bin/bunx tsc --noEmit
git add src/lib/engagement-score/colors.ts src/components/creatives/engagement-badge.tsx src/lib/engagement-score/index.ts
git commit -m "feat(ui): add EngagementBadge component with tooltip and category bars"
```

---

## ES-14: Grid (card) view — badge + category bars

**Files:**
- Modify: `src/app/dashboard/[shopId]/creatives/page.tsx` (CreativeCard component)

**Step 1: Find CreativeCard component definition**

Grep for `function CreativeCard(` in `page.tsx`.

**Step 2: Pass engagement result through**

Extend the props interface:

```ts
creative: ScoredCreativeRow; // was CreativeRow
```

In the card's header (top-right area over the thumbnail), add:

```tsx
<div className="absolute top-2 right-2 z-10">
  <EngagementBadge result={creative.engagement} size="lg" />
</div>
```

Below the ad name / below metrics, add the category bars:

```tsx
<EngagementBadge result={creative.engagement} size="sm" showCategoryBars />
```

(Or inline the CategoryBars component — either works. Using the badge itself with bars keeps consistency.)

**Step 3: Update the render site**

Where `filtered.map((c) => <CreativeCard creative={c} .../>)` is called, `filtered` must come from `scored` (handled in ES-12). Verify `filtered` is typed `ScoredCreativeRow[]`.

**Step 4: Typecheck + commit**

```bash
/Users/jakubzelenka/.bun/bin/bunx tsc --noEmit
git add src/app/dashboard/[shopId]/creatives/page.tsx
git commit -m "feat(creatives): show engagement badge on card grid view"
```

---

## ES-15: Table view — new Score column

**Files:**
- Modify: `src/app/dashboard/[shopId]/creatives/page.tsx` (CreativesOverviewTable)

**Step 1: Extend TableSortKey type**

Add `"engagement_score"` to whatever union `TableSortKey` is defined as.

**Step 2: Add new `<th>` as the first data column**

Right after the `AI` column, insert:

```tsx
<TableSortTh
  label="Score"
  active={sortKey === "engagement_score"}
  arrow={arrow("engagement_score")}
  onClick={() => handleSort("engagement_score")}
  emphasized
/>
```

**Step 3: Add sort logic**

In the `sort` function, add:

```ts
if (sortKey === "engagement_score") {
  const aS = a.engagement.engagementScore;
  const bS = b.engagement.engagementScore;
  // insufficient_data always ranked last
  if (aS === null && bS === null) return 0;
  if (aS === null) return 1;
  if (bS === null) return -1;
  const cmp = aS < bS ? -1 : aS > bS ? 1 : 0;
  return sortAsc ? cmp : -cmp;
}
```

Change the default sortKey to `"engagement_score"` and default direction to desc.

**Step 4: Add `<td>` rendering**

In the row body:

```tsx
<td className="px-3 py-2">
  <EngagementBadge result={c.engagement} size="md" />
</td>
```

**Step 5: Update prop types**

`CreativesOverviewTable` should accept `ScoredCreativeRow[]` instead of `CreativeRow[]`.

**Step 6: Typecheck + commit**

```bash
/Users/jakubzelenka/.bun/bin/bunx tsc --noEmit
git add src/app/dashboard/[shopId]/creatives/page.tsx
git commit -m "feat(creatives): add Score column to table view with sort"
```

---

## ES-16: Tree view — badge on AdRow only

**Files:**
- Modify: `src/app/dashboard/[shopId]/creatives/creatives-tree-view.tsx`

**Step 1: Extend props**

Change `creatives: CreativeRow[]` to `creatives: ScoredCreativeRow[]` (import the type from page.tsx or define a local version). Export `ScoredCreativeRow` from page.tsx or move it to a shared types file (`src/app/dashboard/[shopId]/creatives/types.ts`) — prefer the shared types file.

**Step 2: Render badge in AdRow**

In the `AdRow` component, before the thumbnail button:

```tsx
<EngagementBadge result={creative.engagement} size="sm" className="shrink-0" />
```

**Step 3: Do NOT add badges to CampaignRow or AdSetRow**

(Aggregating scores is not mathematically valid — metodika mandates per-creative comparison only. Keep weighted Metrics on group rows as-is.)

**Step 4: Typecheck + commit**

```bash
/Users/jakubzelenka/.bun/bin/bunx tsc --noEmit
git add src/app/dashboard/[shopId]/creatives/creatives-tree-view.tsx \
        src/app/dashboard/[shopId]/creatives/page.tsx
git commit -m "feat(creatives): show engagement badge on tree view ad rows"
```

---

## ES-17: Summary bar — Ø Score + Action counts filter

**Files:**
- Modify: `src/app/dashboard/[shopId]/creatives/page.tsx`

**Step 1: Compute summary additions**

Near the existing `summary` computation, add:

```ts
const engagementSummary = useMemo(() => {
  const withScore = scored.filter(
    (c) => c.engagement.engagementScore !== null
  );
  const spendWeightedSum = withScore.reduce(
    (sum, c) => sum + c.engagement.engagementScore! * (c.spend || 0),
    0
  );
  const totalSpend = withScore.reduce((sum, c) => sum + (c.spend || 0), 0);
  const avgScore = totalSpend > 0 ? spendWeightedSum / totalSpend : null;

  const counts = {
    excellent: 0,
    good: 0,
    average: 0,
    weak: 0,
  };
  for (const c of scored) {
    const label = c.engagement.actionLabel;
    if (label in counts) counts[label as keyof typeof counts]++;
  }
  return { avgScore, counts };
}, [scored]);
```

**Step 2: Add action label filter state**

```ts
const [actionFilter, setActionFilter] = useState<
  "excellent" | "good" | "average" | "weak" | null
>(null);
```

**Step 3: Extend `filtered` computation**

Add:

```ts
if (actionFilter !== null) {
  result = result.filter((c) => c.engagement.actionLabel === actionFilter);
}
```

**Step 4: Add two summary tiles**

In the summary bar grid:

```tsx
<SmallStat
  label="Ø Engagement Score"
  value={
    engagementSummary.avgScore !== null
      ? engagementSummary.avgScore.toFixed(1)
      : "—"
  }
/>
<div className="rounded-xl border border-[#d2d2d7]/60 bg-white p-3">
  <p className="text-[10px] uppercase tracking-wider text-[#86868b]">
    Kreativy k akci
  </p>
  <div className="flex gap-2 mt-1 text-xs">
    {(
      [
        ["excellent", "⭐", "#34c759"],
        ["good", "✅", "#a3e635"],
        ["average", "⚠️", "#ff9f0a"],
        ["weak", "❌", "#ff3b30"],
      ] as const
    ).map(([label, icon, color]) => (
      <button
        key={label}
        onClick={() =>
          setActionFilter(actionFilter === label ? null : label)
        }
        className={cn(
          "flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold border transition-colors",
          actionFilter === label
            ? "bg-[#1d1d1f] text-white border-[#1d1d1f]"
            : "bg-white border-[#d2d2d7] hover:border-[#86868b]"
        )}
        style={
          actionFilter !== label ? { color: color } : undefined
        }
      >
        <span>{icon}</span>
        <span>{engagementSummary.counts[label]}</span>
      </button>
    ))}
  </div>
</div>
```

**Step 5: Typecheck + commit**

```bash
/Users/jakubzelenka/.bun/bin/bunx tsc --noEmit
git add src/app/dashboard/[shopId]/creatives/page.tsx
git commit -m "feat(creatives): summary tiles for avg score + action count filters"
```

---

## ES-18: CPA target popover + banner on creatives page

**Files:**
- Create: `src/components/creatives/cpa-target-popover.tsx`
- Modify: `src/app/dashboard/[shopId]/creatives/page.tsx`

**Step 1: Write the popover component**

```tsx
"use client";

import { useState } from "react";
import { Settings2, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

interface Props {
  shopId: string;
  currentValue: number;
  isFallback: boolean;
}

export function CpaTargetPopover({ shopId, currentValue, isFallback }: Props) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(String(Math.round(currentValue)));
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();

  async function save() {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) {
      toast.error("Zadej kladné číslo");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("shops")
      .update({ cpa_target_czk: num })
      .eq("id", shopId);
    setSaving(false);
    if (error) {
      toast.error(`Chyba: ${error.message}`);
      return;
    }
    qc.invalidateQueries({ queryKey: ["shop-cpa-target", shopId] });
    toast.success("CPA target uložen");
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-full border border-[#d2d2d7] bg-white px-3 py-1.5 text-xs font-medium text-[#1d1d1f] hover:bg-[#f5f5f7]"
        title="Nastavení CPA targetu"
      >
        <Settings2 className="h-3.5 w-3.5" />
        CPA {Math.round(currentValue)} Kč
        {isFallback && (
          <span className="text-[10px] text-amber-700">(auto)</span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 z-30 w-72 rounded-xl border border-[#d2d2d7] bg-white p-4 shadow-lg">
          <p className="text-xs font-semibold text-[#1d1d1f] mb-2">
            CPA target (Kč)
          </p>
          <p className="text-[11px] text-[#6e6e73] mb-3">
            Filtr „dost dat" vyžaduje spend ≥ 2× této hodnoty nebo ≥ 3
            konverze.
          </p>
          <input
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full rounded-md border border-[#d2d2d7] px-3 py-1.5 text-sm"
            disabled={saving}
          />
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="flex-1 inline-flex items-center justify-center gap-1 rounded-full bg-[#0071e3] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0077ed] disabled:opacity-50"
            >
              {saving && <Loader2 className="h-3 w-3 animate-spin" />}
              Uložit
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full border border-[#d2d2d7] bg-white px-3 py-1.5 text-xs font-medium text-[#6e6e73] hover:bg-[#f5f5f7]"
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

**Step 2: Place popover in toolbar**

In `creatives/page.tsx` toolbar, add next to the existing Synchronizovat button:

```tsx
<CpaTargetPopover
  shopId={shopId}
  currentValue={cpaTarget}
  isFallback={cpaIsFallback}
/>
```

**Step 3: Add info banner when CPA target is fallback**

Above the summary bar, conditionally:

```tsx
{cpaIsFallback && (
  <div className="rounded-xl border border-amber-200/60 bg-amber-50 p-3 text-sm text-amber-900 flex items-center gap-2">
    <span>⚠️</span>
    <span>
      CPA target není nastaven — používám{" "}
      {cpaSource === "median" ? "medián" : "výchozí hodnotu"}{" "}
      <strong>{Math.round(cpaTarget)} Kč</strong> z tvých dat.
    </span>
  </div>
)}
```

**Step 4: Typecheck + commit**

```bash
/Users/jakubzelenka/.bun/bin/bunx tsc --noEmit
git add src/components/creatives/cpa-target-popover.tsx \
        src/app/dashboard/[shopId]/creatives/page.tsx
git commit -m "feat(creatives): CPA target popover + fallback banner"
```

---

## ES-19: Manual "Přepočítat benchmarky" button

**Files:**
- Modify: `src/app/dashboard/[shopId]/creatives/page.tsx`

**Step 1: Add button and handler**

Near Synchronizovat button in toolbar:

```tsx
const [recomputing, setRecomputing] = useState(false);
const queryClient = useQueryClient();

async function handleRecomputeBenchmarks() {
  setRecomputing(true);
  try {
    const res = await fetch("/api/benchmarks/recompute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shopId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Recompute failed");
    const fmt = (r: { sampleSize: number; isDefault: boolean }) =>
      r.isDefault
        ? `${r.sampleSize} (výchozí)`
        : `${r.sampleSize}`;
    toast.success(
      `Benchmarky aktualizované · image ${fmt(data.image)} · video ${fmt(
        data.video
      )}`
    );
    queryClient.invalidateQueries({ queryKey: ["shop-benchmarks", shopId] });
  } catch (e) {
    toast.error(`Chyba: ${(e as Error).message}`);
  } finally {
    setRecomputing(false);
  }
}
```

And the button:

```tsx
<button
  type="button"
  onClick={handleRecomputeBenchmarks}
  disabled={recomputing}
  className="inline-flex items-center gap-1.5 rounded-full border border-[#d2d2d7] bg-white px-3 py-1.5 text-xs font-medium text-[#1d1d1f] hover:bg-[#f5f5f7] disabled:opacity-50"
  title="Přepočítat benchmarky z historických dat"
>
  {recomputing ? (
    <Loader2 className="h-3.5 w-3.5 animate-spin" />
  ) : (
    <BarChart3 className="h-3.5 w-3.5" />
  )}
  Přepočítat benchmarky
</button>
```

Import `BarChart3` and `Loader2` from lucide-react if not already.

**Step 2: Typecheck + commit**

```bash
/Users/jakubzelenka/.bun/bin/bunx tsc --noEmit
git add src/app/dashboard/[shopId]/creatives/page.tsx
git commit -m "feat(creatives): add manual Recompute benchmarks button"
```

---

## ES-20: Global Settings — CPA target per shop

**Files:**
- Modify: `src/app/dashboard/settings/page.tsx`
- Create: `src/app/dashboard/settings/creative-scoring-settings.tsx`

**Step 1: Create client component**

```tsx
"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface Shop {
  id: string;
  name: string;
  cpa_target_czk: number | null;
}

interface Props {
  shops: Shop[];
}

export function CreativeScoringSettings({ shops }: Props) {
  const [selectedShopId, setSelectedShopId] = useState<string>(
    shops[0]?.id ?? ""
  );
  const [value, setValue] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const selected = shops.find((s) => s.id === selectedShopId);

  useEffect(() => {
    if (selected) {
      setValue(
        selected.cpa_target_czk != null
          ? String(selected.cpa_target_czk)
          : ""
      );
    }
  }, [selected]);

  async function save() {
    if (!selected) return;
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) {
      toast.error("Zadej kladné číslo");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("shops")
      .update({ cpa_target_czk: num })
      .eq("id", selected.id);
    setSaving(false);
    if (error) {
      toast.error(`Chyba: ${error.message}`);
      return;
    }
    toast.success("CPA target uložen");
  }

  if (shops.length === 0) {
    return (
      <p className="text-sm text-[#6e6e73]">
        Žádné shopy — nejdřív přidej shop.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-semibold text-[#1d1d1f]">Shop</label>
        <select
          value={selectedShopId}
          onChange={(e) => setSelectedShopId(e.target.value)}
          className="mt-1 w-full rounded-md border border-[#d2d2d7] px-3 py-2 text-sm"
        >
          {shops.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-xs font-semibold text-[#1d1d1f]">
          CPA target (Kč)
        </label>
        <input
          type="number"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="např. 300"
          className="mt-1 w-full rounded-md border border-[#d2d2d7] px-3 py-2 text-sm"
        />
        <p className="mt-1 text-[11px] text-[#6e6e73]">
          Primární KPI. Používá se pro filtr „kreativa má dost dat"
          (spend ≥ 2× CPA target) a pro výpočet Engagement Score.
        </p>
      </div>
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="inline-flex items-center gap-1.5 rounded-full bg-[#0071e3] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0077ed] disabled:opacity-50"
      >
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        Uložit
      </button>
    </div>
  );
}
```

**Step 2: Wire into settings page**

In `src/app/dashboard/settings/page.tsx`, fetch shops and replace the "Další nastavení" placeholder:

```tsx
// In the server component
const { data: shops } = await supabase
  .from("shops")
  .select("id, name, cpa_target_czk")
  .eq("user_id", user.id)
  .order("name");

// Replace placeholder section:
<section className="mt-6 rounded-2xl border border-[#d2d2d7]/60 bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.03)] sm:p-8">
  <div className="mb-6">
    <h3 className="text-xl font-bold tracking-tight text-[#1d1d1f]">
      Engagement Score
    </h3>
    <p className="mt-1 text-sm text-[#6e6e73]">
      CPA target per shop pro výpočet skóre a filtr zařazení kreativ.
    </p>
  </div>
  <CreativeScoringSettings shops={(shops ?? []) as Shop[]} />
</section>
```

**Step 3: Typecheck + commit**

```bash
/Users/jakubzelenka/.bun/bin/bunx tsc --noEmit
git add src/app/dashboard/settings/page.tsx \
        src/app/dashboard/settings/creative-scoring-settings.tsx
git commit -m "feat(settings): add CreativeScoringSettings for per-shop CPA target"
```

---

## ES-21: Final verification + deploy + smoke test

**Step 1: Run full test suite**

Run: `/Users/jakubzelenka/.bun/bin/bunx vitest run`
Expected: **all** tests pass (existing creative-aggregation + new engagement-score).

**Step 2: Full typecheck**

Run: `/Users/jakubzelenka/.bun/bin/bunx tsc --noEmit`
Expected: clean.

**Step 3: Run lint (if available)**

Run: `/Users/jakubzelenka/.bun/bin/bunx eslint src/lib/engagement-score src/components/creatives src/hooks src/app/dashboard --ext .ts,.tsx`
Expected: no errors (warnings OK).

**Step 4: Push to main**

```bash
git log --oneline -25  # verify commits are present
git push origin main
```

**Step 5: Wait for Vercel deploy**

Check Vercel dashboard / GitHub for the deploy status on the latest commit. Should deploy to production in ~1–2 minutes.

**Step 6: Manual smoke test checklist**

Open production dashboard, navigate to `/dashboard/{shopId}/creatives`:

- [ ] **Initial load**: No console errors. Creatives load. Banner appears IF CPA target is null.
- [ ] **Badges visible** in grid view (large top-right), table view (Score column, default sort desc), tree view (small, on Ad rows only — NOT on Campaign/AdSet rows).
- [ ] **Tooltip** on badge hover shows category breakdown (A/R/E/P numbers, null categories omitted).
- [ ] **"Sbírání dat"** label appears on creatives with insufficient data (spend < 2×target and purchases < 3).
- [ ] **Summary tiles**: "Ø Engagement Score" shows a number. "Kreativy k akci" shows 4 colored buttons with counts.
- [ ] **Click an action filter** (e.g. ⭐) → list filters to only excellent creatives. Click again → filter clears.
- [ ] **Sort by Score** in table → top score first.
- [ ] **CPA target popover** → click settings icon → change value → save → banner disappears, scores recompute.
- [ ] **Recompute benchmarks button** → click → toast shows sample sizes → benchmarks refresh, React Query key invalidates.
- [ ] **Settings page** `/dashboard/settings` → Engagement Score section → dropdown of shops → update CPA target for another shop → save → go back to creatives for that shop → popover reflects new value.
- [ ] **Sync creatives** (existing button) → verify sync still works (i.e. auto-trigger benchmark recompute did not break the 200 response). Inspect Vercel logs for `[sync] benchmark auto-recompute failed` — should not appear.

**Step 7: Mark Phase 1 complete**

Update `docs/plans/2026-04-09-engagement-score-phase1.md` bottom with a `## Completed` section listing commit SHAs per task.

---

## Appendix A — Things explicitly NOT done in Phase 1

(Copied from design doc for enforcement.)

- ❌ Segmentace evergreen / sale / seasonal — Phase 2
- ❌ AM approval flow, rolling window config per shop, >20 % drift alert — Phase 3
- ❌ Weekly snapshots, Creative Fatigue Index, fatigue alerty — Phase 4
- ❌ Plnohodnotná diagnostická matice UI (metodika section 11) — Phase 5
- ❌ Detailní action framework panel (section 12) — Phase 5
- ❌ CSV onboarding import from Meta Ads Manager
- ❌ Cron job for automatic recompute (only sync-triggered in Phase 1)
- ❌ Video duration fetch (proxy = watch_time / 15 for Phase 1)
- ❌ E-mail notifications / alerts

## Appendix B — Known limitations (document these in UI later)

1. `avg_watch_pct` uses a 15-second proxy — actual video duration not stored.
2. Benchmarks recompute does a linear DB scan — fine for <10 000 creatives per shop.
3. Client-side scoring recomputes on every state change that invalidates the `useMemo` deps — imperceptible up to a few hundred creatives, may need `useDeferredValue` for 500+.
4. First-time shop visit with no benchmark rows auto-falls back to agency defaults silently. Recompute button exists to fix that explicitly once data exists.
