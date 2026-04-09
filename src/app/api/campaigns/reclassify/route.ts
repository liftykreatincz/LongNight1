import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { classifyCampaign } from "@/lib/campaign-classifier";

export async function POST(req: Request) {
  let body: { shopId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const { shopId } = body;
  if (!shopId) {
    return NextResponse.json({ error: "shopId required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: shop } = await supabase
    .from("shops")
    .select("id")
    .eq("id", shopId)
    .eq("user_id", userRes.user.id)
    .maybeSingle();
  if (!shop) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { data: campaigns, error } = await supabase
    .from("meta_ad_campaigns")
    .select("id, name, start_time, stop_time, campaign_type_source")
    .eq("shop_id", shopId)
    .eq("campaign_type_source", "auto");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let updated = 0;
  for (const c of campaigns ?? []) {
    const result = classifyCampaign({
      name: c.name ?? "",
      started_at: c.start_time ? new Date(c.start_time) : null,
      ended_at: c.stop_time ? new Date(c.stop_time) : null,
    });
    const { error: updErr } = await supabase
      .from("meta_ad_campaigns")
      .update({
        campaign_type: result.type,
        campaign_type_classified_at: new Date().toISOString(),
      })
      .eq("id", c.id);
    if (!updErr) updated++;
  }

  return NextResponse.json({ updated });
}
