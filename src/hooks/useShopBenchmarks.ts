"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Benchmarks, Format, MetricKey, Thresholds } from "@/lib/engagement-score";
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
      [MetricKey, Thresholds]
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

      return rowsToBenchmarks(data as unknown as BenchmarkRow[]);
    },
  });
}
