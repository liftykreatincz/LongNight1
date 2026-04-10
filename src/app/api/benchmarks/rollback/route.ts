import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rollbackBenchmarks } from "@/lib/engagement-score/rollback-helper";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const shopId = body?.shopId;
    const snapshotAt = body?.snapshotAt;

    if (
      typeof shopId !== "string" ||
      shopId.length === 0 ||
      typeof snapshotAt !== "string" ||
      snapshotAt.length === 0
    ) {
      return NextResponse.json(
        { error: "Missing shopId or snapshotAt" },
        { status: 400 }
      );
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

    const result = await rollbackBenchmarks(supabase, shopId, snapshotAt);
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    if (message === "Snapshot not found") {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    console.error("[benchmarks/rollback] error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
