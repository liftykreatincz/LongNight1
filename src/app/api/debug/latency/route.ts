import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Temporary diagnostic endpoint. Measures server-side timing for
// supabase.auth.getUser() and a simple shops.select(1) query.
// Remove once perf investigation is done.
export async function GET() {
  const region = process.env.VERCEL_REGION || "unknown";

  const t0 = Date.now();
  const supabase = await createClient();
  const tAfterClient = Date.now();

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  const tAfterGetUser = Date.now();

  let shopsMs = -1;
  let shopCount = 0;
  if (userData.user) {
    const t2 = Date.now();
    const { data, error } = await supabase
      .from("shops")
      .select("id")
      .eq("user_id", userData.user.id);
    shopsMs = Date.now() - t2;
    shopCount = data?.length ?? 0;
    if (error) {
      return NextResponse.json({
        region,
        error: "shops select failed",
        message: error.message,
      });
    }
  }

  // Second getUser to see if it's now cached / warm connection
  const t3 = Date.now();
  await supabase.auth.getUser();
  const getUser2Ms = Date.now() - t3;

  return NextResponse.json({
    region,
    createClientMs: tAfterClient - t0,
    getUserMs: tAfterGetUser - tAfterClient,
    getUser2Ms,
    shopsMs,
    shopCount,
    userErr: userErr?.message ?? null,
    totalMs: Date.now() - t0,
  });
}
