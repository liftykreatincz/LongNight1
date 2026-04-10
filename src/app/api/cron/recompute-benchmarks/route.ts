import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { recomputeBenchmarksForShop } from "@/lib/engagement-score/recompute-helper";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const expected = `Bearer ${process.env.CRON_SECRET}`;

    if (!process.env.CRON_SECRET || authHeader !== expected) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServiceRoleClient();

    const { data: shops, error: shopsError } = await supabase
      .from("shops")
      .select("id");

    if (shopsError) {
      return NextResponse.json(
        { error: shopsError.message },
        { status: 500 }
      );
    }

    let processed = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const shop of shops ?? []) {
      try {
        await recomputeBenchmarksForShop(supabase, shop.id as string);
        processed++;
      } catch (e) {
        failed++;
        const message = e instanceof Error ? e.message : String(e);
        errors.push(`${shop.id}: ${message}`);
      }
    }

    return NextResponse.json({ processed, failed, errors });
  } catch (e) {
    console.error("[cron/recompute-benchmarks] error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
