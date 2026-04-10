# Phase 5A — Creative Detail Page + Trend Chart Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a creative detail page with full metrics, 30-day trend chart (all 8 metrics), and a CTR sparkline in the fatigue badge tooltip.

**Architecture:** New Next.js page at `/dashboard/[shopId]/creatives/[adId]` fetches daily data from `meta_ad_creative_daily` via a shared `useDailyInsights` hook. Recharts (already installed) renders an AreaChart with metric switcher. The fatigue badge tooltip gets a mini LineChart sparkline.

**Tech Stack:** Next.js App Router, Supabase, TanStack Query v5, Recharts 3.8, Tailwind + shadcn/ui, Vitest TDD.

---

### Task 5A-1: `useDailyInsights` Hook

**Files:**
- Create: `src/hooks/useDailyInsights.ts`

**Step 1: Create the hook**

```typescript
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
```

**Step 2: Verify build**

```bash
bunx tsc --noEmit
```

**Step 3: Commit**

```bash
git add src/hooks/useDailyInsights.ts
git commit -m "feat(hook): add useDailyInsights for daily creative data"
```

---

### Task 5A-2: Trend Chart Component

**Files:**
- Create: `src/components/creatives/trend-chart.tsx`

**Step 1: Create the component**

```typescript
"use client";

import { useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { DailyInsightRow } from "@/hooks/useDailyInsights";

type MetricKey = keyof Omit<DailyInsightRow, "date">;

const METRIC_OPTIONS: { key: MetricKey; label: string; unit: string }[] = [
  { key: "ctr", label: "CTR", unit: "%" },
  { key: "cpm", label: "CPM", unit: "Kč" },
  { key: "spend", label: "Útrata", unit: "Kč" },
  { key: "frequency", label: "Frekvence", unit: "×" },
  { key: "impressions", label: "Zobrazení", unit: "" },
  { key: "clicks", label: "Kliky", unit: "" },
  { key: "purchases", label: "Nákupy", unit: "" },
  { key: "link_clicks", label: "Link kliky", unit: "" },
];

interface Props {
  data: DailyInsightRow[];
  defaultMetric?: MetricKey;
  className?: string;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getDate()}.${d.getMonth() + 1}.`;
}

function formatValue(value: number, unit: string): string {
  if (unit === "%") return `${value.toFixed(2)} %`;
  if (unit === "Kč") return `${Math.round(value)} Kč`;
  if (unit === "×") return value.toFixed(1);
  return Math.round(value).toLocaleString("cs-CZ");
}

export function TrendChart({ data, defaultMetric = "ctr", className }: Props) {
  const [metric, setMetric] = useState<MetricKey>(defaultMetric);
  const option = METRIC_OPTIONS.find((o) => o.key === metric)!;

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[15px] font-semibold text-[#1d1d1f]">
          Trend za 30 dní
        </h3>
        <select
          value={metric}
          onChange={(e) => setMetric(e.target.value as MetricKey)}
          className="text-[13px] border border-[#d2d2d7] rounded-lg px-2.5 py-1.5 bg-white text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30"
        >
          {METRIC_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#0071e3" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#0071e3" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e5ea" />
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            tick={{ fontSize: 11, fill: "#86868b" }}
            axisLine={{ stroke: "#e5e5ea" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#86868b" }}
            axisLine={false}
            tickLine={false}
            width={50}
          />
          <Tooltip
            formatter={(value: number) => [
              formatValue(value, option.unit),
              option.label,
            ]}
            labelFormatter={formatDate}
            contentStyle={{
              borderRadius: 12,
              border: "1px solid #d2d2d7",
              fontSize: 13,
            }}
          />
          <Area
            type="monotone"
            dataKey={metric}
            stroke="#0071e3"
            strokeWidth={2}
            fill="url(#trendGrad)"
            dot={false}
            activeDot={{ r: 4, fill: "#0071e3" }}
          />
        </AreaChart>
      </ResponsiveContainer>
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
git add src/components/creatives/trend-chart.tsx
git commit -m "feat(ui): trend chart component with metric switcher"
```

---

### Task 5A-3: Metric Stat Card Component

**Files:**
- Create: `src/components/creatives/metric-stat-card.tsx`

**Step 1: Create the component**

```typescript
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  value: string;
  subValue?: string;
  className?: string;
}

export function MetricStatCard({ label, value, subValue, className }: Props) {
  return (
    <div
      className={cn(
        "rounded-xl border border-[#e5e5ea] bg-white px-4 py-3",
        className
      )}
    >
      <p className="text-[11px] font-medium text-[#86868b] uppercase tracking-wide">
        {label}
      </p>
      <p className="text-[20px] font-bold text-[#1d1d1f] tabular-nums mt-0.5">
        {value}
      </p>
      {subValue && (
        <p className="text-[11px] text-[#86868b] mt-0.5">{subValue}</p>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/creatives/metric-stat-card.tsx
git commit -m "feat(ui): metric stat card component"
```

---

### Task 5A-4: Creative Detail Page

**Files:**
- Create: `src/app/dashboard/[shopId]/creatives/[adId]/page.tsx`

**Step 1: Create the detail page**

```typescript
"use client";

import { useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Swords,
  Play,
  Image as ImageIcon,
} from "lucide-react";
import { useCreativeAnalysis } from "@/hooks/useCreativeAnalysis";
import { useDailyInsights } from "@/hooks/useDailyInsights";
import { useShopBenchmarks } from "@/hooks/useShopBenchmarks";
import { useShopCpaTarget } from "@/hooks/useShopCpaTarget";
import {
  scoreCreative,
  creativeRowToScoreInput,
} from "@/lib/engagement-score";
import { EngagementBadge } from "@/components/creatives/engagement-badge";
import { FatigueBadge } from "@/components/creatives/fatigue-badge";
import { TrendChart } from "@/components/creatives/trend-chart";
import { MetricStatCard } from "@/components/creatives/metric-stat-card";
import { Loader2 } from "lucide-react";

const fmt = (n: number) => Math.round(n).toLocaleString("cs-CZ");
const fmtDec = (n: number) => n.toFixed(2).replace(".", ",");

function statusBadge(status: string) {
  const s = status.toLowerCase();
  if (s === "active")
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Aktivní
      </span>
    );
  if (s === "paused")
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200/60">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        Pozastavená
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-50 text-gray-600 border border-gray-200/60">
      Archivovaná
    </span>
  );
}

export default function CreativeDetailPage() {
  const params = useParams<{ shopId: string; adId: string }>();
  const shopId = params.shopId;
  const adId = params.adId;
  const router = useRouter();

  const { data: creatives, isLoading: creativesLoading } =
    useCreativeAnalysis(shopId);
  const { data: dailyData, isLoading: dailyLoading } = useDailyInsights(
    shopId,
    adId
  );
  const { data: benchmarks } = useShopBenchmarks(shopId);
  const { cpaTarget } = useShopCpaTarget(shopId);

  const creative = useMemo(() => {
    if (!creatives) return null;
    return creatives.find((c) => c.adId === adId) ?? null;
  }, [creatives, adId]);

  const engagement = useMemo(() => {
    if (!creative || !benchmarks) return null;
    return scoreCreative(
      creativeRowToScoreInput(creative),
      benchmarks,
      creative.campaignType,
      cpaTarget
    );
  }, [creative, benchmarks, cpaTarget]);

  if (creativesLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-[#86868b]" />
      </div>
    );
  }

  if (!creative) {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4">
        <p className="text-[#86868b]">Kreativa nenalezena.</p>
        <Link
          href={`/dashboard/${shopId}/creatives`}
          className="text-[#0071e3] text-sm mt-2 inline-block"
        >
          Zpět na přehled
        </Link>
      </div>
    );
  }

  const c = creative;

  return (
    <div className="max-w-5xl mx-auto py-6 px-4 space-y-6">
      {/* Back + Compare */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push(`/dashboard/${shopId}/creatives`)}
          className="inline-flex items-center gap-1.5 text-[13px] text-[#0071e3] hover:text-[#0077ed] font-medium"
        >
          <ArrowLeft className="h-4 w-4" />
          Zpět na přehled
        </button>
        <Link
          href={`/dashboard/${shopId}/creatives/compare?ids=${adId}`}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium px-3 py-1.5 rounded-lg border border-[#d2d2d7] text-[#1d1d1f] hover:bg-[#f5f5f7] transition-colors"
        >
          <Swords className="h-3.5 w-3.5" />
          Porovnat
        </Link>
      </div>

      {/* Header */}
      <div className="flex gap-5">
        {/* Thumbnail */}
        <div className="w-48 h-48 rounded-xl overflow-hidden bg-[#f5f5f7] shrink-0 flex items-center justify-center border border-[#e5e5ea]">
          {c.thumbnailUrl ? (
            <img
              src={c.thumbnailUrl}
              alt={c.adName}
              className="w-full h-full object-cover"
            />
          ) : c.creativeType === "video" ? (
            <Play className="h-10 w-10 text-[#86868b]" />
          ) : (
            <ImageIcon className="h-10 w-10 text-[#86868b]" />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 space-y-2">
          <h1 className="text-[20px] font-bold text-[#1d1d1f] leading-tight">
            {c.adName}
          </h1>
          <p className="text-[13px] text-[#86868b]">
            Kampaň: {c.campaignName}
          </p>
          <p className="text-[13px] text-[#86868b]">
            Ad set: {c.adsetName}
          </p>
          <div className="flex items-center gap-2 pt-1">
            {statusBadge(c.status)}
            <span className="text-[11px] text-[#86868b] px-2 py-0.5 rounded-full border border-[#e5e5ea]">
              {c.creativeType === "video" ? "Video" : "Obrázek"}
            </span>
          </div>
          <div className="flex items-center gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
            {engagement && (
              <EngagementBadge
                result={engagement}
                size="lg"
                campaignType={c.campaignType}
              />
            )}
            <FatigueBadge score={c.fatigueScore} signal={c.fatigueSignal} />
          </div>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <MetricStatCard label="Útrata" value={`${fmt(c.spend)} Kč`} />
        <MetricStatCard label="Nákupy" value={fmt(c.purchases)} />
        <MetricStatCard
          label="ROAS"
          value={`${c.roas.toFixed(1)}×`}
        />
        <MetricStatCard label="CTR" value={`${fmtDec(c.ctr)} %`} />
        <MetricStatCard label="CPC" value={`${fmtDec(c.cpc)} Kč`} />
        <MetricStatCard label="CPM" value={`${fmtDec(c.cpm)} Kč`} />
        <MetricStatCard
          label="Frekvence"
          value={c.frequency.toFixed(1)}
        />
      </div>

      {/* Trend Chart */}
      {dailyLoading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="h-5 w-5 animate-spin text-[#86868b]" />
        </div>
      ) : dailyData && dailyData.length > 0 ? (
        <TrendChart data={dailyData} />
      ) : (
        <div className="rounded-xl border border-[#e5e5ea] bg-[#f5f5f7] px-4 py-8 text-center text-[13px] text-[#86868b]">
          Žádná denní data k zobrazení. Spusťte sync pro načtení denních metrik.
        </div>
      )}

      {/* AI Analysis */}
      {c.aiAnalysis && (
        <div className="rounded-xl border border-[#e5e5ea] bg-white p-5 space-y-3">
          <h3 className="text-[15px] font-semibold text-[#1d1d1f]">
            AI Analýza
          </h3>
          <p className="text-[13px] text-[#3a3a3c] leading-relaxed">
            {c.aiAnalysis.summary}
          </p>
          {c.aiAnalysis.strengths.length > 0 && (
            <div>
              <p className="text-[12px] font-semibold text-emerald-700 mb-1">
                Silné stránky
              </p>
              <ul className="space-y-0.5">
                {c.aiAnalysis.strengths.map((s, i) => (
                  <li
                    key={i}
                    className="text-[12px] text-[#3a3a3c] pl-3 relative before:content-['•'] before:absolute before:left-0 before:text-emerald-500"
                  >
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {c.aiAnalysis.weaknesses.length > 0 && (
            <div>
              <p className="text-[12px] font-semibold text-red-700 mb-1">
                Slabé stránky
              </p>
              <ul className="space-y-0.5">
                {c.aiAnalysis.weaknesses.map((w, i) => (
                  <li
                    key={i}
                    className="text-[12px] text-[#3a3a3c] pl-3 relative before:content-['•'] before:absolute before:left-0 before:text-red-500"
                  >
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {c.aiAnalysis.recommendations.length > 0 && (
            <div>
              <p className="text-[12px] font-semibold text-[#0071e3] mb-1">
                Doporučení
              </p>
              <ul className="space-y-0.5">
                {c.aiAnalysis.recommendations.map((r, i) => (
                  <li
                    key={i}
                    className="text-[12px] text-[#3a3a3c] pl-3 relative before:content-['•'] before:absolute before:left-0 before:text-[#0071e3]"
                  >
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
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
git add src/app/dashboard/\[shopId\]/creatives/\[adId\]/page.tsx
git commit -m "feat(page): creative detail page with metrics and trend chart"
```

---

### Task 5A-5: Fatigue Badge Sparkline

**Files:**
- Modify: `src/components/creatives/fatigue-badge.tsx`

**Step 1: Add sparkline data prop and mini LineChart to FatigueBadge**

Add `dailyData` optional prop to the `Props` interface:

```typescript
interface Props {
  score: number | null;
  signal: "none" | "rising" | "fatigued" | "critical" | null;
  dailyData?: { date: string; ctr: number }[];
  className?: string;
}
```

Pass `dailyData` through to `FatigueTooltip`. In `FatigueTooltip`, between the bar and the "Pocitano" text, add:

```typescript
import { LineChart, Line, ResponsiveContainer } from "recharts";

// Inside FatigueTooltip, after the bar div:
{dailyData && dailyData.length > 2 && (
  <div className="h-10 w-full">
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={dailyData}>
        <Line
          type="monotone"
          dataKey="ctr"
          stroke={config.color}
          strokeWidth={1.5}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  </div>
)}
```

**Step 2: Pass dailyData where FatigueBadge is used in creatives page**

In `src/app/dashboard/[shopId]/creatives/page.tsx`, the FatigueBadge in the grid doesn't need sparkline data (would require N fetches). Only the detail page passes it. So this is optional — the prop is optional and sparkline only shows when data is provided.

In the detail page (`[adId]/page.tsx`), pass `dailyData`:

```tsx
<FatigueBadge
  score={c.fatigueScore}
  signal={c.fatigueSignal}
  dailyData={dailyData?.map((d) => ({ date: d.date, ctr: d.ctr }))}
/>
```

**Step 3: Verify build**

```bash
bunx tsc --noEmit
```

**Step 4: Commit**

```bash
git add src/components/creatives/fatigue-badge.tsx src/app/dashboard/\[shopId\]/creatives/\[adId\]/page.tsx
git commit -m "feat(ui): add CTR sparkline to fatigue badge tooltip"
```

---

### Task 5A-6: Link Grid Cards to Detail Page

**Files:**
- Modify: `src/app/dashboard/[shopId]/creatives/page.tsx`

**Step 1: Add a "Detail" link to CreativeCard**

In the `CreativeCard` function (around line 378), find the card's bottom area where metrics are shown. After the existing metrics section, before the closing of the card, add a link:

```tsx
import Link from "next/link"; // already imported at top

// Inside CreativeCard, after the metrics section (around line 574):
<div className="px-3 pb-2">
  <Link
    href={`/dashboard/${shopId}/creatives/${c.adId}`}
    className="text-[12px] text-[#0071e3] hover:text-[#0077ed] font-medium"
    onClick={(e) => e.stopPropagation()}
  >
    Detail →
  </Link>
</div>
```

Note: `CreativeCard` doesn't receive `shopId` directly — it's available from the parent scope. You'll need to pass it as a prop or use `useParams` inside the card. The simplest approach is to add `shopId: string` to the CreativeCard props.

**Step 2: Also add a "Detail" link in the table view**

In the table view, add a link in the ad name cell so clicking the name navigates to detail.

**Step 3: Verify build**

```bash
bunx tsc --noEmit
```

**Step 4: Commit**

```bash
git add src/app/dashboard/\[shopId\]/creatives/page.tsx
git commit -m "feat(ui): link grid cards and table rows to detail page"
```

---

### Task 5A-7: Verify End-to-End

**Step 1: Run full test suite**

```bash
bunx vitest run
```

Expected: All existing tests pass + no regressions.

**Step 2: Build check**

```bash
bunx next build
```

Expected: Clean build.

**Step 3: Commit and push**

```bash
git push origin main
```
