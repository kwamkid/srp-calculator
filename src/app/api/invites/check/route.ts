import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

// GET /api/invites/check?token=xxx — check invite validity (no auth needed)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const { data: invite } = await supabaseAdmin
    .from("invites")
    .select("*")
    .eq("token", token)
    .single();

  if (!invite) return NextResponse.json({ status: "error" });
  if (invite.used_by) return NextResponse.json({ status: "used" });
  if (new Date(invite.expires_at) < new Date()) return NextResponse.json({ status: "expired" });

  // Fetch brand names
  const ids: string[] = invite.brand_ids?.length ? invite.brand_ids : (invite.brand_id ? [invite.brand_id] : []);
  let brandName: string | null = null;
  if (ids.length > 0) {
    const { data: brands } = await supabaseAdmin
      .from("brands")
      .select("name")
      .in("id", ids);
    if (brands?.length) {
      brandName = brands.map((b: { name: string }) => b.name).join(", ");
    }
  }

  return NextResponse.json({
    status: "valid",
    invite,
    brandName,
  });
}
