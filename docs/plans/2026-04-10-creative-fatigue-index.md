# Creative Fatigue Index — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Detect creative fatigue by fetching daily Meta insights, computing a fatigue score (0-100) based on CTR decline + frequency, and surfacing it in the UI with badges, a sortable column, and a banner for critical cases.

**Architecture:** Daily insights from Meta API (`time_increment=1`, 30d window) are stored in a new `meta_ad_creative_daily` table. During sync, fatigue is computed by comparing CTR in first vs last 15 days and factoring in frequency. The score is written to `meta_ad_creatives` for instant UI reads.

**Tech Stack:** Next.js App Router, Supabase PostgreSQL, TanStack Query, Recharts (future), Tailwind + shadcn/ui, Vitest TDD.

---

### Task P4-1: Database Migration

**Files:**
- Create: `supabase/migrations/20260410_creative_fatigue.sql`

**Step 1: Write the migration SQL**

```sql
-- Daily insights per creative (30-day window)
create table if not exists public.meta_ad_creative_daily (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  ad_id text not null,
  date date not null,
  impressions integer not null default 0,
  clicks integer not null default 0,
  ctr numeric not null default 0,
  cpm numeric not null default 0,
  spend numeric not null default 0,
  frequency numeric not null default 0,
  purchases integer not null default 0,
  link_clicks integer not null default 0,
  constraint meta_ad_creative_daily_unique unique (shop_id, ad_id, date)
);

create index if not exists meta_ad_creative_daily_shop_ad_idx
  on public.meta_ad_creative_daily (shop_id, ad_id, date desc);

alter table public.meta_ad_creative_daily enable row level security;

create policy "Users see own shop daily data"
  on public.meta_ad_creative_daily for select
  using (shop_id in (select id from public.shops where user_id = auth.uid()));

-- Fatigue columns on existing creatives table
alter table public.meta_ad_creatives
  add column if not exists fatigue_score numeric null,
  add column if not exists fatigue_signal text null
    check (fatigue_signal in ('none','rising','fatigued','critical')),
  add column if not exists fatigue_computed_at timestamptz null;
```

**Step 2: Run migration in Supabase SQL Editor**

Navigate to Supabase Dashboard → SQL Editor → paste and run. Verify "Success. No rows returned."

**Step 3: Commit**

```bash
git add supabase/migrations/20260410_creative_fatigue.sql
git commit -m "feat(db): add meta_ad_creative_daily table and fatigue columns"
```

---

### Task P4-2: Fatigue Types

**Files:**
- Create: `src/lib/fatigue/types.ts`

**Step 1: Write the types file**

```typescript
export type FatigueSignal = "none" | "rising" | "fatigued" | "critical";

export interface DailyRow {
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

export interface FatigueResult {
  score: number | null;
  signal: FatigueSignal | null;
  ctrChange: number | null;   // ratio: last15 / first15 (e.g. 0.7 = 30% drop)
  avgFrequency: number | null; // last 7 days
}
```

**Step 2: Commit**

```bash
git add src/lib/fatigue/types.ts
git commit -m "feat(fatigue): add types"
```

---

### Task P4-3: Fatigue Computation (TDD)

**Files:**
- Create: `src/lib/fatigue/compute.test.ts`
- Create: `src/lib/fatigue/compute.ts`

**Step 1: Write failing tests**

```typescript
import { describe, it, expect } from "vitest";
import { computeFatigue } from "./compute";
import type { DailyRow } from "./types";

function makeDay(date: string, ctr: number, frequency: number): DailyRow {
  return { date, impressions: 1000, clicks: Math.round(ctr * 10), ctr, cpm: 50, spend: 50, frequency, purchases: 1, link_clicks: 10 };
}

function makeDays(count: number, ctrFirst: number, ctrLast: number, freq: number): DailyRow[] {
  const rows: DailyRow[] = [];
  const today = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const progress = count > 1 ? (count - 1 - i) / (count - 1) : 1;
    const ctr = ctrFirst + (ctrLast - ctrFirst) * progress;
    rows.push(makeDay(d.toISOString().split("T")[0], ctr, freq));
  }
  return rows;
}

describe("computeFatigue", () => {
  it("returns null for less than 7 days of data", () => {
    const result = computeFatigue(makeDays(5, 2.0, 2.0, 1.0));
    expect(result.score).toBeNull();
    expect(result.signal).toBeNull();
  });

  it("returns score 0 / signal none for stable CTR and low frequency", () => {
    const result = computeFatigue(makeDays(30, 2.0, 2.0, 1.0));
    expect(result.score).toBe(0);
    expect(result.signal).toBe("none");
  });

  it("returns high score for CTR drop + high frequency", () => {
    // CTR drops from 2.0 to 1.0 (50% drop), frequency = 5
    const result = computeFatigue(makeDays(30, 2.0, 1.0, 5.0));
    expect(result.score).not.toBeNull();
    expect(result.score!).toBeGreaterThan(50);
    expect(result.signal).toBe("fatigued");
  });

  it("frequency alone drives fatigue even with stable CTR", () => {
    // CTR stable, but frequency = 6 → freq_bonus ~ 50
    const result = computeFatigue(makeDays(30, 2.0, 2.0, 6.0));
    expect(result.score!).toBeGreaterThanOrEqual(25);
    expect(result.signal).toBe("rising");
  });

  it("CTR increase means base = 0", () => {
    // CTR increases from 1.0 to 3.0, low freq
    const result = computeFatigue(makeDays(30, 1.0, 3.0, 1.0));
    expect(result.ctrChange!).toBeGreaterThan(1);
    // Only freq_bonus applies, freq = 1 → bonus = 12.5
    expect(result.score!).toBeLessThan(26);
    expect(result.signal).toBe("none");
  });

  it("skips days with 0 impressions", () => {
    const days = makeDays(30, 2.0, 2.0, 1.0);
    days[10].impressions = 0;
    days[10].ctr = 0;
    const result = computeFatigue(days);
    expect(result.score).not.toBeNull();
  });

  it("caps score at 100", () => {
    // CTR drops from 4.0 to 0.5 (87% drop) + freq = 10
    const result = computeFatigue(makeDays(30, 4.0, 0.5, 10.0));
    expect(result.score).toBe(100);
  });

  it("returns ctrChange and avgFrequency in result", () => {
    const result = computeFatigue(makeDays(30, 2.0, 1.0, 3.0));
    expect(result.ctrChange).not.toBeNull();
    expect(result.avgFrequency).not.toBeNull();
    expect(result.ctrChange!).toBeLessThan(1);
    expect(result.avgFrequency!).toBeCloseTo(3.0, 0);
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
bunx vitest run src/lib/fatigue/compute.test.ts
```

Expected: FAIL — `computeFatigue` not found.

**Step 3: Write implementation**

```typescript
import type { DailyRow, FatigueResult, FatigueSignal } from "./types";

const MIN_DAYS = 7;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function signalFromScore(score: number): FatigueSignal {
  if (score >= 76) return "critical";
  if (score >= 51) return "fatigued";
  if (score >= 26) return "rising";
  return "none";
}

export function computeFatigue(days: DailyRow[]): FatigueResult {
  // Filter out zero-impression days and sort by date ascending
  const valid = days
    .filter((d) => d.impressions > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (valid.length < MIN_DAYS) {
    return { score: null, signal: null, ctrChange: null, avgFrequency: null };
  }

  // Split into first half and last half
  const mid = Math.floor(valid.length / 2);
  const firstHalf = valid.slice(0, mid);
  const lastHalf = valid.slice(mid);

  const avgCtrFirst =
    firstHalf.reduce((s, d) => s + d.ctr, 0) / firstHalf.length;
  const avgCtrLast =
    lastHalf.reduce((s, d) => s + d.ctr, 0) / lastHalf.length;

  const ctrChange = avgCtrFirst > 0 ? avgCtrLast / avgCtrFirst : 1;

  // Average frequency from last 7 days
  const last7 = valid.slice(-7);
  const avgFrequency =
    last7.reduce((s, d) => s + d.frequency, 0) / last7.length;

  // Base score from CTR decline (0-50)
  const base = clamp((1 - ctrChange) * 50, 0, 50);

  // Frequency bonus (0-50): freq >= 4 maxes out
  const freqBonus = Math.min(avgFrequency / 4, 1) * 50;

  const rawScore = base + freqBonus;
  const score = Math.round(clamp(rawScore, 0, 100));

  return {
    score,
    signal: signalFromScore(score),
    ctrChange: Math.round(ctrChange * 1000) / 1000,
    avgFrequency: Math.round(avgFrequency * 10) / 10,
  };
}
```

**Step 4: Run tests to verify they pass**

```bash
bunx vitest run src/lib/fatigue/compute.test.ts
```

Expected: ALL PASS.

**Step 5: Commit**

```bash
git add src/lib/fatigue/compute.ts src/lib/fatigue/compute.test.ts
git commit -m "feat(fatigue): compute fatigue score with TDD"
```

---

### Task P4-4: Sync — Fetch Daily Insights from Meta

**Files:**
- Modify: `src/app/api/creatives/sync/route.ts`

**Step 1: Add MetaDailyInsight interface**

At the top of the file, after `MetaInsight`, add:

```typescript
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
```

**Step 2: Fetch daily insights (after existing Step 2 insights fetch)**

After the existing `allInsights` fetch (around line 319), add a new fetch for daily breakdown:

```typescript
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
```

**Step 3: Build daily rows map grouped by ad_id**

```typescript
// Group daily insights by ad_id
const dailyByAd = new Map<string, MetaDailyInsight[]>();
for (const d of dailyInsights) {
  const arr = dailyByAd.get(d.ad_id) || [];
  arr.push(d);
  dailyByAd.set(d.ad_id, arr);
}
```

**Step 4: Commit**

```bash
git add src/app/api/creatives/sync/route.ts
git commit -m "feat(sync): fetch 30-day daily insights from Meta API"
```

---

### Task P4-5: Sync — Upsert Daily Data + Compute Fatigue

**Files:**
- Modify: `src/app/api/creatives/sync/route.ts`

**Step 1: Add fatigue import at top**

```typescript
import { computeFatigue } from "@/lib/fatigue/compute";
import type { DailyRow } from "@/lib/fatigue/types";
```

**Step 2: After the existing `meta_ad_creatives` upsert batch loop (around line 490), add daily upsert + fatigue computation**

```typescript
// Step 5 — Upsert daily data and compute fatigue
if (dailyInsights.length > 0) {
  // 5a: Build daily rows for DB upsert
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

  // 5b: Batch upsert daily rows
  for (let i = 0; i < dailyRows.length; i += 200) {
    const batch = dailyRows.slice(i, i + 200);
    await supabase
      .from("meta_ad_creative_daily")
      .upsert(batch, { onConflict: "shop_id,ad_id,date" });
  }

  // 5c: Compute fatigue per ad
  const fatigueUpdates: Array<{
    shop_id: string;
    ad_id: string;
    fatigue_score: number | null;
    fatigue_signal: string | null;
    fatigue_computed_at: string;
  }> = [];

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
    fatigueUpdates.push({
      shop_id: shopId,
      ad_id: adId,
      fatigue_score: result.score,
      fatigue_signal: result.signal,
      fatigue_computed_at: new Date().toISOString(),
    });
  }

  // 5d: Batch update fatigue scores
  for (const upd of fatigueUpdates) {
    await supabase
      .from("meta_ad_creatives")
      .update({
        fatigue_score: upd.fatigue_score,
        fatigue_signal: upd.fatigue_signal,
        fatigue_computed_at: upd.fatigue_computed_at,
      })
      .eq("shop_id", upd.shop_id)
      .eq("ad_id", upd.ad_id);
  }
}
```

**Step 3: Verify build**

```bash
bunx tsc --noEmit
```

**Step 4: Commit**

```bash
git add src/app/api/creatives/sync/route.ts
git commit -m "feat(sync): upsert daily data and compute fatigue scores"
```

---

### Task P4-6: Hook — Add Fatigue Fields to CreativeRow

**Files:**
- Modify: `src/hooks/useCreativeAnalysis.ts`

**Step 1: Add fatigue fields to `CreativeRow` interface (after `videoDurationSeconds`)**

```typescript
  fatigueScore: number | null;
  fatigueSignal: "none" | "rising" | "fatigued" | "critical" | null;
  fatigueComputedAt: string | null;
```

**Step 2: Add mapping in the `queryFn` return (after `videoDurationSeconds` mapping, around line 159)**

```typescript
        fatigueScore:
          r.fatigue_score != null ? Number(r.fatigue_score) : null,
        fatigueSignal: (r.fatigue_signal as CreativeRow["fatigueSignal"]) ?? null,
        fatigueComputedAt: (r.fatigue_computed_at as string) ?? null,
```

**Step 3: Verify build**

```bash
bunx tsc --noEmit
```

**Step 4: Commit**

```bash
git add src/hooks/useCreativeAnalysis.ts
git commit -m "feat(hook): add fatigue fields to CreativeRow"
```

---

### Task P4-7: Fatigue Badge Component

**Files:**
- Create: `src/components/creatives/fatigue-badge.tsx`

**Step 1: Create the badge component**

```typescript
"use client";

import { useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Moon } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  score: number | null;
  signal: "none" | "rising" | "fatigued" | "critical" | null;
  ctrChange?: number | null;
  avgFrequency?: number | null;
  className?: string;
}

const SIGNAL_CONFIG = {
  rising: { color: "#ff9f0a", label: "Zacina opotrebeni" },
  fatigued: { color: "#ff6723", label: "Unavena" },
  critical: { color: "#ff3b30", label: "Kriticka unava" },
} as const;

export function FatigueBadge({ score, signal, className }: Props) {
  if (!signal || signal === "none" || score === null) return null;

  const config = SIGNAL_CONFIG[signal];
  const [open, setOpen] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);

  const handleEnter = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setOpen(true), 200);
  }, []);

  const handleLeave = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setOpen(false), 150);
  }, []);

  return (
    <div
      ref={anchorRef}
      className={cn("inline-flex items-center", className)}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <div
        className="flex items-center justify-center rounded-full w-6 h-6 cursor-pointer"
        style={{ backgroundColor: config.color + "20" }}
      >
        <Moon className="h-3.5 w-3.5" style={{ color: config.color }} />
      </div>

      {open && typeof document !== "undefined" &&
        createPortal(
          <FatigueTooltip
            anchorRef={anchorRef}
            score={score}
            signal={signal}
            config={config}
            onMouseEnter={handleEnter}
            onMouseLeave={handleLeave}
          />,
          document.body
        )}
    </div>
  );
}

function FatigueTooltip({
  anchorRef,
  score,
  signal,
  config,
  onMouseEnter,
  onMouseLeave,
}: {
  anchorRef: React.RefObject<HTMLDivElement | null>;
  score: number;
  signal: string;
  config: { color: string; label: string };
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Use useLayoutEffect equivalent via ref callback
  const setRef = useCallback(
    (node: HTMLDivElement | null) => {
      (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
      if (!node || !anchorRef.current) return;
      const rect = anchorRef.current.getBoundingClientRect();
      const popH = node.offsetHeight;
      const top =
        rect.top > popH + 10 ? rect.top - popH - 10 : rect.bottom + 10;
      let left = rect.left + rect.width / 2 - 120;
      left = Math.max(8, Math.min(left, window.innerWidth - 248));
      setPos({ top, left });
    },
    [anchorRef]
  );

  return (
    <div
      ref={setRef}
      style={{
        position: "fixed",
        zIndex: 9999,
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        width: 240,
        opacity: pos ? 1 : 0,
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="p-3 bg-white rounded-xl shadow-2xl border border-[#d2d2d7] space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold text-[#1d1d1f]">
            Fatigue: {score}
          </span>
          <span
            className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
            style={{ backgroundColor: config.color + "20", color: config.color }}
          >
            {config.label}
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-[#f5f5f7] overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.min(100, score)}%`,
              backgroundColor: config.color,
            }}
          />
        </div>
        <p className="text-[10px] text-[#86868b]">Pocitano z poslednich 30 dni</p>
      </div>
    </div>
  );
}
```

**Step 2: Verify build**

```bash
bunx tsc --noEmit
```

**Step 3: Commit**

```bash
git add src/components/creatives/fatigue-badge.tsx
git commit -m "feat(ui): fatigue badge component with hover tooltip"
```

---

### Task P4-8: Fatigue Banner Component

**Files:**
- Create: `src/components/creatives/fatigue-banner.tsx`

**Step 1: Create the banner component**

```typescript
"use client";

import { AlertTriangle } from "lucide-react";

interface Props {
  criticalCount: number;
  onFilterFatigued: () => void;
}

export function FatigueBanner({ criticalCount, onFilterFatigued }: Props) {
  if (criticalCount === 0) return null;

  return (
    <div className="flex items-center gap-2 rounded-xl bg-orange-50 border border-orange-200 px-4 py-2.5 text-[13px] text-orange-800">
      <AlertTriangle className="h-4 w-4 shrink-0 text-orange-500" />
      <span>
        <strong>{criticalCount}</strong>{" "}
        {criticalCount === 1
          ? "aktivni kreativa vykazuje kritickou unavu"
          : "aktivnich kreativ vykazuje kritickou unavu"}
        . Zvazte nove vizualy.
      </span>
      <button
        onClick={onFilterFatigued}
        className="ml-auto text-[12px] font-medium text-orange-600 hover:text-orange-800 underline underline-offset-2 shrink-0"
      >
        Zobrazit
      </button>
      <span className="text-[10px] text-orange-400 shrink-0">
        Poslednich 30 dni
      </span>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/creatives/fatigue-banner.tsx
git commit -m "feat(ui): fatigue banner for critical creatives"
```

---

### Task P4-9: Integrate UI — Grid Badge + Table Column + Banner + Filter

**Files:**
- Modify: `src/app/dashboard/[shopId]/creatives/page.tsx`

This is the largest task. The implementer should read the current page.tsx first, then make these changes:

**Step 1: Add imports at top**

```typescript
import { FatigueBadge } from "@/components/creatives/fatigue-badge";
import { FatigueBanner } from "@/components/creatives/fatigue-banner";
```

**Step 2: Add fatigue filter state (near existing filter states)**

Add alongside existing `actionFilter` state:

```typescript
const [fatigueFilter, setFatigueFilter] = useState(false);
```

**Step 3: Add fatigue banner (after drift banner, before unclassified campaigns banner)**

```typescript
<FatigueBanner
  criticalCount={
    scored.filter(
      (c) => c.fatigueSignal === "critical" && c.status === "ACTIVE"
    ).length
  }
  onFilterFatigued={() => setFatigueFilter(true)}
/>
```

**Step 4: Grid view — add FatigueBadge next to EngagementBadge (inside the `absolute top-2 right-2 z-10` div)**

Change the engagement badge wrapper from:
```tsx
<div className="absolute top-2 right-2 z-10" onClick={(e) => e.stopPropagation()}>
  <EngagementBadge result={c.engagement} size="lg" campaignType={c.campaignType} />
</div>
```
To:
```tsx
<div className="absolute top-2 right-2 z-10 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
  <FatigueBadge score={c.fatigueScore} signal={c.fatigueSignal} />
  <EngagementBadge result={c.engagement} size="lg" campaignType={c.campaignType} />
</div>
```

**Step 5: Table view — add Fatigue column header (after Engagement Score th)**

```tsx
<th className="px-3 py-2 text-left text-[11px] font-semibold text-[#86868b] uppercase tracking-wider">
  Fatigue
</th>
```

**Step 6: Table view — add Fatigue cell (after EngagementBadge td)**

```tsx
<td className="px-3 py-2">
  {c.fatigueScore !== null ? (
    <div className="flex items-center gap-1.5">
      <FatigueBadge score={c.fatigueScore} signal={c.fatigueSignal} />
      <span className="text-[12px] tabular-nums text-[#1d1d1f]">
        {c.fatigueScore}
      </span>
    </div>
  ) : (
    <span className="text-[12px] text-[#86868b]">—</span>
  )}
</td>
```

**Step 7: Add fatigue filter to filter pipeline (in the scored/filtered data computation)**

After existing `actionFilter` filtering, add:

```typescript
if (fatigueFilter) {
  result = result.filter(
    (c) =>
      c.fatigueSignal === "fatigued" || c.fatigueSignal === "critical"
  );
}
```

**Step 8: Add "Unavene" filter chip (near existing filter chips)**

Add a toggle chip after existing filter row:

```tsx
{fatigueFilter && (
  <button
    onClick={() => setFatigueFilter(false)}
    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[13px] font-medium bg-orange-100 text-orange-800 border border-orange-300"
  >
    Unavene
    <span className="text-orange-400 ml-1">×</span>
  </button>
)}
```

**Step 9: Verify build and tests**

```bash
bunx tsc --noEmit
bunx vitest run
```

**Step 10: Commit**

```bash
git add src/app/dashboard/[shopId]/creatives/page.tsx
git commit -m "feat(ui): integrate fatigue badge, column, banner, and filter"
```

---

### Task P4-10: Verify End-to-End

**Step 1: Run full test suite**

```bash
bunx vitest run
```

Expected: All tests pass (existing 112 + new fatigue tests).

**Step 2: Build check**

```bash
bunx next build
```

Expected: Clean build, no errors.

**Step 3: Push to main**

```bash
git push origin main
```

**Step 4: Run migration in Supabase SQL Editor (if not done in P4-1)**

**Step 5: Trigger sync in UI and verify fatigue scores appear**
