import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface SnapshotEntry {
  snapshotAt: string;
  rowCount: number;
}

export async function GET(req: NextRequest) {
  try {
    const shopId = req.nextUrl.searchParams.get("shopId");
    if (!shopId) {
      return NextResponse.json({ error: "Missing shopId" }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Ownership check
    const { data: shop } = await supabase
      .from("shops")
      .select("id")
      .eq("id", shopId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!shop) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Fetch all snapshot_at values for this shop
    const { data: rows, error } = await supabase
      .from("shop_benchmark_snapshots")
      .select("snapshot_at")
      .eq("shop_id", shopId)
      .order("snapshot_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Deduplicate and count occurrences, limited to last 10 unique timestamps
    const countMap = new Map<string, number>();
    for (const row of rows ?? []) {
      const ts = row.snapshot_at as string;
      countMap.set(ts, (countMap.get(ts) ?? 0) + 1);
    }

    const snapshots: SnapshotEntry[] = [];
    for (const [snapshotAt, rowCount] of countMap) {
      if (snapshots.length >= 10) break;
      snapshots.push({ snapshotAt, rowCount });
    }

    return NextResponse.json({ snapshots });
  } catch (e) {
    console.error("[benchmarks/history] error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
