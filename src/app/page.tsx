"use client";

import { useState, useEffect, useCallback } from "react";
import {
  FileSpreadsheet,
  Plus,
  Trash2,
  LogOut,
  Package,
  ArrowRight,
  Loader2,
  Users,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { LoginPage } from "@/components/LoginPage";
import { supabase } from "@/lib/supabase";
import type { Brand } from "@/lib/types";
import Link from "next/link";
import Image from "next/image";

export default function Home() {
  const { user, loading: authLoading, signOut } = useAuth();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newBrand, setNewBrand] = useState("");
  const [creating, setCreating] = useState(false);

  const fetchBrands = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("brands")
      .select("*")
      .order("created_at", { ascending: false });
    setBrands(data || []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (user) fetchBrands();
  }, [user, fetchBrands]);

  const handleCreateBrand = useCallback(async () => {
    if (!newBrand.trim() || !user) return;
    setCreating(true);
    await supabase.from("brands").insert({
      name: newBrand.trim(),
      user_id: user.id,
      usd_to_thb: 37,
      eur_to_thb: 39,
      vat: 7,
      default_multiplier: 3,
    });
    setNewBrand("");
    setShowCreate(false);
    setCreating(false);
    fetchBrands();
  }, [newBrand, user, fetchBrands]);

  const handleDeleteBrand = useCallback(
    async (id: string, name: string) => {
      if (!confirm(`Delete brand "${name}" and all its products?`)) return;
      await supabase.from("brands").delete().eq("id", id);
      fetchBrands();
    },
    [fetchBrands]
  );

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-gray-600 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image src="/amgo-logo.svg" alt="AMGO" width={36} height={36} />
            <h1 className="text-xl font-bold text-gray-900">SRP Calculator</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/members"
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-700 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            >
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline">Members</span>
            </Link>
            <span className="text-xs text-gray-700 hidden sm:inline">
              {user.email}
            </span>
            <button
              onClick={signOut}
              className="flex items-center gap-1 px-3 py-2 text-sm text-gray-700 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900">Brands</h2>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Brand
          </button>
        </div>

        {showCreate && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-6">
            <h3 className="text-sm font-medium text-gray-700 mb-3">
              Create New Brand
            </h3>
            <div className="flex gap-3">
              <input
                type="text"
                value={newBrand}
                onChange={(e) => setNewBrand(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateBrand()}
                placeholder="Brand name (e.g. Stokke)"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                autoFocus
              />
              <button
                onClick={handleCreateBrand}
                disabled={creating || !newBrand.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {creating ? "Creating..." : "Create"}
              </button>
              <button
                onClick={() => {
                  setShowCreate(false);
                  setNewBrand("");
                }}
                className="px-4 py-2 text-sm text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-gray-600 animate-spin" />
          </div>
        ) : brands.length === 0 ? (
          <div className="text-center py-16">
            <Package className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-700 mb-2">No brands yet</p>
            <p className="text-sm text-gray-600">
              Create a brand to start uploading products
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {brands.map((brand) => (
              <div
                key={brand.id}
                className="bg-white rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-center justify-between px-5 py-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900">
                        {brand.name}
                      </h3>
                      {brand.user_id !== user?.id && (
                        <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-medium">Shared</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-600 mt-1">
                      USD/THB: {brand.usd_to_thb} | EUR/THB:{" "}
                      {brand.eur_to_thb} | x{brand.default_multiplier}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {brand.user_id === user?.id && (
                    <button
                      onClick={() => handleDeleteBrand(brand.id, brand.name)}
                      className="p-2 text-gray-300 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    )}
                    <Link
                      href={`/brands/${brand.id}/upload`}
                      className="flex items-center gap-1 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      Upload
                    </Link>
                    <Link
                      href={`/brands/${brand.id}`}
                      className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      View Prices
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
