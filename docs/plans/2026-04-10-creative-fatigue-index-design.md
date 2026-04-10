# Phase 4 — Creative Fatigue Index Design

## Overview

Detect creative fatigue (ad wear-out) by tracking daily performance trends per creative. Uses Meta API daily breakdowns to compute a fatigue score (0-100) based on CTR decline + frequency buildup.

## Data Model

### New table: `meta_ad_creative_daily`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid PK (gen_random_uuid) | |
| `shop_id` | uuid FK → shops | |
| `ad_id` | text | Meta ad ID |
| `date` | date | Day |
| `impressions` | integer | |
| `clicks` | integer | |
| `ctr` | numeric | |
| `cpm` | numeric | |
| `spend` | numeric | |
| `frequency` | numeric | |
| `purchases` | integer | |
| `link_clicks` | integer | |

Unique constraint: `(shop_id, ad_id, date)`. RLS enabled.

### New columns on `meta_ad_creatives`

- `fatigue_score` numeric null — 0 (fresh) to 100 (fully fatigued)
- `fatigue_signal` text null — check: `('none','rising','fatigued','critical')`
- `fatigue_computed_at` timestamptz null

## Fatigue Calculation

Computed during sync, after daily data upsert.

### Algorithm

1. Take last 30 days of daily data for a creative
2. Split into two halves: **first 15 days** vs **last 15 days**
3. Compute:
   - `ctr_change` = avg CTR last 15d / avg CTR first 15d
   - `freq_current` = avg frequency last 7 days
4. Score:
   - `base = clamp((1 - ctr_change) * 50, 0, 50)` — CTR decline contribution
   - `freq_bonus = min(freq_current / 4, 1) * 50` — frequency ≥4 adds max 50
   - `fatigue_score = clamp(base + freq_bonus, 0, 100)`

### Signal Classification

| Score | Signal | Label (CZ) |
|-------|--------|------------|
| 0-25 | `none` | Cerstvy |
| 26-50 | `rising` | Zacina opotrebeni |
| 51-75 | `fatigued` | Unavena |
| 76-100 | `critical` | Kriticka unava |

### Edge Cases

- Less than 7 days of data → `fatigue_score = null`, `signal = null`
- CTR increasing → base = 0 (never negative)
- Days with 0 impressions are skipped
- Creatives outside 30d window → `fatigue_score = null`

## Sync Flow Changes

### Meta API call change

Current: single aggregate over 36 months.
New: **two calls** per sync:
1. `time_increment=1` for last 30 days → daily breakdown → `meta_ad_creative_daily` + aggregate computation
2. Keep existing 36-month aggregate for creatives with `date_stop` older than 30 days (historical data preservation)

Daily data response from Meta returns array of `{ date_start, impressions, clicks, ctr, cpm, spend, frequency, ... }` per ad per day.

### Processing order

1. Fetch ads + campaigns (unchanged)
2. Fetch daily insights (`time_increment=1`, last 30 days)
3. Compute aggregates from daily data (sum/avg) for `meta_ad_creatives` upsert
4. Upsert daily rows into `meta_ad_creative_daily`
5. Compute fatigue score per creative
6. Write `fatigue_score`, `fatigue_signal`, `fatigue_computed_at` to `meta_ad_creatives`
7. Trigger benchmark recompute if stale (unchanged)

## UI

### Grid view — fatigue badge

- Small icon next to engagement score badge (top-right of card)
- `rising` → yellow moon icon, `fatigued` → orange, `critical` → red
- Hover tooltip: "Fatigue: 62/100 · Unavena · CTR -34%, freq 3.2 · Poslednich 30 dni"
- `none` or `null` → nothing displayed

### Table view — new "Fatigue" column

- Sortable column next to Engagement Score
- Shows score number + colored indicator
- Filterable via existing dropdown (add "Unavene" filter option)

### Banner

- Shown when ≥1 active creative has `signal = "critical"`
- Amber banner (same style as drift banner): "N aktivnich kreativ vykazuje kritickou unavu. Zvazte nove vizualy."
- Click on banner filters to show only fatigued creatives

### Info label

All tooltips and banner include note: "Pocitano z poslednich 30 dni"

## Files to Modify/Create

| Action | Path |
|--------|------|
| New migration | `supabase/migrations/20260410_creative_fatigue.sql` |
| New lib | `src/lib/fatigue/compute.ts` |
| New lib | `src/lib/fatigue/types.ts` |
| Modify | `src/app/api/creatives/sync/route.ts` (daily fetch + fatigue compute) |
| New component | `src/components/creatives/fatigue-badge.tsx` |
| New component | `src/components/creatives/fatigue-banner.tsx` |
| Modify | `src/app/dashboard/[shopId]/creatives/page.tsx` (badge, column, banner, filter) |
| Modify | `src/hooks/useCreativeAnalysis.ts` (add fatigue fields to CreativeRow) |
