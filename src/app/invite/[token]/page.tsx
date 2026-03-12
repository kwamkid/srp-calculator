"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2, CheckCircle, XCircle, LogIn } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { LoginPage } from "@/components/LoginPage";
import { supabase } from "@/lib/supabase";
import Image from "next/image";

export default function InvitePage() {
  const { user, loading: authLoading } = useAuth();
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [status, setStatus] = useState<"loading" | "valid" | "expired" | "used" | "accepted" | "error">("loading");
  const [accepting, setAccepting] = useState(false);

  const checkInvite = useCallback(async () => {
    const { data: invite } = await supabase
      .from("invites")
      .select("*")
      .eq("token", token)
      .single();

    if (!invite) {
      setStatus("error");
      return;
    }

    if (invite.used_by) {
      setStatus("used");
      return;
    }

    if (new Date(invite.expires_at) < new Date()) {
      setStatus("expired");
      return;
    }

    setStatus("valid");
  }, [token]);

  useEffect(() => {
    checkInvite();
  }, [checkInvite]);

  const handleAcceptInvite = useCallback(async () => {
    if (!user) return;
    setAccepting(true);

    // Mark invite as used
    await supabase
      .from("invites")
      .update({ used_by: user.id, used_at: new Date().toISOString() })
      .eq("token", token)
      .is("used_by", null);

    // Get the invite to find owner
    const { data: invite } = await supabase
      .from("invites")
      .select("*")
      .eq("token", token)
      .single();

    if (invite) {
      // Add to team_members
      await supabase.from("team_members").upsert({
        owner_id: invite.created_by,
        member_user_id: user.id,
        member_email: user.email || "",
        invited_via: invite.id,
      }, { onConflict: "owner_id,member_user_id" });
    }

    setStatus("accepted");
    setTimeout(() => router.push("/"), 2000);
  }, [user, token, router]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-gray-600 animate-spin" />
      </div>
    );
  }

  // Not logged in - show login page, redirect back here after sign-in
  if (!user) {
    return <LoginPage redirectTo={`/invite/${token}`} />;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-3 mb-8">
          <Image src="/amgo-logo.svg" alt="AMGO" width={40} height={40} />
          <h1 className="text-2xl font-bold text-gray-900">SRP Calculator</h1>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 text-center">
          {status === "loading" && (
            <div className="py-8">
              <Loader2 className="w-8 h-8 text-gray-400 animate-spin mx-auto mb-3" />
              <p className="text-sm text-gray-600">Checking invite...</p>
            </div>
          )}

          {status === "valid" && (
            <div className="py-4">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <LogIn className="w-6 h-6 text-blue-600" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Team Invite</h2>
              <p className="text-sm text-gray-600 mb-1">Logged in as <strong>{user.email}</strong></p>
              <p className="text-sm text-gray-500 mb-6">Accept this invite to join the team.</p>
              <button
                onClick={handleAcceptInvite}
                disabled={accepting}
                className="w-full py-2.5 px-4 bg-blue-600 text-white font-medium text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {accepting ? "Joining..." : "Accept Invite"}
              </button>
            </div>
          )}

          {status === "accepted" && (
            <div className="py-8">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
              <h2 className="text-lg font-semibold text-green-800 mb-2">Joined!</h2>
              <p className="text-sm text-gray-600">Redirecting to home...</p>
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
