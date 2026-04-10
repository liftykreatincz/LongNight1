import { describe, it, expect, vi, beforeEach } from "vitest";
import { recomputeBenchmarksForShop } from "./recompute-helper";

/* ------------------------------------------------------------------ */
/*  Minimal Supabase mock builder                                     */
/* ------------------------------------------------------------------ */

interface CallRecord {
  table: string;
  method: string;
  args: unknown[];
}

function createMockSupabase(overrides?: {
  shopRow?: Record<string, unknown> | null;
  creativeRows?: Record<string, unknown>[];
  campaignRows?: Record<string, unknown>[];
  benchmarkRows?: Record<string, unknown>[];
}) {
  const calls: CallRecord[] = [];

  const creativeRows = overrides?.creativeRows ?? [];
  const campaignRows = overrides?.campaignRows ?? [];
  const shopRow = overrides?.shopRow ?? { cpa_target_czk: 300, benchmark_window_days: undefined };
  const benchmarkRows = overrides?.benchmarkRows ?? [];

  function chainBuilder(table: string, startMethod: string) {
    let currentArgs: unknown[] = [];

    const builder: Record<string, unknown> = {};
    const addMethod = (name: string) => {
      builder[name] = (...args: unknown[]) => {
        calls.push({ table, method: name, args });
        return builder;
      };
      return builder;
    };

    // Chain methods that return self
    for (const m of ["select", "eq", "gte", "lte", "gt", "lt", "in", "order", "limit"]) {
      addMethod(m);
    }

    // Terminal methods
    builder.maybeSingle = () => {
      calls.push({ table, method: "maybeSingle", args: [] });
      if (table === "shops" && startMethod === "select") {
        return Promise.resolve({ data: shopRow, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    };

    // Make the builder thenable so `await` resolves it
    builder.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
      let data: unknown[] = [];
      if (table === "meta_ad_creatives") data = creativeRows;
      else if (table === "meta_ad_campaigns") data = campaignRows;
      else if (table === "shop_benchmarks" && startMethod === "select") data = benchmarkRows;
      return Promise.resolve({ data, error: null }).then(resolve, reject);
    };

    return builder;
  }

  const supabase = {
    from: (table: string) => {
      const tableObj: Record<string, unknown> = {};

      tableObj.select = (...args: unknown[]) => {
        calls.push({ table, method: "select", args });
        return chainBuilder(table, "select");
      };

      tableObj.delete = () => {
        calls.push({ table, method: "delete", args: [] });
        const delChain: Record<string, unknown> = {};
        delChain.eq = (...args: unknown[]) => {
          calls.push({ table, method: "eq", args });
          return Promise.resolve({ data: null, error: null });
        };
        return delChain;
      };

      tableObj.insert = (rows: unknown) => {
        calls.push({ table, method: "insert", args: [rows] });
        return Promise.resolve({ data: null, error: null });
      };

      tableObj.update = (values: unknown) => {
        calls.push({ table, method: "update", args: [values] });
        const updChain: Record<string, unknown> = {};
        updChain.eq = (...args: unknown[]) => {
          calls.push({ table, method: "eq", args });
          return Promise.resolve({ data: null, error: null });
        };
        return updChain;
      };

      return tableObj;
    },
  };

  return { supabase: supabase as unknown as Parameters<typeof recomputeBenchmarksForShop>[0], calls };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("recomputeBenchmarksForShop – rolling window", () => {
  it("uses no date filter when benchmark_window_days = null (all-time)", async () => {
    const { supabase, calls } = createMockSupabase({
      shopRow: { cpa_target_czk: 300, benchmark_window_days: null },
    });

    await recomputeBenchmarksForShop(supabase, "shop-1");

    // Should NOT have a .gte call on meta_ad_creatives with date_stop
    const gteOnCreatives = calls.filter(
      (c) => c.table === "meta_ad_creatives" && c.method === "gte"
    );
    expect(gteOnCreatives).toHaveLength(0);
  });

  it("uses 60-day cutoff when benchmark_window_days = 60", async () => {
    const { supabase, calls } = createMockSupabase({
      shopRow: { cpa_target_czk: 300, benchmark_window_days: 60 },
    });

    const now = Date.now();
    await recomputeBenchmarksForShop(supabase, "shop-1");

    const gteOnCreatives = calls.filter(
      (c) => c.table === "meta_ad_creatives" && c.method === "gte"
    );
    expect(gteOnCreatives).toHaveLength(1);

    const isoArg = gteOnCreatives[0].args[1] as string;
    const cutoffDate = new Date(isoArg).getTime();
    // Should be ~60 days ago (within 5s tolerance)
    const expected = now - 60 * 24 * 60 * 60 * 1000;
    expect(Math.abs(cutoffDate - expected)).toBeLessThan(5_000);
  });

  it("defaults to 30-day window when benchmark_window_days is missing/undefined", async () => {
    const { supabase, calls } = createMockSupabase({
      shopRow: { cpa_target_czk: 300 },
    });

    const now = Date.now();
    await recomputeBenchmarksForShop(supabase, "shop-1");

    const gteOnCreatives = calls.filter(
      (c) => c.table === "meta_ad_creatives" && c.method === "gte"
    );
    expect(gteOnCreatives).toHaveLength(1);

    const isoArg = gteOnCreatives[0].args[1] as string;
    const cutoffDate = new Date(isoArg).getTime();
    const expected = now - 30 * 24 * 60 * 60 * 1000;
    expect(Math.abs(cutoffDate - expected)).toBeLessThan(5_000);
  });
});

describe("recomputeBenchmarksForShop – drift detection", () => {
  it("detects drift when a metric changes >20% and updates shops.drift_detected_at", async () => {
    const previousBenchmarks = [
      {
        format: "image",
        campaign_type: "all",
        metric: "ctr_link",
        fail: 100,
        hranice: 200,
        good: 300,
        top: 400,
        sample_size: 20,
        is_default: false,
        computed_at: "2026-01-01T00:00:00Z",
      },
    ];

    const { supabase, calls } = createMockSupabase({
      shopRow: { cpa_target_czk: 300, benchmark_window_days: null },
      benchmarkRows: previousBenchmarks,
    });

    const result = await recomputeBenchmarksForShop(supabase, "shop-1");

    // Default benchmarks have very different values from our previous rows,
    // so drift should be detected.
    expect(result.driftDetected).toBe(true);

    // Verify shops.update was called with drift_detected_at
    const shopUpdates = calls.filter(
      (c) => c.table === "shops" && c.method === "update"
    );
    expect(shopUpdates.length).toBeGreaterThanOrEqual(1);
    const updateArg = shopUpdates[0].args[0] as Record<string, unknown>;
    expect(updateArg).toHaveProperty("drift_detected_at");
  });

  it("returns driftDetected: false and skips snapshot when no previous rows exist", async () => {
    const { supabase, calls } = createMockSupabase({
      shopRow: { cpa_target_czk: 300, benchmark_window_days: null },
      benchmarkRows: [], // no previous benchmarks
    });

    const result = await recomputeBenchmarksForShop(supabase, "shop-1");

    expect(result.driftDetected).toBe(false);

    // No snapshot insert should have happened
    const snapshotInserts = calls.filter(
      (c) => c.table === "shop_benchmark_snapshots" && c.method === "insert"
    );
    expect(snapshotInserts).toHaveLength(0);

    // No shops.update for drift
    const shopUpdates = calls.filter(
      (c) => c.table === "shops" && c.method === "update"
    );
    expect(shopUpdates).toHaveLength(0);
  });

  it("inserts snapshot rows when previous benchmarks exist", async () => {
    const previousBenchmarks = [
      {
        format: "image",
        campaign_type: "all",
        metric: "ctr_link",
        fail: 100,
        hranice: 200,
        good: 300,
        top: 400,
        sample_size: 20,
        is_default: false,
        computed_at: "2026-01-01T00:00:00Z",
      },
    ];

    const { supabase, calls } = createMockSupabase({
      shopRow: { cpa_target_czk: 300, benchmark_window_days: null },
      benchmarkRows: previousBenchmarks,
    });

    await recomputeBenchmarksForShop(supabase, "shop-1");

    const snapshotInserts = calls.filter(
      (c) => c.table === "shop_benchmark_snapshots" && c.method === "insert"
    );
    expect(snapshotInserts).toHaveLength(1);

    const insertedRows = snapshotInserts[0].args[0] as Array<Record<string, unknown>>;
    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0]).toHaveProperty("snapshot_at");
    expect(insertedRows[0].shop_id).toBe("shop-1");
    expect(insertedRows[0].format).toBe("image");
  });
});
