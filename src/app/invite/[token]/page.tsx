"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2, CheckCircle, XCircle, Users } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { LoginPage } from "@/components/LoginPage";
import { supabase } from "@/lib/supabase";
import type { Invite } from "@/lib/types";
import Image from "next/image";

export default function InvitePage() {
  const { user, loading: authLoading } = useAuth();
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [status, setStatus] = useState<"loading" | "valid" | "expired" | "used" | "accepted" | "error">("loading");
  const [invite, setInvite] = useState<Invite | null>(null);
  const [brandName, setBrandName] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const autoAccepted = useRef(false);

  // Check invite validity & fetch brand name
  const checkInvite = useCallback(async () => {
    const { data } = await supabase
      .from("invites")
      .select("*")
      .eq("token", token)
      .single();

    if (!data) { setStatus("error"); return; }
    if (data.used_by) { setStatus("used"); return; }
    if (new Date(data.expires_at) < new Date()) { setStatus("expired"); return; }

    setInvite(data);
    setStatus("valid");

    // Fetch brand name if invite has brand_id
    if (data.brand_id) {
      const { data: brand } = await supabase
        .from("brands")
        .select("name")
        .eq("id", data.brand_id)
        .single();
      if (brand) setBrandName(brand.name);
    }
  }, [token]);

  useEffect(() => {
    checkInvite();
  }, [checkInvite]);

  // Accept invite
  const handleAcceptInvite = useCallback(async () => {
    if (!user || !invite) return;
    setAccepting(true);

    // Mark invite as used
    await supabase
      .from("invites")
      .update({ used_by: user.id, used_at: new Date().toISOString() })
      .eq("token", token)
      .is("used_by", null);

    // Add to team_members
    await supabase.from("team_members").upsert({
      owner_id: invite.created_by,
      member_user_id: user.id,
      member_email: user.email || "",
      invited_via: invite.id,
    }, { onConflict: "owner_id,member_user_id" });

    // Auto-grant brand access if specified
    if (invite.brand_id && invite.role) {
      await supabase.from("brand_members").upsert({
        brand_id: invite.brand_id,
        user_id: user.id,
        role: invite.role,
        granted_by: invite.created_by,
      }, { onConflict: "brand_id,user_id" });
    }

    setStatus("accepted");
    // Redirect to brand page if assigned, otherwise home
    const dest = invite.brand_id ? `/brands/${invite.brand_id}` : "/";
    setTimeout(() => router.push(dest), 1500);
  }, [user, invite, token, router]);

  // Auto-accept when user signs in via OAuth redirect
  useEffect(() => {
    if (user && status === "valid" && invite && !autoAccepted.current) {
      autoAccepted.current = true;
      handleAcceptInvite();
    }
  }, [user, status, invite, handleAcceptInvite]);

  if (authLoading || status === "loading") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-gray-600 animate-spin" />
      </div>
    );
  }

  // Not logged in — show join page with sign-in
  if (!user) {
    return (
      <LoginPage
        redirectTo={`/invite/${token}`}
        title={brandName ? `Join ${brandName}` : "Join Team"}
        subtitle="Sign in with Google to accept this invite."
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-3 mb-8">
          <Image src="/amgo-logo.svg" alt="AMGO" width={40} height={40} />
          <h1 className="text-2xl font-bold text-gray-900">SRP Calculator</h1>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 text-center">
          {(status === "valid" || accepting) && (
            <div className="py-4">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Users className="w-6 h-6 text-blue-600" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">
                {brandName ? `Join ${brandName}` : "Team Invite"}
              </h2>
              <p className="text-sm text-gray-600 mb-1">
                Signed in as <strong>{user.email}</strong>
              </p>
              {invite?.role && (
                <p className="text-xs text-gray-400 mb-4">
                  Role: <span className={invite.role === "editor" ? "text-green-600 font-medium" : "text-amber-600 font-medium"}>
                    {invite.role === "editor" ? "Editor" : "Viewer"}
                  </span>
                </p>
              )}
              {accepting ? (
                <div className="flex items-center justify-center gap-2 py-2.5 text-sm text-blue-600">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Joining...
                </div>
              ) : (
                <button
                  onClick={handleAcceptInvite}
                  className="w-full py-2.5 px-4 bg-blue-600 text-white font-medium text-sm rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Accept Invite
                </button>
              )}
            </div>
          )}

          {status === "accepted" && (
            <div className="py-8">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
              <h2 className="text-lg font-semibold text-green-800 mb-2">Joined!</h2>
              <p className="text-sm text-gray-600">
                {brandName ? `Welcome to ${brandName}. Redirecting...` : "Redirecting..."}
              </p>
            </div>
          )}

          {(status === "expired" || status === "used" || status === "error") && (
            <div className="py-8">
              <XCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
              <h2 className="text-lg font-semibold text-gray-900 mb-2">
                {status === "expired" ? "Link Expired" : status === "used" ? "Link Already Used" : "Invalid Link"}
              </h2>
              <p className="text-sm text-gray-600 mb-4">
                {status === "expired"
                  ? "This invite link has expired. Ask the owner for a new one."
                  : status === "used"
                  ? "This invite link has already been used."
                  : "This invite link is not valid."}
              </p>
              <button
                onClick={() => router.push("/")}
                className="px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              >
                Go to Home
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
