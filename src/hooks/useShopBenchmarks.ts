"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type {
  BenchmarkSet,
  Format,
  MetricKey,
  MetricThresholds,
} from "@/lib/engagement-score";
import { DEFAULT_BENCHMARKS } from "@/lib/engagement-score";

interface BenchmarkRow {
  format: Format;
  campaign_type: string;
  metric: MetricKey;
  fail: number;
  hranice: number;
  good: number;
  top: number;
  sample_size: number;
  is_default: boolean;
}

/**
 * Groups raw `shop_benchmarks` rows into a `Map<string, BenchmarkSet>` keyed
 * by `${format}:${campaign_type}`, ready to be consumed by `scoreCreative`.
 * Seeds the `all` key from agency defaults when the shop has no rows at all
 * so downstream resolution never hits the default-agency branch unless
 * intentionally needed.
 */
function rowsToBenchmarksMap(rows: BenchmarkRow[]): Map<string, BenchmarkSet> {
  const map = new Map<string, BenchmarkSet>();
  // Group by key
  const grouped = new Map<
    string,
    { format: Format; sample_size: number; metrics: MetricThresholds }
  >();
  for (const row of rows) {
    const key = `${row.format}:${row.campaign_type}`;
    let entry = grouped.get(key);
    if (!entry) {
      entry = { format: row.format, sample_size: row.sample_size, metrics: {} };
      grouped.set(key, entry);
    }
    entry.metrics[row.metric] = {
      fail: row.fail,
      hranice: row.hranice,
      good: row.good,
      top: row.top,
    };
    // sample_size should be identical across metrics in the same segment,
    // but guard against drift by keeping the highest seen.
    if (row.sample_size > entry.sample_size) entry.sample_size = row.sample_size;
  }
  for (const [key, entry] of grouped.entries()) {
    map.set(key, {
      format: entry.format,
      metrics: entry.metrics,
      sample_size: entry.sample_size,
    });
  }
  return map;
}

function defaultsFallbackMap(): Map<string, BenchmarkSet> {
  const map = new Map<string, BenchmarkSet>();
  for (const format of ["image", "video"] as const) {
    map.set(`${format}:all`, {
      format,
      metrics: DEFAULT_BENCHMARKS[format],
      sample_size: 0,
    });
  }
  return map;
}

export function useShopBenchmarks(shopId: string) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["shop-benchmarks", shopId],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Map<string, BenchmarkSet>> => {
      const { data, error } = await supabase
        .from("shop_benchmarks")
        .select(
          "format,campaign_type,metric,fail,hranice,good,top,sample_size,is_default"
        )
        .eq("shop_id", shopId);

      if (error) {
        console.error("[useShopBenchmarks]", error);
        return defaultsFallbackMap();
      }

      if (!data || data.length === 0) {
        return defaultsFallbackMap();
      }

      return rowsToBenchmarksMap(data as unknown as BenchmarkRow[]);
    },
  });
}
