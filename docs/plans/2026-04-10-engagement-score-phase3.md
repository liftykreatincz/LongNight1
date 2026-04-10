# Engagement Score Phase 3 — Implementation Plan

> **For Claude:** Execute task-by-task via superpowers:subagent-driven-development. TDD required. Commit + push per task. On 2× failure of the same task: log it in `docs/plans/phase3-skip-log.md` and skip.

**Goal:** Rolling window config per shop, drift detection (>20%) with accept/rollback, snapshot history, daily cron auto-recompute.

**Architecture:** See [2026-04-10-engagement-score-phase3-design.md](./2026-04-10-engagement-score-phase3-design.md)

**Tech Stack:** Next.js 16 App Router, Supabase, TanStack Query v5, Vitest, Tailwind, shadcn/ui

**Defaults approved:**
- Drift threshold: 20 %, compare vs latest snapshot
- Windows: 30 / 60 / 90 / all-time (null), default 30
- Change window → immediate recompute
- Vercel cron, daily 03:00 UTC, continue-on-error
- Push to main per commit
- DB migration: leave SQL block in final summary for user to run manually
- Skip task on 2× failure, log it
- `bun add` dev deps freely, ask for runtime deps
- TDD red→green→refactor per task

---

### Task P3-1: DB migration

**Files:**
- Create: `supabase/migrations/20260410_engagement_score_phase3.sql`

**Migration SQL** (will NOT be auto-applied; user runs manually):

```sql
-- Phase 3: rolling window + drift detection + snapshots
alter table public.shops
  add column if not exists benchmark_window_days integer null,
  add column if not exists drift_detected_at timestamptz null;

create table if not exists public.shop_benchmark_snapshots (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  snapshot_at timestamptz not null default now(),
  format text not null check (format in ('image','video')),
  campaign_type text not null default 'all'
    check (campaign_type in ('all','evergreen','sale','seasonal')),
  metric text not null,
  fail numeric not null,
  hranice numeric not null,
  good numeric not null,
  top numeric not null,
  sample_size integer not null default 0,
  is_default boolean not null default false,
  computed_at timestamptz not null
);

create index if not exists shop_benchmark_snapshots_shop_time_idx
  on public.shop_benchmark_snapshots (shop_id, snapshot_at desc);

alter table public.shop_benchmark_snapshots enable row level security;

create policy "shop_benchmark_snapshots_select_own"
  on public.shop_benchmark_snapshots for select
  using (exists (select 1 from public.shops s
    where s.id = shop_benchmark_snapshots.shop_id and s.user_id = auth.uid()));

create policy "shop_benchmark_snapshots_insert_own"
  on public.shop_benchmark_snapshots for insert
  with check (exists (select 1 from public.shops s
    where s.id = shop_benchmark_snapshots.shop_id and s.user_id = auth.uid()));

create policy "shop_benchmark_snapshots_delete_own"
  on public.shop_benchmark_snapshots for delete
  using (exists (select 1 from public.shops s
    where s.id = shop_benchmark_snapshots.shop_id and s.user_id = auth.uid()));
```

**Commit message:** `feat(db): phase 3 migration — benchmark window + drift + snapshots`

---

### Task P3-2: Rolling window in recomputeBenchmarksForShop

**Files:**
- Modify: `src/lib/engagement-score/recompute-helper.ts`
- Create: `src/lib/engagement-score/recompute-helper.test.ts`

**Change:** Read `shops.benchmark_window_days` (default 30, null = all-time). If null, skip the `.gte("date_stop", ...)` filter entirely; if set, use that value instead of hardcoded 30.

**Tests (TDD):**
- Given `shops.benchmark_window_days = null`, fetch uses no date filter
- Given `shops.benchmark_window_days = 60`, fetch uses 60-day cutoff
- Given `shops.benchmark_window_days` missing, defaults to 30

Use a mock Supabase client (function spies) — don't hit real DB.

**Commit:** `feat(score): honor shop.benchmark_window_days in recompute`

---

### Task P3-3: Snapshot-on-recompute + drift detection

**Files:**
- Modify: `src/lib/engagement-score/recompute-helper.ts`
- Create: `src/lib/engagement-score/drift-detector.ts`
- Create: `src/lib/engagement-score/drift-detector.test.ts`

**New module `drift-detector.ts`:**

```ts
export const DRIFT_THRESHOLD = 0.2; // 20 %

export interface BenchmarkRowLite {
  format: string;
  campaign_type: string;
  metric: string;
  fail: number;
  hranice: number;
  good: number;
  top: number;
}

/**
 * Returns true if any metric's fail/hranice/good/top differs by more than
 * DRIFT_THRESHOLD (relative) between `previous` and `current`. Rows are
 * matched by (format, campaign_type, metric). Metrics present in only one
 * side are ignored.
 */
export function detectDrift(
  previous: BenchmarkRowLite[],
  current: BenchmarkRowLite[]
): boolean {
  const prevMap = new Map<string, BenchmarkRowLite>();
  for (const r of previous) {
    prevMap.set(`${r.format}:${r.campaign_type}:${r.metric}`, r);
  }
  for (const cur of current) {
    const prev = prevMap.get(`${cur.format}:${cur.campaign_type}:${cur.metric}`);
    if (!prev) continue;
    for (const k of ["fail", "hranice", "good", "top"] as const) {
      const p = prev[k];
      const c = cur[k];
      if (!Number.isFinite(p) || p === 0) continue;
      if (Math.abs(c - p) / Math.abs(p) > DRIFT_THRESHOLD) return true;
    }
  }
  return false;
}
```

**Tests:**
- No change → `false`
- 21% change in one metric → `true`
- 19% change → `false`
- Previous zero → ignored (no false positive)
- Added/removed metric → ignored

**Recompute helper changes:**
1. Before delete, SELECT current `shop_benchmarks` rows and INSERT them into `shop_benchmark_snapshots` with `snapshot_at = now()`.
2. After new INSERT, call `detectDrift(previousRows, upsertRows)`.
3. If true, UPDATE `shops.drift_detected_at = now()`.
4. Return `{updated, driftDetected}`.

**Commit:** `feat(score): snapshot on recompute + 20% drift detection`

---

### Task P3-4: Rollback helper

**Files:**
- Create: `src/lib/engagement-score/rollback-helper.ts`
- Create: `src/lib/engagement-score/rollback-helper.test.ts`

**API:** `rollbackBenchmarks(supabase, shopId, snapshotAt)` → delete current `shop_benchmarks` for shop, insert rows from `shop_benchmark_snapshots where snapshot_at = $1`, set `shops.drift_detected_at = null`.

**Tests:** success path + error path if snapshot not found.

**Commit:** `feat(score): rollback-to-snapshot helper`

---

### Task P3-5: GET /api/benchmarks/history

**Files:**
- Create: `src/app/api/benchmarks/history/route.ts`

Returns `{snapshots: [{snapshotAt, rowCount}]}` — latest 10 distinct `snapshot_at` values for shop. Auth + ownership check like existing routes.

**Tests:** skip route tests (existing routes have none); verify via typecheck + build.

**Commit:** `feat(api): GET /api/benchmarks/history`

---

### Task P3-6: POST /api/benchmarks/rollback + /api/benchmarks/accept-drift

**Files:**
- Create: `src/app/api/benchmarks/rollback/route.ts`
- Create: `src/app/api/benchmarks/accept-drift/route.ts`

Rollback accepts `{shopId, snapshotAt}`, calls `rollbackBenchmarks`. Accept-drift accepts `{shopId}` and sets `drift_detected_at = null`. Both auth + ownership.

**Commit:** `feat(api): POST /api/benchmarks/rollback + accept-drift`

---

### Task P3-7: Cron endpoint + vercel.json

**Files:**
- Create: `src/app/api/cron/recompute-benchmarks/route.ts`
- Modify: `vercel.json`
- Modify: `.env.local.example` (create if absent)

**Cron route:**
- Check `x-cron-secret` header matches `process.env.CRON_SECRET`; 401 if not.
- Use service-role client (no user auth) — see if `SUPABASE_SERVICE_ROLE_KEY` is present; if not, fall back to `createClient()` which won't help. Use service role.
- Fetch all shops with `select("id")`.
- For each: `try { await recomputeBenchmarksForShop(supabase, id); processed++ } catch { failed++ }`.
- Return `{processed, failed}`.

**vercel.json:**

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "regions": ["fra1"],
  "crons": [
    { "path": "/api/cron/recompute-benchmarks", "schedule": "0 3 * * *" }
  ]
}
```

Vercel Cron automatically sends an `Authorization: Bearer ${CRON_SECRET}` header when `CRON_SECRET` env var is set — prefer that over custom header. Adjust route accordingly.

**.env.local.example:** add `CRON_SECRET=your-random-string`

**Commit:** `feat(cron): daily benchmark auto-recompute via vercel cron`

---

### Task P3-8: useShopBenchmarkWindow hook + Window selector UI

**Files:**
- Create: `src/hooks/useShopBenchmarkWindow.ts`
- Modify: `src/app/dashboard/[shopId]/creatives/page.tsx`
- Create: `src/components/creatives/window-selector.tsx`

**Hook:** useQuery for `shops.benchmark_window_days` + useMutation to update. On success: invalidate `["shop-benchmarks", shopId]` and `["creative-analysis", shopId]`, and POST `/api/benchmarks/recompute` to trigger fresh compute.

**Component:** Chip row `30d | 60d | 90d | Vše`. Pill style matching existing filter chips. On click → mutation.

**Integrate** next to existing filter chips on creatives page.

**Commit:** `feat(ui): rolling window selector`

---

### Task P3-9: Drift banner UI

**Files:**
- Create: `src/hooks/useDriftState.ts`
- Create: `src/components/creatives/drift-banner.tsx`
- Modify: `src/app/dashboard/[shopId]/creatives/page.tsx`

**useDriftState:** useQuery for `shops.drift_detected_at`, useMutations for accept + rollback. Also useQuery for `/api/benchmarks/history`.

**Banner:** shown when `drift_detected_at != null`. Yellow border. Text: "⚠️ Benchmarky se výrazně změnily od posledního přepočtu." Buttons: "Přijmout" (POST accept-drift), "Rollback" (dropdown listing last 10 snapshots).

**Commit:** `feat(ui): drift banner with accept/rollback`

---

### Task P3-10: Final verification + summary

1. Run full typecheck: `bunx tsc --noEmit`
2. Run full test suite: `bunx vitest run`
3. Run build: `bunx next build`
4. Push any remaining commits
5. Append Phase 3 summary to `docs/plans/phase3-execution-log.md` including:
   - Migration SQL block (for user to copy-paste)
   - Env var to set: `CRON_SECRET`
   - List of commits
   - Test counts before/after

**Commit (empty):** `chore: ES phase 3 implementation complete`

---

## Execution Notes

- All DB writes during execution will be against **mock clients in tests only** — actual DB migration is manual.
- The API routes will fail at runtime on `localhost` until user runs the migration, but build + typecheck will pass.
- Cron endpoint can be tested locally with `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/recompute-benchmarks`.
