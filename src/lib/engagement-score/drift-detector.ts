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
