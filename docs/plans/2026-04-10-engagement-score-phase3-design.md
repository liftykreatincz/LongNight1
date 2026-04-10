# Engagement Score Phase 3 — Design

**Status:** Approved (overnight autonomous execution)
**Date:** 2026-04-10
**Owner:** Jakub

## Goal

Add rolling window config per shop, drift detection (>20 %) with accept/rollback UI, snapshot history, and daily cron auto-recompute.

## Non-Goals

- AM approval flow (Fáze 3+ in original plan, but YAGNI for single-user app)
- Email alerts (in-app banner only)
- Weekly snapshots / Fatigue Index (Fáze 4)
- Diagnostic matrix UI (Fáze 5)

## Architecture

### Data model

1. `shops.benchmark_window_days integer null` — 30 / 60 / 90 / null (= all-time). Default 30.
2. `shops.drift_detected_at timestamptz null` — set when recompute finds any metric diffing >20 % from previous snapshot; cleared on accept/rollback.
3. `shop_benchmark_snapshots` — new table, same shape as `shop_benchmarks` + `snapshot_at timestamptz not null`. Rolled at each recompute (copy current `shop_benchmarks` before replace).
4. `CRON_SECRET` env var — shared secret for `/api/cron/*` endpoints.

### Flows

**Recompute:**
1. Fetch shop's `benchmark_window_days`
2. Apply window filter in `recomputeBenchmarksForShop` (null → all-time)
3. Snapshot current `shop_benchmarks` into `shop_benchmark_snapshots` (same `computed_at` → new `snapshot_at`)
4. Delete + insert new benchmarks (existing behavior)
5. Compare new rows vs latest snapshot per `(format, campaign_type, metric)`. If any metric's `top` or `good` or `hranice` changes by > 20 % relative, set `drift_detected_at = now()`
6. Return `{updated, driftDetected}` for UI toast

**Accept drift:** POST `/api/benchmarks/accept-drift` → set `drift_detected_at = null`.

**Rollback:** POST `/api/benchmarks/rollback` body `{shopId, snapshotAt}` → copy that snapshot back into `shop_benchmarks` (delete current + insert snapshot rows) + clear `drift_detected_at`.

**History:** GET `/api/benchmarks/history?shopId=...` → last 10 distinct `snapshot_at` values with row counts.

**Cron:** `POST /api/cron/recompute-benchmarks` protected by `x-cron-secret` header. Iterates `shops` sequentially, catches errors per shop, returns `{processed, failed}`. `vercel.json` cron: `0 3 * * *`.

### UI changes

- `/creatives` page: window selector chip row (30d / 60d / 90d / all) next to existing filter chips. Changing triggers recompute + invalidate queries.
- Drift banner above creatives table when `shops.drift_detected_at != null`: "⚠️ Benchmarky se výrazně změnily. [Zobrazit rozdíly] [Přijmout] [Rollback]". Rollback menu shows last 10 snapshots.

## Risks

- Rollback race: if two users click at the same moment. Acceptable (single-user app).
- Snapshot table grows unbounded. For MVP we keep it small; later phase can add TTL.
- Cron retries: Vercel cron won't retry on failure. If a shop errors we log and skip.
