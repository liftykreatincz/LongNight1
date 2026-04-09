import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recomputeBenchmarksForShop } from "@/lib/engagement-score/recompute-helper";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const shopId = body?.shopId;
    if (typeof shopId !== "string" || shopId.length === 0) {
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

    const result = await recomputeBenchmarksForShop(supabase, shopId);
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    console.error("[benchmarks/recompute] error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
