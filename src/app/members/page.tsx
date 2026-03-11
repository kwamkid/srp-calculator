"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  ArrowLeft,
  Users,
  UserPlus,
  Link2,
  Copy,
  Check,
  Trash2,
  Loader2,
  Shield,
  Eye,
  Pencil,
  Clock,
  X,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { LoginPage } from "@/components/LoginPage";
import { supabase } from "@/lib/supabase";
import type { Brand, Invite, TeamMember, BrandMember, LoginHistory } from "@/lib/types";
import Link from "next/link";
import Image from "next/image";

export default function MembersPage() {
  const { user, loading: authLoading } = useAuth();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [brandMembers, setBrandMembers] = useState<BrandMember[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loginHistory, setLoginHistory] = useState<LoginHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [creatingInvite, setCreatingInvite] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [brandsRes, teamRes, bmRes, invitesRes, loginRes] = await Promise.all([
      supabase.from("brands").select("*").eq("user_id", user.id).order("name"),
      supabase.from("team_members").select("*").eq("owner_id", user.id),
      supabase.from("brand_members").select("*"),
      supabase.from("invites").select("*").eq("created_by", user.id).order("created_at", { ascending: false }),
      supabase.from("login_history").select("*").order("login_at", { ascending: false }).limit(50),
    ]);
    setBrands(brandsRes.data || []);
    setTeamMembers(teamRes.data || []);
    setBrandMembers(bmRes.data || []);
    setInvites(invitesRes.data || []);
    setLoginHistory(loginRes.data || []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (user) fetchData();
  }, [user, fetchData]);

  const handleCreateInvite = useCallback(async () => {
    if (!user) return;
    setCreatingInvite(true);
    await supabase.from("invites").insert({ created_by: user.id });
    await fetchData();
    setCreatingInvite(false);
  }, [user, fetchData]);

  const handleDeleteInvite = useCallback(async (id: string) => {
    await supabase.from("invites").delete().eq("id", id);
    setInvites((prev) => prev.filter((inv) => inv.id !== id));
  }, []);

  const handleRemoveMember = useCallback(async (memberId: string, memberUserId: string) => {
    // Remove team membership + all brand access
    await Promise.all([
      supabase.from("team_members").delete().eq("id", memberId),
      supabase.from("brand_members").delete().eq("user_id", memberUserId),
    ]);
    fetchData();
  }, [fetchData]);

  const handleToggleBrandAccess = useCallback(async (memberUserId: string, brandId: string, currentRole: string | null) => {
    if (!user) return;
    if (currentRole === null) {
      // Grant viewer access
      await supabase.from("brand_members").insert({
        brand_id: brandId,
        user_id: memberUserId,
        role: "viewer",
        granted_by: user.id,
      });
    } else if (currentRole === "viewer") {
      // Upgrade to editor
      await supabase.from("brand_members")
        .update({ role: "editor" })
        .eq("brand_id", brandId)
        .eq("user_id", memberUserId);
    } else {
      // Remove access
      await supabase.from("brand_members")
        .delete()
        .eq("brand_id", brandId)
        .eq("user_id", memberUserId);
    }
    // Refresh brand_members
    const { data } = await supabase.from("brand_members").select("*");
    setBrandMembers(data || []);
  }, [user]);

  const copyInviteLink = useCallback((token: string) => {
    const url = `${window.location.origin}/invite/${token}`;
    navigator.clipboard.writeText(url);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  }, []);

  const getMemberBrandRole = (memberUserId: string, brandId: string): string | null => {
    const bm = brandMembers.find((m) => m.user_id === memberUserId && m.brand_id === brandId);
    return bm ? bm.role : null;
  };

  const getLastLogin = (memberUserId: string): LoginHistory | undefined => {
    return loginHistory.find((log) => log.user_id === memberUserId);
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-gray-600 animate-spin" />
      </div>
    );
  }

  if (!user) return <LoginPage />;

  const unusedInvites = invites.filter((inv) => !inv.used_by && new Date(inv.expires_at) > new Date());
  const usedInvites = invites.filter((inv) => inv.used_by);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <Image src="/amgo-logo.svg" alt="AMGO" width={36} height={36} />
            <div>
              <h1 className="text-lg font-bold text-gray-900">Members</h1>
              <p className="text-xs text-gray-500">{teamMembers.length} members</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Invite Links Section */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-800">
              <Link2 className="w-4 h-4" />
              Invite Links
            </h2>
            <button
              onClick={handleCreateInvite}
              disabled={creatingInvite}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              {creatingInvite ? "Creating..." : "Generate Link"}
            </button>
          </div>

          {unusedInvites.length === 0 && usedInvites.length === 0 ? (
            <p className="text-sm text-gray-500 py-3 text-center">No invite links yet. Generate a link to invite team members.</p>
          ) : (
            <div className="space-y-2">
              {unusedInvites.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between px-3 py-2.5 bg-blue-50 border border-blue-100 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <code className="text-xs text-blue-800 font-mono truncate block">
                      {typeof window !== "undefined" ? `${window.location.origin}/invite/${inv.token}` : inv.token}
                    </code>
                    <span className="text-[10px] text-blue-500 mt-0.5 block">
                      Expires {new Date(inv.expires_at).toLocaleDateString("th-TH")}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 ml-3">
                    <button
                      onClick={() => copyInviteLink(inv.token)}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-700 bg-white border border-blue-200 rounded-md hover:bg-blue-50 transition-colors"
                    >
                      {copiedToken === inv.token ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedToken === inv.token ? "Copied!" : "Copy"}
                    </button>
                    <button
                      onClick={() => handleDeleteInvite(inv.id)}
                      className="p-1.5 text-gray-300 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
              {usedInvites.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg opacity-60">
                  <div>
                    <span className="text-xs text-gray-500 font-mono">{inv.token.slice(0, 16)}...</span>
                    <span className="text-[10px] text-green-600 ml-2">Used {inv.used_at ? new Date(inv.used_at).toLocaleDateString("th-TH") : ""}</span>
                  </div>
                  <button
                    onClick={() => handleDeleteInvite(inv.id)}
                    className="p-1.5 text-gray-300 hover:text-red-500 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Team Members + Brand Access Matrix */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-800 mb-4">
            <Users className="w-4 h-4" />
            Team Members & Brand Access
          </h2>

          {teamMembers.length === 0 ? (
            <p className="text-sm text-gray-500 py-3 text-center">No team members yet. Share an invite link to add members.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-3 font-medium text-gray-600 min-w-[200px]">Member</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-600 min-w-[140px]">Last Login</th>
                    {brands.map((b) => (
                      <th key={b.id} className="text-center py-2 px-2 font-medium text-gray-600 min-w-[100px]">
                        <span className="text-xs">{b.name}</span>
                      </th>
                    ))}
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {/* Owner row */}
                  <tr className="border-b border-gray-100 bg-blue-50/50">
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-blue-600 shrink-0" />
                        <div>
                          <div className="font-medium text-gray-900 text-xs">{user.email}</div>
                          <div className="text-[10px] text-blue-600 font-medium">Owner</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-xs text-gray-500">Now</td>
                    {brands.map((b) => (
                      <td key={b.id} className="py-2.5 px-2 text-center">
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-700 bg-blue-100 px-2 py-1 rounded-full">
                          <Pencil className="w-3 h-3" /> Owner
                        </span>
                      </td>
                    ))}
                    <td></td>
                  </tr>
                  {/* Member rows */}
                  {teamMembers.map((tm) => {
                    const lastLogin = getLastLogin(tm.member_user_id);
                    return (
                      <tr key={tm.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2">
                            <Users className="w-4 h-4 text-gray-400 shrink-0" />
                            <div>
                              <div className="font-medium text-gray-900 text-xs">{tm.member_email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          {lastLogin ? (
                            <div className="text-xs text-gray-500">
                              {new Date(lastLogin.login_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
                            </div>
                          ) : (
                            <span className="text-xs text-gray-300">-</span>
                          )}
                        </td>
                        {brands.map((b) => {
                          const role = getMemberBrandRole(tm.member_user_id, b.id);
                          return (
                            <td key={b.id} className="py-2.5 px-2 text-center">
                              <button
                                onClick={() => handleToggleBrandAccess(tm.member_user_id, b.id, role)}
                                className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-full transition-colors"
                                style={{
                                  backgroundColor: role === "editor" ? "#dcfce7" : role === "viewer" ? "#fef3c7" : "#f3f4f6",
                                  color: role === "editor" ? "#15803d" : role === "viewer" ? "#92400e" : "#9ca3af",
                                }}
                                title={
                                  role === null ? "Click: grant View access"
                                  : role === "viewer" ? "Click: upgrade to Edit"
                                  : "Click: remove access"
                                }
                              >
                                {role === "editor" ? (
                                  <><Pencil className="w-3 h-3" /> Edit</>
                                ) : role === "viewer" ? (
                                  <><Eye className="w-3 h-3" /> View</>
                                ) : (
                                  <>No access</>
                                )}
                              </button>
                            </td>
                          );
                        })}
                        <td className="py-2.5 px-2">
                          <button
                            onClick={() => {
                              if (confirm(`Remove ${tm.member_email} from your team?`)) {
                                handleRemoveMember(tm.id, tm.member_user_id);
                              }
                            }}
                            className="p-1 text-gray-300 hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-3 flex items-center gap-4 text-[10px] text-gray-400 border-t border-gray-100 pt-3">
            <span>Click to cycle:</span>
            <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">No access</span>
            <span>&rarr;</span>
            <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full"><Eye className="w-3 h-3" /> View</span>
            <span>&rarr;</span>
            <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 px-2 py-0.5 rounded-full"><Pencil className="w-3 h-3" /> Edit</span>
            <span>&rarr;</span>
            <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">No access</span>
          </div>
        </div>

        {/* Login History */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-800 mb-4">
            <Clock className="w-4 h-4" />
            Login Activity
          </h2>
          {loginHistory.length === 0 ? (
            <p className="text-sm text-gray-500 py-3 text-center">No login history yet.</p>
          ) : (
            <div className="max-h-64 overflow-y-auto space-y-1">
              {loginHistory.map((log) => (
                <div key={log.id} className="flex items-center justify-between px-3 py-2 hover:bg-gray-50 rounded-lg text-xs">
                  <span className="font-medium text-gray-800">{log.email}</span>
                  <span className="text-gray-500">
                    {new Date(log.login_at).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
