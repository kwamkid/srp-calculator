"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Download,
  Settings,
  ChevronDown,
  ChevronUp,
  Loader2,
  Trash2,
  ImageIcon,
  Columns3,
  Eye,
  EyeOff,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { LoginPage } from "@/components/LoginPage";
import { Tooltip } from "@/components/Tooltip";
import { supabase } from "@/lib/supabase";
import { calculateProduct, roundToNicePrice, calculateChannelProfit } from "@/lib/calculator";
import { DEFAULT_CHANNELS } from "@/lib/types";
import type { Brand, Product, CalculatedProduct, SalesChannel, BrandMember } from "@/lib/types";
import Link from "next/link";
import Image from "next/image";
import * as XLSX from "xlsx";

function fmt(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function fmtDec(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const CHANNEL_BG = [
  "bg-purple-50",
  "bg-red-50",
  "bg-amber-50",
];
const CHANNEL_HEADER_BG = [
  "bg-purple-100",
  "bg-red-100",
  "bg-amber-100",
];
const CHANNEL_GROUP_BG = [
  "bg-purple-800",
  "bg-red-800",
  "bg-yellow-700",
];
function chBg(idx: number) { return CHANNEL_BG[idx % CHANNEL_BG.length]; }
function chHeaderBg(idx: number) { return CHANNEL_HEADER_BG[idx % CHANNEL_HEADER_BG.length]; }
function chGroupBg(idx: number) { return CHANNEL_GROUP_BG[idx % CHANNEL_GROUP_BG.length]; }

const PROMO_OPTIONS = [0, 5, 10, 15, 20, 25, 30];

export default function BrandPage() {
  const { user, loading: authLoading } = useAuth();
  const params = useParams();
  const brandId = params.id as string;

  const [brand, setBrand] = useState<Brand | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [brandSaving, setBrandSaving] = useState(false);
  const [channels, setChannels] = useState<SalesChannel[]>(DEFAULT_CHANNELS);
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [newCategoryFor, setNewCategoryFor] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<"owner" | "editor" | "viewer">("viewer");
  const [visibleGroups, setVisibleGroups] = useState<Record<string, boolean>>({
    category: true,
    cost: true,
    srp: true,
    pricing: true,
    ...Object.fromEntries(DEFAULT_CHANNELS.map(ch => [ch.name, true])),
  });

  const toggleGroup = (group: string) => {
    setVisibleGroups(prev => ({ ...prev, [group]: !prev[group] }));
  };

  const categories = [...new Set(products.map(p => p.category).filter(Boolean))];

  const columnGroups = [
    { key: "category", label: "Category" },
    { key: "cost", label: "Cost" },
    { key: "srp", label: "SRP" },
    { key: "pricing", label: "Thai Pricing" },
    ...channels.map(ch => ({ key: ch.name, label: ch.name })),
  ];

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [brandRes, productsRes, bmRes] = await Promise.all([
      supabase.from("brands").select("*").eq("id", brandId).single(),
      supabase
        .from("products")
        .select("*")
        .eq("brand_id", brandId)
        .order("sort_order", { ascending: true }),
      supabase.from("brand_members").select("*").eq("brand_id", brandId).eq("user_id", user.id).maybeSingle(),
    ]);
    setBrand(brandRes.data);
    setProducts(productsRes.data || []);
    // Determine role
    if (brandRes.data?.user_id === user.id) {
      setMyRole("owner");
    } else if (bmRes.data) {
      setMyRole(bmRes.data.role === "editor" ? "editor" : "viewer");
    } else {
      setMyRole("viewer");
    }
    setLoading(false);
  }, [user, brandId]);

  // Record login on page load
  useEffect(() => {
    if (!user) return;
    supabase.from("login_history").insert({
      user_id: user.id,
      email: user.email || "",
      user_agent: navigator.userAgent,
    }).then();
  }, [user]);

  useEffect(() => {
    if (user) fetchData();
  }, [user, fetchData]);

  const calculated: CalculatedProduct[] = brand
    ? products.map((p) => calculateProduct(p, brand))
    : [];

  // Auto-hide columns when no product has a value
  const hasData = {
    fob_usd: products.some((p) => p.fob_usd),
    fob_eur: products.some((p) => p.fob_eur),
    srp_usd: products.some((p) => p.srp_usd),
    srp_eur: products.some((p) => p.srp_eur),
  };

  const handleBrandUpdate = useCallback(
    async (updates: Partial<Brand>) => {
      if (!brand) return;
      setBrandSaving(true);
      const newBrand = { ...brand, ...updates };
      setBrand(newBrand);
      await supabase
        .from("brands")
        .update(updates)
        .eq("id", brand.id);
      setBrandSaving(false);
    },
    [brand]
  );

  const handleProductUpdate = useCallback(
    async (productId: string, field: keyof Product, value: number | string) => {
      const editedBy = user?.email || "";
      const editedAt = new Date().toISOString();
      setSaving(productId);
      setProducts((prev) =>
        prev.map((p) => (p.id === productId ? { ...p, [field]: value, last_edited_by: editedBy, last_edited_at: editedAt } : p))
      );
      await supabase
        .from("products")
        .update({ [field]: value, last_edited_by: editedBy, last_edited_at: editedAt })
        .eq("id", productId);
      setSaving(null);
    },
    [user]
  );

  const handleApplySuggested = useCallback(
    async (productId: string, suggestedPrice: number) => {
      handleProductUpdate(productId, "our_price_thb", suggestedPrice);
    },
    [handleProductUpdate]
  );

  const handleApplyAllSuggested = useCallback(async () => {
    if (!brand) return;
    const updates = products.map((p) => {
      const calc = calculateProduct(p, brand);
      return { id: p.id, our_price_thb: calc.suggested_price };
    });

    setProducts((prev) =>
      prev.map((p) => {
        const u = updates.find((x) => x.id === p.id);
        return u ? { ...p, our_price_thb: u.our_price_thb } : p;
      })
    );

    for (const u of updates) {
      await supabase
        .from("products")
        .update({ our_price_thb: u.our_price_thb })
        .eq("id", u.id);
    }
  }, [brand, products]);

  const handleGlobalMultiplier = useCallback(
    async (multiplier: number) => {
      // Update all products in state instantly (realtime)
      setProducts((prev) => prev.map((p) => ({ ...p, multiplier })));
      // Also update brand default
      setBrand((b) => (b ? { ...b, default_multiplier: multiplier } : b));
      // Persist to DB in background
      const ids = products.map((p) => p.id);
      await Promise.all([
        supabase
          .from("products")
          .update({ multiplier })
          .in("id", ids),
        supabase
          .from("brands")
          .update({ default_multiplier: multiplier })
          .eq("id", brandId),
      ]);
    },
    [products, brandId]
  );

  const handleDeleteProduct = useCallback(
    async (id: string) => {
      await supabase.from("products").delete().eq("id", id);
      setProducts((prev) => prev.filter((p) => p.id !== id));
    },
    []
  );

  const handleImageUpload = useCallback(
    async (productId: string, file: File) => {
      const ext = file.name.split(".").pop();
      const path = `${brandId}/${productId}.${ext}`;
      const { error } = await supabase.storage
        .from("product-images")
        .upload(path, file, { upsert: true });
      if (error) return;
      const {
        data: { publicUrl },
      } = supabase.storage.from("product-images").getPublicUrl(path);
      handleProductUpdate(productId, "image_url", publicUrl);
    },
    [brandId, handleProductUpdate]
  );

  const canEdit = myRole === "owner" || myRole === "editor";

  const handleExport = useCallback(() => {
    if (calculated.length === 0) return;
    const data = calculated.map((p, i) => ({
      "#": i + 1,
      Product: p.name,
      Category: p.category,
      SKU: p.sku,
      "FOB USD": p.fob_usd,
      "FOB EUR": p.fob_eur,
      "FOB THB": p.fob_thb,
      "Freight + D/O": p.freight_do,
      "Import Tax %": p.import_tax_pct,
      "Shipping Cost": p.shipping_cost,
      "Total Import Cost": p.total_import_cost,
      "SRP USD": p.srp_usd,
      "SRP EUR": p.srp_eur,
      "SRP THB (Intl)": p.srp_thb,
      Multiplier: p.multiplier,
      "Suggested Price": p.suggested_price,
      "Our Price (THB)": p.our_price_thb || p.suggested_price,
      "Margin (THB)": p.margin_thb,
      "Margin (%)": p.margin_pct,
      Notes: p.notes,
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, brand?.name || "Products");
    XLSX.writeFile(wb, `${brand?.name || "products"}-prices.xlsx`);
  }, [calculated, brand]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-gray-600 animate-spin" />
      </div>
    );
  }

  if (!user) return <LoginPage />;

  if (!brand) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-700">Brand not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50" onFocusCapture={(e) => { if (e.target instanceof HTMLInputElement && e.target.type !== "file") e.target.select(); }}>
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-[1800px] mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <Image src="/amgo-logo.svg" alt="AMGO" width={36} height={36} />
            <div>
              <h1 className="text-lg font-bold text-gray-900">{brand.name}</h1>
              <p className="text-xs text-gray-700">
                {products.length} products | USD/THB: {brand.usd_to_thb} |
                EUR/THB: {brand.eur_to_thb}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Settings className="w-4 h-4" />
              {showSettings ? (
                <ChevronUp className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
            </button>
            <div className="flex items-center gap-1.5 px-3 py-1.5 border border-purple-300 rounded-lg bg-purple-50">
              <span className="text-xs text-purple-600 font-medium whitespace-nowrap">All ×</span>
              <select
                value={brand.default_multiplier}
                onChange={(e) => handleGlobalMultiplier(parseFloat(e.target.value))}
                className="bg-transparent border-0 text-sm font-bold text-purple-700 focus:ring-0 cursor-pointer pr-6"
              >
                <option value={2}>2.0</option>
                <option value={2.5}>2.5</option>
                <option value={3}>3.0</option>
                <option value={3.5}>3.5</option>
                <option value={4}>4.0</option>
                <option value={4.5}>4.5</option>
                <option value={5}>5.0</option>
              </select>
            </div>
            <button
              onClick={handleApplyAllSuggested}
              className="flex items-center gap-2 px-3 py-2 text-sm text-orange-600 border border-orange-300 rounded-lg hover:bg-orange-50 transition-colors"
            >
              Apply All Suggested
            </button>
            <Link
              href={`/brands/${brandId}/upload`}
              className="px-3 py-2 text-sm text-blue-600 border border-blue-300 rounded-lg hover:bg-blue-50 transition-colors"
            >
              Upload More
            </Link>
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1800px] mx-auto px-4 py-4">
        {/* Settings */}
        {showSettings && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-800">
                Brand Settings
              </h2>
              {brandSaving && (
                <span className="text-xs text-gray-600">Saving...</span>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs text-gray-700 mb-1">
                  USD to THB
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={brand.usd_to_thb}
                  onChange={(e) =>
                    handleBrandUpdate({
                      usd_to_thb: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-700 mb-1">
                  EUR to THB
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={brand.eur_to_thb}
                  onChange={(e) =>
                    handleBrandUpdate({
                      eur_to_thb: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-700 mb-1">
                  VAT (%)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={brand.vat}
                  onChange={(e) =>
                    handleBrandUpdate({
                      vat: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-700 mb-1">
                  Default Multiplier
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={brand.default_multiplier}
                  onChange={(e) =>
                    handleBrandUpdate({
                      default_multiplier: parseFloat(e.target.value) || 3,
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                />
              </div>
            </div>
            <div className="mt-4 border-t border-gray-200 pt-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-3">Sales Channels</h3>
              <div className="space-y-3">
                {channels.map((ch, idx) => (
                  <div key={idx} className="grid grid-cols-4 gap-3 items-center">
                    <div>
                      <label className="block text-xs text-gray-700 mb-1">Channel</label>
                      <input type="text" value={ch.name} onChange={(e) => {
                        const updated = [...channels];
                        updated[idx] = { ...ch, name: e.target.value };
                        setChannels(updated);
                      }} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm text-gray-900" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-700 mb-1">GP++ %</label>
                      <input type="number" value={ch.gp_pct} onChange={(e) => {
                        const updated = [...channels];
                        updated[idx] = { ...ch, gp_pct: parseFloat(e.target.value) || 0 };
                        setChannels(updated);
                      }} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm text-gray-900" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-700 mb-1">PC %</label>
                      <input type="number" value={ch.pc_pct} onChange={(e) => {
                        const updated = [...channels];
                        updated[idx] = { ...ch, pc_pct: parseFloat(e.target.value) || 0 };
                        setChannels(updated);
                      }} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm text-gray-900" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-700 mb-1">DC %</label>
                      <input type="number" value={ch.dc_pct} onChange={(e) => {
                        const updated = [...channels];
                        updated[idx] = { ...ch, dc_pct: parseFloat(e.target.value) || 0 };
                        setChannels(updated);
                      }} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm text-gray-900" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Role indicator */}
            {myRole !== "owner" && (
              <div className="mt-4 border-t border-gray-200 pt-3">
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  {myRole === "editor" ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  Your access: <span className="font-medium text-gray-700 capitalize">{myRole}</span>
                  {myRole === "viewer" && <span className="text-gray-400">(read-only)</span>}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Products table */}
        {products.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-700 mb-3">No products yet</p>
            <Link
              href={`/brands/${brandId}/upload`}
              className="text-sm text-blue-600 hover:text-blue-700 underline"
            >
              Upload products
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {/* Column toggle toolbar */}
            <div className="px-4 py-2 border-b border-gray-200 flex items-center gap-2 bg-gray-50">
              <div className="relative">
                <button
                  onClick={() => setShowColumnMenu(!showColumnMenu)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-white transition-colors"
                >
                  <Columns3 className="w-4 h-4" />
                  Columns
                  <ChevronDown className="w-3 h-3" />
                </button>
                {showColumnMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowColumnMenu(false)} />
                    <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1 min-w-[180px]">
                      {columnGroups.map((g) => (
                        <button
                          key={g.key}
                          onClick={() => toggleGroup(g.key)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-800 hover:bg-gray-50 transition-colors"
                        >
                          {visibleGroups[g.key] ? (
                            <Eye className="w-4 h-4 text-blue-500" />
                          ) : (
                            <EyeOff className="w-4 h-4 text-gray-400" />
                          )}
                          {g.label}
                        </button>
                      ))}
                      <div className="border-t border-gray-100 mt-1 pt-1">
                        <button
                          onClick={() => {
                            const allOn: Record<string, boolean> = {};
                            columnGroups.forEach(g => { allOn[g.key] = true; });
                            setVisibleGroups(allOn);
                          }}
                          className="w-full px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 text-left transition-colors"
                        >
                          Show All
                        </button>
                        <button
                          onClick={() => {
                            const allOff: Record<string, boolean> = {};
                            columnGroups.forEach(g => { allOff[g.key] = false; });
                            setVisibleGroups(allOff);
                          }}
                          className="w-full px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 text-left transition-colors"
                        >
                          Hide All
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                {columnGroups.map((g) => (
                  <button
                    key={g.key}
                    onClick={() => toggleGroup(g.key)}
                    className={`px-2 py-1 text-xs rounded-md border transition-colors ${
                      visibleGroups[g.key]
                        ? "bg-blue-50 border-blue-200 text-blue-700"
                        : "bg-gray-100 border-gray-200 text-gray-500"
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  {/* Group header row */}
                  <tr className="bg-gray-800 text-white text-xs">
                    <th className="px-2 py-1.5 sticky left-0 z-20 bg-gray-800" colSpan={4}>Product</th>
                    {visibleGroups.category && <th className="px-2 py-1.5 border-l border-gray-600">Cat</th>}
                    {visibleGroups.cost && <th className="px-2 py-1.5 text-center border-l border-gray-600" colSpan={7 - (hasData.fob_usd ? 0 : 1) - (hasData.fob_eur ? 0 : 1)}>Cost</th>}
                    {visibleGroups.srp && <th className="px-2 py-1.5 text-center border-l border-gray-600" colSpan={3 - (hasData.srp_usd ? 0 : 1) - (hasData.srp_eur ? 0 : 1)}>SRP</th>}
                    {visibleGroups.pricing && <th className="px-2 py-1.5 text-center border-l border-gray-600 bg-green-800" colSpan={3}>Thai Pricing</th>}
                    {channels.map((ch, ci) => (
                      visibleGroups[ch.name] ? (
                        <th key={ch.name} className={`px-2 py-1.5 text-center border-l border-gray-600 ${chGroupBg(ci)}`} colSpan={4}>{ch.name}</th>
                      ) : null
                    ))}
                    <th className="px-2 py-1.5 w-8"></th>
                  </tr>
                  {/* Column header row */}
                  <tr className="bg-gray-100 text-gray-800 font-medium">
                    {/* Frozen columns */}
                    <th className="px-2 py-2 text-left w-[40px] sticky left-0 z-20 bg-gray-100">#</th>
                    <th className="px-2 py-2 text-center w-[52px] sticky left-[40px] z-20 bg-gray-100">Image</th>
                    <th className="px-2 py-2 text-left w-[200px] min-w-[200px] sticky left-[92px] z-20 bg-gray-100">Product</th>
                    <th className="px-2 py-2 text-left w-[180px] min-w-[180px] sticky left-[292px] z-20 bg-gray-100 border-r border-gray-300 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]">SKU</th>

                    {/* Scrollable columns */}
                    {visibleGroups.category && (
                      <th className="px-2 py-2 text-left">Category</th>
                    )}

                    {visibleGroups.cost && (
                      <>
                        {hasData.fob_usd && <th className="px-2 py-2 text-right min-w-[100px] bg-sky-50">FOB $</th>}
                        {hasData.fob_eur && <th className="px-2 py-2 text-right min-w-[100px] bg-sky-50">FOB &euro;</th>}
                        <th className="px-2 py-2 text-right min-w-[100px] bg-sky-50">FOB &#3647;</th>
                        <th className="px-2 py-2 text-right min-w-[100px] bg-sky-50">Freight+D/O</th>
                        <th className="px-2 py-2 text-right min-w-[80px] bg-sky-50">Tax %</th>
                        <th className="px-2 py-2 text-right min-w-[100px] bg-sky-50">Shipping</th>
                        <th className="px-2 py-2 text-right min-w-[100px] bg-sky-50 border-r border-gray-300 font-bold">Total Cost</th>
                      </>
                    )}

                    {visibleGroups.srp && (
                      <>
                        {hasData.srp_usd && <th className="px-2 py-2 text-right min-w-[100px] bg-violet-50">SRP $</th>}
                        {hasData.srp_eur && <th className="px-2 py-2 text-right min-w-[100px] bg-violet-50">SRP &euro;</th>}
                        <th className="px-2 py-2 text-right min-w-[100px] bg-violet-50 border-r border-gray-300">SRP &#3647;</th>
                      </>
                    )}

                    {visibleGroups.pricing && (
                      <>
                        <th className="px-2 py-2 text-right bg-green-50 min-w-[100px]">Suggested</th>
                        <th className="px-2 py-2 text-right bg-emerald-200 font-bold text-emerald-900 min-w-[110px]">Our Price</th>
                        <th className="px-2 py-2 text-right bg-green-50 min-w-[80px]">Margin</th>
                      </>
                    )}

                    {channels.map((ch, ci) => (
                      visibleGroups[ch.name] ? (
                        <React.Fragment key={ch.name}>
                          <th className={`px-1 py-1 text-center border-l border-gray-300 min-w-[100px] ${chHeaderBg(ci)}`}>
                            <div className="flex flex-col items-center gap-0.5">
                              <span className="text-xs">Promo</span>
                              <select
                                value={ch.promo_pct}
                                onChange={(e) => {
                                  const updated = [...channels];
                                  updated[ci] = { ...ch, promo_pct: parseFloat(e.target.value) };
                                  setChannels(updated);
                                }}
                                className="bg-white border border-gray-300 rounded px-1 py-0.5 text-xs text-gray-800 cursor-pointer"
                              >
                                {PROMO_OPTIONS.map(v => (
                                  <option key={v} value={v}>{v}%</option>
                                ))}
                              </select>
                            </div>
                          </th>
                          <th className={`px-2 py-2 text-right min-w-[100px] ${chHeaderBg(ci)}`}>GP {ch.gp_pct + ch.pc_pct + ch.dc_pct}%</th>
                          <th className={`px-2 py-2 text-right min-w-[100px] ${chHeaderBg(ci)}`}>Profit &#3647;</th>
                          <th className={`px-2 py-2 text-right min-w-[80px] ${chHeaderBg(ci)}`}>Profit %</th>
                        </React.Fragment>
                      ) : null
                    ))}
                    <th className="px-2 py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {calculated.map((p, i) => {
                    const ourPrice = p.our_price_thb || p.suggested_price;
                    const margin =
                      ourPrice > 0
                        ? ((ourPrice - p.total_import_cost) / ourPrice) * 100
                        : 0;

                    return (
                      <tr
                        key={p.id}
                        className="border-t border-gray-100 hover:bg-gray-50 transition-colors group"
                      >
                        {/* Frozen columns */}
                        <td className="px-2 py-2 text-gray-700 sticky left-0 z-10 bg-white group-hover:bg-gray-50">{i + 1}</td>
                        <td className="px-2 py-2 text-center sticky left-[40px] z-10 bg-white group-hover:bg-gray-50">
                          {p.image_url ? (
                            <img
                              src={p.image_url}
                              alt={p.name}
                              className="w-10 h-10 object-contain rounded mx-auto"
                            />
                          ) : (
                            <label className="cursor-pointer">
                              <ImageIcon className="w-5 h-5 text-gray-300 mx-auto hover:text-blue-400 transition-colors" />
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) handleImageUpload(p.id, f);
                                }}
                              />
                            </label>
                          )}
                        </td>
                        <td className="px-2 py-1 sticky left-[92px] z-10 bg-white group-hover:bg-gray-50">
                          <textarea
                            value={p.name}
                            rows={2}
                            onChange={(e) => handleProductUpdate(p.id, "name", e.target.value)}
                            className="w-full bg-blue-50 border-0 p-0.5 rounded text-sm font-semibold text-gray-900 focus:ring-1 focus:ring-blue-400 resize-none leading-tight"
                          />
                          {p.last_edited_by && (
                            <Tooltip content={
                              <div className="space-y-1">
                                <div className="font-medium">{p.last_edited_by}</div>
                                {p.last_edited_at && (
                                  <div className="text-gray-400">
                                    {new Date(p.last_edited_at).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}
                                  </div>
                                )}
                              </div>
                            }>
                              <span className="text-[10px] text-gray-400 cursor-default truncate max-w-[180px] block">
                                {p.last_edited_by.split("@")[0]}
                              </span>
                            </Tooltip>
                          )}
                        </td>
                        <td className="px-2 py-2 sticky left-[292px] z-10 bg-white group-hover:bg-gray-50 border-r border-gray-100 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]">
                          <input
                            type="text"
                            value={p.sku}
                            onChange={(e) =>
                              handleProductUpdate(p.id, "sku", e.target.value)
                            }
                            className="w-full bg-blue-50 border-0 p-0.5 rounded text-sm text-gray-700 focus:ring-1 focus:ring-blue-400"
                          />
                        </td>

                        {/* Scrollable columns */}
                        {visibleGroups.category && (
                          <td className="px-2 py-2">
                            {newCategoryFor === p.id ? (
                              <input
                                autoFocus
                                type="text"
                                placeholder="New category..."
                                onBlur={(e) => {
                                  if (e.target.value.trim()) handleProductUpdate(p.id, "category", e.target.value.trim());
                                  setNewCategoryFor(null);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    const v = (e.target as HTMLInputElement).value.trim();
                                    if (v) handleProductUpdate(p.id, "category", v);
                                    setNewCategoryFor(null);
                                  }
                                  if (e.key === "Escape") setNewCategoryFor(null);
                                }}
                                className="w-full bg-blue-50 border border-blue-300 p-0.5 rounded text-sm text-gray-700 focus:ring-1 focus:ring-blue-400"
                              />
                            ) : (
                              <select
                                value={p.category}
                                onChange={(e) => {
                                  if (e.target.value === "__new__") {
                                    setNewCategoryFor(p.id);
                                  } else {
                                    handleProductUpdate(p.id, "category", e.target.value);
                                  }
                                }}
                                className="w-full bg-blue-50 border-0 p-0.5 rounded text-sm text-gray-700 focus:ring-1 focus:ring-blue-400 cursor-pointer"
                              >
                                <option value="">-</option>
                                {categories.map(c => (
                                  <option key={c} value={c}>{c}</option>
                                ))}
                                {p.category && !categories.includes(p.category) && (
                                  <option value={p.category}>{p.category}</option>
                                )}
                                <option value="__new__">+ New...</option>
                              </select>
                            )}
                          </td>
                        )}

                        {visibleGroups.cost && (
                          <>
                            {hasData.fob_usd && (
                            <td className="px-2 py-2 text-right bg-sky-50/40">
                              <div className="flex items-center gap-0.5 bg-blue-50 rounded px-1 py-0.5 justify-end">
                                <input
                                  type="number"
                                  step="0.01"
                                  value={p.fob_usd || ""}
                                  placeholder="-"
                                  onChange={(e) =>
                                    handleProductUpdate(p.id, "fob_usd", parseFloat(e.target.value) || 0)
                                  }
                                  className="w-16 bg-transparent border-0 p-0 text-sm text-right font-medium text-gray-800 focus:ring-0 focus:outline-none"
                                />
                                <span className="text-xs text-gray-500 font-medium">$</span>
                              </div>
                            </td>
                            )}
                            {hasData.fob_eur && (
                            <td className="px-2 py-2 text-right bg-sky-50/40">
                              <div className="flex items-center gap-0.5 bg-blue-50 rounded px-1 py-0.5 justify-end">
                                <input
                                  type="number"
                                  step="0.01"
                                  value={p.fob_eur || ""}
                                  placeholder="-"
                                  onChange={(e) =>
                                    handleProductUpdate(p.id, "fob_eur", parseFloat(e.target.value) || 0)
                                  }
                                  className="w-16 bg-transparent border-0 p-0 text-sm text-right font-medium text-gray-800 focus:ring-0 focus:outline-none"
                                />
                                <span className="text-xs text-gray-500 font-medium">&euro;</span>
                              </div>
                            </td>
                            )}
                            <td className="px-2 py-2 text-right text-gray-900 font-semibold whitespace-nowrap bg-sky-50/40">
                              {fmt(p.fob_thb)}<span className="text-xs text-gray-500 ml-0.5">&#3647;</span>
                            </td>
                            <td className="px-2 py-2 text-right bg-sky-50/40">
                              <div className="flex items-center gap-0.5 bg-blue-50 rounded px-1 py-0.5 justify-end">
                                <input
                                  type="number"
                                  value={p.freight_do || ""}
                                  placeholder="-"
                                  onChange={(e) =>
                                    handleProductUpdate(p.id, "freight_do", parseFloat(e.target.value) || 0)
                                  }
                                  className="w-14 bg-transparent border-0 p-0 text-sm text-right text-gray-700 focus:ring-0 focus:outline-none"
                                />
                                <span className="text-xs text-gray-500 font-medium">&#3647;</span>
                              </div>
                            </td>
                            <td className="px-2 py-2 text-right bg-sky-50/40">
                              <div className="flex items-center gap-0.5 bg-blue-50 rounded px-1 py-0.5 justify-end">
                                <input
                                  type="number"
                                  value={p.import_tax_pct || ""}
                                  placeholder="5"
                                  onChange={(e) =>
                                    handleProductUpdate(p.id, "import_tax_pct", parseFloat(e.target.value) || 0)
                                  }
                                  className="w-10 bg-transparent border-0 p-0 text-sm text-right text-gray-700 focus:ring-0 focus:outline-none"
                                />
                                <span className="text-xs text-gray-500 font-medium">%</span>
                              </div>
                            </td>
                            <td className="px-2 py-2 text-right bg-sky-50/40">
                              <div className="flex items-center gap-0.5 bg-blue-50 rounded px-1 py-0.5 justify-end">
                                <input
                                  type="number"
                                  value={p.shipping_cost || ""}
                                  placeholder="-"
                                  onChange={(e) =>
                                    handleProductUpdate(p.id, "shipping_cost", parseFloat(e.target.value) || 0)
                                  }
                                  className="w-14 bg-transparent border-0 p-0 text-sm text-right text-gray-700 focus:ring-0 focus:outline-none"
                                />
                                <span className="text-xs text-gray-500 font-medium">&#3647;</span>
                              </div>
                            </td>
                            <td className="px-2 py-2 text-right font-bold text-gray-900 border-r border-gray-100 whitespace-nowrap bg-sky-50/40">
                              {fmt(p.total_import_cost)}<span className="text-xs text-gray-500 font-normal ml-0.5">&#3647;</span>
                            </td>
                          </>
                        )}

                        {visibleGroups.srp && (
                          <>
                            {hasData.srp_usd && (
                            <td className="px-2 py-2 text-right bg-violet-50/40">
                              <div className="flex items-center gap-0.5 bg-blue-50 rounded px-1 py-0.5 justify-end">
                                <input
                                  type="number"
                                  step="0.01"
                                  value={p.srp_usd || ""}
                                  placeholder="-"
                                  onChange={(e) =>
                                    handleProductUpdate(p.id, "srp_usd", parseFloat(e.target.value) || 0)
                                  }
                                  className="w-16 bg-transparent border-0 p-0 text-sm text-right font-medium text-gray-800 focus:ring-0 focus:outline-none"
                                />
                                <span className="text-xs text-gray-500 font-medium">$</span>
                              </div>
                            </td>
                            )}
                            {hasData.srp_eur && (
                            <td className="px-2 py-2 text-right bg-violet-50/40">
                              <div className="flex items-center gap-0.5 bg-blue-50 rounded px-1 py-0.5 justify-end">
                                <input
                                  type="number"
                                  step="0.01"
                                  value={p.srp_eur || ""}
                                  placeholder="-"
                                  onChange={(e) =>
                                    handleProductUpdate(p.id, "srp_eur", parseFloat(e.target.value) || 0)
                                  }
                                  className="w-16 bg-transparent border-0 p-0 text-sm text-right font-medium text-gray-800 focus:ring-0 focus:outline-none"
                                />
                                <span className="text-xs text-gray-500 font-medium">&euro;</span>
                              </div>
                            </td>
                            )}
                            <td className="px-2 py-2 text-right text-gray-900 font-semibold border-r border-gray-100 whitespace-nowrap bg-violet-50/40">
                              {p.srp_thb > 0 ? <>{fmt(p.srp_thb)}<span className="text-xs text-gray-500 font-normal ml-0.5">&#3647;</span></> : "-"}
                            </td>
                          </>
                        )}

                        {/* Thai Pricing */}
                        {visibleGroups.pricing && (
                          <>
                            <td className="px-2 py-1 text-right bg-green-50/50 whitespace-nowrap">
                              <div className="text-xs text-gray-400">{fmt(p.raw_price)}<span className="ml-0.5">&#3647;</span></div>
                              <button
                                onClick={() =>
                                  handleApplySuggested(p.id, p.suggested_price)
                                }
                                className="text-gray-700 hover:text-green-700 hover:underline transition-colors font-medium"
                                title="Click to apply"
                              >
                                {fmt(p.suggested_price)}<span className="text-xs text-gray-500 ml-0.5">&#3647;</span>
                              </button>
                            </td>
                            <td className="px-2 py-1 bg-emerald-100">
                              <div className="flex items-center gap-1 border border-emerald-400 rounded-md bg-white px-2 py-1 justify-end">
                                <input
                                  type="number"
                                  value={p.our_price_thb || ""}
                                  placeholder={fmt(p.suggested_price)}
                                  onChange={(e) =>
                                    handleProductUpdate(
                                      p.id,
                                      "our_price_thb",
                                      parseFloat(e.target.value) || 0
                                    )
                                  }
                                  className="w-20 bg-emerald-50 border-0 p-0.5 rounded text-sm text-right font-bold text-emerald-900 focus:ring-0 focus:outline-none"
                                />
                                <span className="text-xs font-medium text-emerald-700">&#3647;</span>
                              </div>
                            </td>
                            <td className="px-2 py-2 text-right bg-green-50/50">
                              <span
                                className={`inline-block px-1.5 py-0.5 rounded text-xs font-semibold ${
                                  margin >= 65
                                    ? "bg-green-100 text-green-700"
                                    : margin >= 55
                                    ? "bg-yellow-100 text-yellow-700"
                                    : "bg-red-100 text-red-700"
                                }`}
                              >
                                {fmtDec(margin)}%
                              </span>
                            </td>
                          </>
                        )}

                        {/* Sales Channel columns */}
                        {channels.map((ch, ci) => {
                          if (!visibleGroups[ch.name]) return null;
                          const cp = calculateChannelProfit(ourPrice, p.total_import_cost, ch);
                          return (
                            <React.Fragment key={ch.name}>
                              <td className={`px-2 py-2 text-right border-l whitespace-nowrap ${chBg(ci)}`}>
                                <div className="font-medium text-gray-900">{fmt(cp.selling_price)}<span className="text-xs text-gray-500 ml-0.5">&#3647;</span></div>
                                {ch.promo_pct > 0 && (
                                  <div className="text-xs text-red-500">-{ch.promo_pct}%</div>
                                )}
                              </td>
                              <td className={`px-2 py-2 text-right whitespace-nowrap text-gray-700 ${chBg(ci)}`}>
                                {fmt(cp.store_profit_thb)}<span className="text-xs text-gray-500 ml-0.5">&#3647;</span>
                              </td>
                              <td className={`px-2 py-2 text-right whitespace-nowrap font-semibold text-gray-900 ${chBg(ci)}`}>
                                {fmt(cp.our_profit_thb)}<span className="text-xs text-gray-500 ml-0.5">&#3647;</span>
                              </td>
                              <td className={`px-2 py-2 text-right ${chBg(ci)}`}>
                                <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-semibold ${
                                  cp.our_profit_pct >= 20 ? "bg-green-100 text-green-700" :
                                  cp.our_profit_pct >= 10 ? "bg-yellow-100 text-yellow-700" :
                                  "bg-red-100 text-red-700"
                                }`}>
                                  {fmtDec(cp.our_profit_pct)}%
                                </span>
                              </td>
                            </React.Fragment>
                          );
                        })}

                        <td className="px-2 py-2">
                          <button
                            onClick={() => handleDeleteProduct(p.id)}
                            className="text-gray-300 hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
