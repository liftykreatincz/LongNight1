import { describe, it, expect } from "vitest";
import { rollbackBenchmarks } from "./rollback-helper";

/* ------------------------------------------------------------------ */
/*  Supabase mock                                                      */
/* ------------------------------------------------------------------ */

interface CallRecord {
  table: string;
  method: string;
  args: unknown[];
}

function createMockSupabase(overrides?: {
  snapshotRows?: Record<string, unknown>[];
}) {
  const calls: CallRecord[] = [];
  const snapshotRows = overrides?.snapshotRows ?? [];

  function chainBuilder(table: string, startMethod: string) {
    const builder: Record<string, unknown> = {};

    for (const m of ["select", "eq", "gte", "lte", "order", "limit"]) {
      builder[m] = (...args: unknown[]) => {
        calls.push({ table, method: m, args });
        return builder;
      };
    }

    builder.maybeSingle = () => {
      calls.push({ table, method: "maybeSingle", args: [] });
      return Promise.resolve({ data: null, error: null });
    };

    builder.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
      let data: unknown[] = [];
      if (table === "shop_benchmark_snapshots" && startMethod === "select") {
        data = snapshotRows;
      }
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

  return { supabase: supabase as unknown as Parameters<typeof rollbackBenchmarks>[0], calls };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("rollbackBenchmarks", () => {
  const snapshotAt = "2026-04-01T00:00:00Z";

  it("restores benchmarks from snapshot and clears drift_detected_at", async () => {
    const snapshotRows = [
      {
        id: "snap-1",
        snapshot_at: snapshotAt,
        format: "image",
        campaign_type: "all",
        metric: "ctr_link",
        fail: 10,
        hranice: 20,
        good: 30,
        top: 40,
        sample_size: 25,
        is_default: false,
        computed_at: "2026-03-30T00:00:00Z",
      },
      {
        id: "snap-2",
        snapshot_at: snapshotAt,
        format: "video",
        campaign_type: "all",
        metric: "hook_rate",
        fail: 5,
        hranice: 10,
        good: 15,
        top: 20,
        sample_size: 18,
        is_default: false,
        computed_at: "2026-03-30T00:00:00Z",
      },
    ];

    const { supabase, calls } = createMockSupabase({ snapshotRows });

    const result = await rollbackBenchmarks(supabase, "shop-1", snapshotAt);
    expect(result).toEqual({ restored: 2 });

    // Should have deleted current shop_benchmarks
    const benchmarkDeletes = calls.filter(
      (c) => c.table === "shop_benchmarks" && c.method === "delete"
    );
    expect(benchmarkDeletes).toHaveLength(1);

    // Should have inserted into shop_benchmarks (without id and snapshot_at)
    const benchmarkInserts = calls.filter(
      (c) => c.table === "shop_benchmarks" && c.method === "insert"
    );
    expect(benchmarkInserts).toHaveLength(1);
    const insertedRows = benchmarkInserts[0].args[0] as Array<Record<string, unknown>>;
    expect(insertedRows).toHaveLength(2);
    // Verify id and snapshot_at are stripped
    expect(insertedRows[0]).not.toHaveProperty("id");
    expect(insertedRows[0]).not.toHaveProperty("snapshot_at");
    expect(insertedRows[0]).toHaveProperty("shop_id", "shop-1");
    expect(insertedRows[0]).toHaveProperty("format", "image");

    // Should have cleared drift_detected_at
    const shopUpdates = calls.filter(
      (c) => c.table === "shops" && c.method === "update"
    );
    expect(shopUpdates).toHaveLength(1);
    const updateArg = shopUpdates[0].args[0] as Record<string, unknown>;
    expect(updateArg).toEqual({ drift_detected_at: null });
  });

  it("throws when snapshot not found", async () => {
    const { supabase } = createMockSupabase({ snapshotRows: [] });

    await expect(
      rollbackBenchmarks(supabase, "shop-1", "2099-01-01T00:00:00Z")
    ).rejects.toThrow("Snapshot not found");
  });
});
