import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getUser } from "@/lib/auth-check";

// POST /api/invites/accept — accept an invite by token
export async function POST(request: Request) {
  const user = await getUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { token } = await request.json();
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  // Fetch invite
  const { data: invite } = await supabaseAdmin
    .from("invites")
    .select("*")
    .eq("token", token)
    .single();

  if (!invite) return NextResponse.json({ error: "Invalid invite" }, { status: 404 });
  if (invite.used_by) return NextResponse.json({ error: "Already used" }, { status: 400 });
  if (new Date(invite.expires_at) < new Date()) return NextResponse.json({ error: "Expired" }, { status: 400 });

  // Mark invite as used
  await supabaseAdmin
    .from("invites")
    .update({ used_by: user.id, used_at: new Date().toISOString() })
    .eq("id", invite.id)
    .is("used_by", null);

  // Add to team_members
  await supabaseAdmin.from("team_members").upsert({
    owner_id: invite.created_by,
    member_user_id: user.id,
    member_email: user.email || "",
    invited_via: invite.id,
  }, { onConflict: "owner_id,member_user_id" });

  // Auto-grant brand access for all selected brands
  const ids: string[] = invite.brand_ids?.length ? invite.brand_ids : (invite.brand_id ? [invite.brand_id] : []);
  if (ids.length > 0 && invite.role) {
    await Promise.all(ids.map((bid: string) =>
      supabaseAdmin.from("brand_members").upsert({
        brand_id: bid,
        user_id: user.id,
        role: invite.role,
        email: user.email || "",
      }, { onConflict: "brand_id,user_id" })
    ));
  }

  // Determine redirect
  const dest = ids.length === 1 ? `/brands/${ids[0]}` : "/";

  return NextResponse.json({ ok: true, redirect: dest });
}
