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

async function apiFetch(path: string, opts?: RequestInit) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  const res = await fetch(path, {
    ...opts,
    headers: { ...opts?.headers, Authorization: `Bearer ${token}` },
  });
  return res.json();
}

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
  const [inviteBrandIds, setInviteBrandIds] = useState<string[]>([]);
  const [inviteRole, setInviteRole] = useState<"viewer" | "editor">("editor");

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [membersData, invitesData] = await Promise.all([
      apiFetch("/api/members"),
      apiFetch("/api/invites"),
    ]);
    setBrands(membersData.brands || []);
    setTeamMembers(membersData.teamMembers || []);
    setBrandMembers(membersData.brandMembers || []);
    setLoginHistory(membersData.loginHistory || []);
    setInvites(invitesData || []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (user) fetchData();
  }, [user, fetchData]);

  const handleCreateInvite = useCallback(async () => {
    if (!user) return;
    setCreatingInvite(true);
    await apiFetch("/api/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brand_ids: inviteBrandIds, role: inviteBrandIds.length > 0 ? inviteRole : null }),
    });
    await fetchData();
    setCreatingInvite(false);
  }, [user, fetchData, inviteBrandIds, inviteRole]);

  const handleDeleteInvite = useCallback(async (id: string) => {
    const res = await apiFetch(`/api/invites?id=${id}`, { method: "DELETE" });
    if (res.error) {
      alert(`Failed to delete invite: ${res.error}`);
      return;
    }
    await fetchData();
  }, [fetchData]);

  const handleRemoveMember = useCallback(async (memberId: string, memberUserId: string) => {
    const res = await apiFetch(`/api/members?id=${memberId}&user_id=${memberUserId}`, { method: "DELETE" });
    if (res.error) {
      alert(`Failed to remove member: ${res.error}`);
    }
    await fetchData();
  }, [fetchData]);

  const handleSetBrandAccess = useCallback(async (memberUserId: string, brandId: string, action: "grant" | "revoke" | "set-role", role?: string) => {
    if (!user) return;
    const data = await apiFetch("/api/members/brand-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberUserId, brandId, action, role }),
    });
    if (data.error) {
      alert(`Failed to update access: ${data.error}`);
      return;
    }
    setBrandMembers(data);
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

  const activeInvites = invites.filter((inv) => !inv.used_by && new Date(inv.expires_at) > new Date());

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
        {/* Create Invite */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-800 mb-4">
            <UserPlus className="w-4 h-4" />
            Create Invite Link
          </h2>

          {/* Brand selection */}
          {brands.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="text-xs text-gray-500 w-14 shrink-0">Brands:</span>
              {brands.map(b => {
                const checked = inviteBrandIds.includes(b.id);
                return (
                  <label key={b.id} className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
                    checked ? "bg-blue-50 border-blue-300 text-blue-700" : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
                  }`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        setInviteBrandIds(prev =>
                          checked ? prev.filter(id => id !== b.id) : [...prev, b.id]
                        );
                      }}
                      className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    {b.name}
                  </label>
                );
              })}
            </div>
          )}

          {/* Role + Generate */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 w-14 shrink-0">Role:</span>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as "viewer" | "editor")}
              className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
            <button
              onClick={handleCreateInvite}
              disabled={creatingInvite}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-900 bg-amber-400 rounded-lg hover:bg-amber-500 disabled:opacity-50 transition-colors ml-auto"
            >
              <Link2 className="w-3.5 h-3.5" />
              {creatingInvite ? "Creating..." : "Generate Link"}
            </button>
          </div>
        </div>

        {/* Active Invite Links */}
        {activeInvites.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-800 mb-3">
              <Link2 className="w-4 h-4" />
              Active Links
              <span className="text-[10px] text-gray-400 font-normal">({activeInvites.length})</span>
            </h2>
            <div className="space-y-2">
              {activeInvites.map((inv) => {
                const ids = inv.brand_ids?.length ? inv.brand_ids : (inv.brand_id ? [inv.brand_id] : []);
                const invBrands = brands.filter(b => ids.includes(b.id));
                return (
                  <div key={inv.id} className="px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-lg">
                    <div className="flex items-center justify-between">
                      <code className="text-xs text-gray-700 font-mono truncate block flex-1 mr-3">
                        {typeof window !== "undefined" ? `${window.location.origin}/invite/${inv.token}` : inv.token}
                      </code>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => copyInviteLink(inv.token)}
                          className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-blue-700 bg-white border border-blue-200 rounded-md hover:bg-blue-50 transition-colors"
                        >
                          {copiedToken === inv.token ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          {copiedToken === inv.token ? "Copied!" : "Copy"}
                        </button>
                        <button
                          onClick={() => handleDeleteInvite(inv.id)}
                          className="p-1 text-gray-300 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {invBrands.length > 0 ? invBrands.map(b => (
                        <span key={b.id} className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                          inv.role === "editor" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                        }`}>
                          {b.name}
                        </span>
                      )) : (
                        <span className="text-[10px] text-gray-400">All brands</span>
                      )}
                      {inv.role && (
                        <span className={`text-[10px] font-medium ${inv.role === "editor" ? "text-green-600" : "text-amber-600"}`}>
                          {inv.role === "editor" ? "Editor" : "Viewer"}
                        </span>
                      )}
                      <span className="text-[10px] text-gray-400 ml-auto">
                        Expires {new Date(inv.expires_at).toLocaleDateString("th-TH")}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

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
                          const hasAccess = role !== null;
                          return (
                            <td key={b.id} className="py-2.5 px-2 text-center">
                              <div className="flex flex-col items-center gap-1">
                                <label className="relative inline-flex items-center cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={hasAccess}
                                    onChange={() => {
                                      if (hasAccess) {
                                        handleSetBrandAccess(tm.member_user_id, b.id, "revoke");
                                      } else {
                                        handleSetBrandAccess(tm.member_user_id, b.id, "grant", "editor");
                                      }
                                    }}
                                    className="sr-only peer"
                                  />
                                  <div className="w-8 h-[18px] bg-gray-200 rounded-full peer peer-checked:bg-green-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-[14px] after:w-[14px] after:transition-all peer-checked:after:translate-x-[14px]" />
                                </label>
                                {hasAccess && (
                                  <select
                                    value={role}
                                    onChange={(e) => handleSetBrandAccess(tm.member_user_id, b.id, "set-role", e.target.value)}
                                    className="text-[10px] font-medium px-1 py-0.5 rounded border border-gray-200 bg-white cursor-pointer focus:outline-none"
                                    style={{
                                      color: role === "editor" ? "#15803d" : "#92400e",
                                    }}
                                  >
                                    <option value="editor">Editor</option>
                                    <option value="viewer">Viewer</option>
                                  </select>
                                )}
                              </div>
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
            <span>Toggle switch to grant/revoke access. Change role with dropdown.</span>
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
