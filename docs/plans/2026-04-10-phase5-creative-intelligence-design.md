# Phase 5 — Creative Intelligence Suite Design

## Overview

Four sub-features building on Phase 4 fatigue data and existing engagement scoring. Implements creative detail pages, trend visualization, A/B comparison, smart alerts, and budget allocation insights.

**Implementation order** (based on dependencies):
1. 5A: Creative Detail Page + Trend Chart
2. 5B: Creative Comparison
3. 5C: Smart Alerts
4. 5D: Budget Allocation Insights

---

## 5A: Creative Detail Page + Trend Chart

### Detail Page (`/dashboard/[shopId]/creatives/[adId]`)

**Layout (top to bottom):**
- **Header** — thumbnail/video left, right: ad name, campaign name, status badge, engagement badge, fatigue badge
- **Key metrics row** — spend, purchases, ROAS, CTR, CPC, CPM, frequency (stat cards)
- **Trend chart** — Recharts `AreaChart`, 30-day window, dropdown switcher between 8 metrics (CTR, CPM, spend, frequency, impressions, clicks, purchases, link_clicks). Default: CTR.
- **AI analysis** — if exists, show summary + strengths/weaknesses (reuse format from CreativeMetaAnalysisSheet)
- **Navigation** — back to grid button, "Porovnat" button (opens picker for second creative)

### Sparkline in Fatigue Popover

Extend existing `FatigueTooltip` with mini Recharts `LineChart` (CTR over 30 days, ~100x40px, no axes). Data fetched from `meta_ad_creative_daily`.

### Data Fetching

- New hook `useDailyInsights(shopId, adId)` — query `meta_ad_creative_daily` for last 30 days
- CreativeRow data from existing `useCreativeAnalysis` (filter to specific adId)

### Files

| Action | Path |
|--------|------|
| New page | `src/app/dashboard/[shopId]/creatives/[adId]/page.tsx` |
| New hook | `src/hooks/useDailyInsights.ts` |
| New component | `src/components/creatives/trend-chart.tsx` |
| New component | `src/components/creatives/metric-stat-card.tsx` |
| Modify | `src/components/creatives/fatigue-badge.tsx` (add sparkline) |
| Modify | Grid cards — link to detail page on click |

---

## 5B: Creative Comparison

### Compare Page (`/dashboard/[shopId]/creatives/compare?ids=ad1,ad2`)

**Entry points:**
- **From grid** — select 2+ creatives via checkbox, new "Porovnat" button in action bar (next to "AI Analyza")
- **From detail page** — "Porovnat" button opens picker (dropdown/modal with search), redirects to compare page

**Layout:**
- **Side-by-side cards** — 2-4 creatives next to each other (horizontal scroll if >2)
- **Per card** — thumbnail, engagement badge, fatigue badge, key metrics (spend, purchases, ROAS, CTR, CPC, CPM)
- **Overlay trend chart** — shared `LineChart` below cards, one line per creative (color-coded). Dropdown for metric selection. Visually compare trends.
- **Diff table** — metrics as rows, creatives as columns, best value highlighted green, worst red
- **"Pridat kreativu" button** — picker to add another creative (max 4)

**Data:**
- Reuse `useCreativeAnalysis` for aggregate metrics
- Reuse `useDailyInsights` for trend data (parallel fetch per creative)

### Files

| Action | Path |
|--------|------|
| New page | `src/app/dashboard/[shopId]/creatives/compare/page.tsx` |
| New component | `src/components/creatives/compare-card.tsx` |
| New component | `src/components/creatives/compare-diff-table.tsx` |
| New component | `src/components/creatives/creative-picker-modal.tsx` |
| Modify | `src/app/dashboard/[shopId]/creatives/page.tsx` (add "Porovnat" action) |
| Modify | Detail page (add "Porovnat" button with picker) |

---

## 5C: Smart Alerts

### Alert Types

| Type | Condition | Severity |
|------|-----------|----------|
| Fatigue alert | Creative reaches critical fatigue since last sync | high |
| Top performer | ROAS > 2x shop average AND spend > median | medium |
| Spend without results | spend > CPA target AND purchases = 0 over 7 days | high |
| Rising star | CTR change > +30% (last 7d vs previous 7d) AND spend > median | medium |

### Display

- New `AlertsBanner` on creatives page (below existing banners) — max 3 most important alerts, expandable to show all
- Toast notification after sync — "Sync dokoncen. 2 nove alerty."

### Computation

- Computed after sync on backend (in sync route, after fatigue computation)
- Stored in new table `creative_alerts`:

| Column | Type |
|--------|------|
| id | uuid PK |
| shop_id | uuid FK |
| ad_id | text |
| alert_type | text (fatigue/top_performer/spend_no_results/rising_star) |
| message | text |
| severity | text (high/medium/low) |
| created_at | timestamptz |
| dismissed_at | timestamptz null |

- Frontend fetches undismissed alerts via `useCreativeAlerts(shopId)`
- User can dismiss individual alerts (soft delete via `dismissed_at`)

### Thresholds

- **Top performer**: ROAS > 2x shop average, spend > median
- **Spend without results**: spend > CPA target, purchases = 0 for 7 days
- **Rising star**: CTR change > +30% (last 7d vs previous 7d), spend > median

### Files

| Action | Path |
|--------|------|
| New migration | `supabase/migrations/20260410_creative_alerts.sql` |
| New lib | `src/lib/alerts/compute.ts` |
| New lib | `src/lib/alerts/types.ts` |
| New hook | `src/hooks/useCreativeAlerts.ts` |
| New component | `src/components/creatives/alerts-banner.tsx` |
| Modify | `src/app/api/creatives/sync/route.ts` (compute alerts after fatigue) |
| Modify | `src/app/dashboard/[shopId]/creatives/page.tsx` (render AlertsBanner) |

---

## 5D: Budget Allocation Insights

### Bubble Chart

- **X axis** — spend
- **Y axis** — ROAS
- **Bubble size** — purchases
- **Bubble color** — fatigue signal (green=fresh, yellow=rising, orange=fatigued, red=critical)
- Hover tooltip with creative detail
- Click bubble → detail page

### Recommendation Table

Sorted by "opportunity score" (high ROAS + low fatigue + low budget share = opportunity to increase).

| Column | Description |
|--------|-------------|
| Creative | Name + thumbnail |
| Spend | Total spend |
| ROAS | Return on ad spend |
| Engagement | Score |
| Fatigue | Score + signal |
| % Budget | Share of total budget |
| Recommendation | Badge |

### Recommendation Logic

| Recommendation | Condition |
|----------------|-----------|
| Navysit (green) | ROAS > 2x avg, fatigue < 50, engagement > 60 |
| Udrzet (gray) | ROAS around avg, fatigue < 75 |
| Snizit (orange) | ROAS < avg OR fatigue > 75 |
| Vypnout (red) | ROAS < 0.5 OR (fatigue = critical AND ROAS < avg) |

### Placement

New fourth view mode "Budget" on creatives page (alongside grid/table/tree). Icon: `PieChart` from lucide-react.

### Data

All from existing `meta_ad_creatives` + fatigue — no new API calls. Opportunity score computed client-side.

### Files

| Action | Path |
|--------|------|
| New component | `src/components/creatives/budget-bubble-chart.tsx` |
| New component | `src/components/creatives/budget-table.tsx` |
| New lib | `src/lib/budget-allocation.ts` (opportunity score + recommendation logic) |
| Modify | `src/app/dashboard/[shopId]/creatives/page.tsx` (add Budget view mode) |

---

## Shared Dependencies

- Recharts — already installed (`^3.8.1`), first real usage
- `useDailyInsights` hook — shared between detail page, comparison, sparkline
- All new pages under existing `/dashboard/[shopId]/creatives/` route

## Non-Goals

- Email notifications (Phase 6)
- Historical fatigue tracking beyond 30 days
- AI-generated budget recommendations (manual rules only)
