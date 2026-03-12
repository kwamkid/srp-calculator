import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getUser } from "@/lib/auth-check";

// POST /api/members/brand-access — grant, revoke, or set-role
export async function POST(request: Request) {
  const user = await getUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { memberUserId, brandId, action, role } = await request.json();
  if (!memberUserId || !brandId || !action) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  if (action === "grant") {
    // Look up member email from team_members
    const { data: tm } = await supabaseAdmin
      .from("team_members")
      .select("member_email")
      .eq("member_user_id", memberUserId)
      .limit(1)
      .single();

    const { error } = await supabaseAdmin.from("brand_members").upsert({
      brand_id: brandId,
      user_id: memberUserId,
      role: role || "editor",
      email: tm?.member_email || "",
    }, { onConflict: "brand_id,user_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else if (action === "revoke") {
    const { error } = await supabaseAdmin
      .from("brand_members")
      .delete()
      .eq("brand_id", brandId)
      .eq("user_id", memberUserId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else if (action === "set-role") {
    const { error } = await supabaseAdmin
      .from("brand_members")
      .update({ role })
      .eq("brand_id", brandId)
      .eq("user_id", memberUserId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Return updated brand_members
  const { data } = await supabaseAdmin.from("brand_members").select("*");
  return NextResponse.json(data || []);
}
