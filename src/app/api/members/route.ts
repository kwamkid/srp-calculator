import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getUser } from "@/lib/auth-check";

// GET /api/members — list team members, brand members, brands, login history
export async function GET(request: Request) {
  const user = await getUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [brandsRes, teamRes, bmRes, loginRes] = await Promise.all([
    supabaseAdmin.from("brands").select("*").eq("user_id", user.id).order("name"),
    supabaseAdmin.from("team_members").select("*").eq("owner_id", user.id),
    supabaseAdmin.from("brand_members").select("*"),
    supabaseAdmin.from("login_history").select("*").order("login_at", { ascending: false }).limit(50),
  ]);

  return NextResponse.json({
    brands: brandsRes.data || [],
    teamMembers: teamRes.data || [],
    brandMembers: bmRes.data || [],
    loginHistory: loginRes.data || [],
  });
}

// DELETE /api/members?id=xxx&user_id=xxx — remove team member + brand access
export async function DELETE(request: Request) {
  const user = await getUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const memberUserId = searchParams.get("user_id");
  if (!id || !memberUserId) return NextResponse.json({ error: "Missing id or user_id" }, { status: 400 });

  // Verify ownership
  const { data: tm } = await supabaseAdmin
    .from("team_members")
    .select("owner_id")
    .eq("id", id)
    .single();

  if (!tm || tm.owner_id !== user.id) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const [teamRes, brandRes] = await Promise.all([
    supabaseAdmin.from("team_members").delete().eq("id", id),
    supabaseAdmin.from("brand_members").delete().eq("user_id", memberUserId),
  ]);

  if (teamRes.error) return NextResponse.json({ error: teamRes.error.message }, { status: 500 });
  if (brandRes.error) return NextResponse.json({ error: brandRes.error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
