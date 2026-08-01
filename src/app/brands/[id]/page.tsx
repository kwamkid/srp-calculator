"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
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
  X,
  Plus,
  Check,
  Pencil,
  Power,
  FileSpreadsheet,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { LoginPage } from "@/components/LoginPage";
import { Tooltip } from "@/components/Tooltip";
import { supabase } from "@/lib/supabase";
import { calculateProduct, roundToNicePrice, calculateChannelProfit, marginPct } from "@/lib/calculator";
import { DEFAULT_OFFLINE_CHANNELS, DEFAULT_ONLINE_CHANNELS } from "@/lib/types";
import type { Brand, Product, CalculatedProduct, SalesChannel, OfflineChannel, OnlineChannel, BrandMember } from "@/lib/types";
import Link from "next/link";
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
const PER_PAGE_OPTIONS = [25, 50, 100];
const PAG_BTN = "px-1.5 py-1 rounded-full hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed text-white transition-colors";


function NumInput({ value, onChange, placeholder, className, step, decimals }: {
  value: number | string;
  onChange: (val: number) => void;
  placeholder?: string;
  className?: string;
  step?: string;
  decimals?: number;
}) {
  const [focused, setFocused] = useState(false);
  const [raw, setRaw] = useState("");
  const num = typeof value === "number" ? value : parseFloat(value as string) || 0;
  const display = !focused && num ? (decimals ? fmtDec(num) : fmt(num)) : undefined;

  return (
    <input
      type="text"
      inputMode="decimal"
      value={focused ? raw : (display || (value === "" || value === 0 ? "" : String(value)))}
      placeholder={placeholder}
      step={step}
      onFocus={() => {
        setFocused(true);
        setRaw(num ? String(num) : "");
      }}
      onBlur={() => {
        setFocused(false);
        onChange(parseFloat(raw) || 0);
      }}
      onChange={(e) => {
        const v = e.target.value.replace(/[^0-9.\-]/g, "");
        setRaw(v);
        onChange(parseFloat(v) || 0);
      }}
      className={className}
    />
  );
}

function profitColor(pct: number): string {
  // 30%+ = green
  if (pct >= 50) return "bg-green-300 text-green-900";
  if (pct >= 45) return "bg-green-200 text-green-800";
  if (pct >= 40) return "bg-green-100 text-green-700";
  if (pct >= 35) return "bg-green-50 text-green-600";
  if (pct >= 30) return "bg-emerald-50 text-emerald-600";
  // 15–29% = yellow
  if (pct >= 25) return "bg-yellow-100 text-yellow-700";
  if (pct >= 20) return "bg-yellow-200 text-yellow-800";
  if (pct >= 15) return "bg-amber-200 text-amber-800";
  // 0–14% = red
  if (pct >= 10) return "bg-red-100 text-red-600";
  if (pct >= 5)  return "bg-red-200 text-red-700";
  if (pct >= 0)  return "bg-red-300 text-red-800";
  // Negative = purple → black
  if (pct >= -5)  return "bg-purple-500 text-white";
  if (pct >= -10) return "bg-purple-600 text-white";
  if (pct >= -15) return "bg-purple-700 text-white";
  if (pct >= -20) return "bg-purple-900 text-white";
  return "bg-gray-900 text-white";
}

function Checkbox({ checked, indeterminate, onChange, dark }: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
  dark?: boolean;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`w-4 h-4 rounded flex items-center justify-center transition-all duration-150 border ${
        checked || indeterminate
          ? "bg-blue-500 border-blue-500 shadow-sm shadow-blue-500/30"
          : dark
            ? "border-slate-500 bg-slate-700 hover:border-slate-400"
            : "border-gray-300 bg-white hover:border-blue-400"
      }`}
    >
      {checked && (
        <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
          <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
      {!checked && indeterminate && (
        <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
          <path d="M3 6H9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
      )}
    </button>
  );
}

function CategoryCell({ value, categories, onChange, onDeleteCategory }: {
  value: string;
  categories: string[];
  onChange: (val: string) => void;
  onDeleteCategory: (cat: string, replaceTo: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setOpen(false);
      setSearch("");
      setDeleting(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 2, left: rect.left });
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const filtered = categories.filter(c =>
    c.toLowerCase().includes(search.toLowerCase())
  );
  const isNew = search.trim() && !categories.some(c => c.toLowerCase() === search.trim().toLowerCase());
  const othersForReplace = categories.filter(c => c !== deleting);

  return (
    <div ref={triggerRef} data-no-row-select>
      {/* Display */}
      <div
        className="flex items-center gap-1 cursor-pointer min-h-[24px]"
        onClick={() => { setOpen(!open); setDeleting(null); }}
      >
        {value ? (
          <span className="truncate text-gray-700 flex-1">{value}</span>
        ) : (
          <span className="text-gray-400 text-[13px] flex-1">Select...</span>
        )}
        <ChevronDown className={`w-3.5 h-3.5 text-gray-500 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </div>

      {/* Dropdown via portal — renders outside table so row-highlight CSS won't affect it */}
      {open && createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-[9999] w-[240px] bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden"
          style={{ top: pos.top, left: pos.left }}
        >
          {/* Search input */}
          <div className="p-1.5 border-b border-gray-100">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setDeleting(null); }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (isNew) {
                    onChange(search.trim());
                    setSearch("");
                    setOpen(false);
                  } else if (filtered.length === 1) {
                    onChange(filtered[0]);
                    setSearch("");
                    setOpen(false);
                  }
                }
                if (e.key === "Escape") { setOpen(false); setSearch(""); }
              }}
              placeholder="Search or add..."
              className="w-full text-[13px] px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400/20 placeholder:text-gray-300 text-gray-900"
            />
          </div>

          {/* Delete confirm panel */}
          {deleting && (
            <div className="p-2 bg-red-50 border-b border-red-100">
              <div className="text-[12px] text-red-600 font-medium mb-1.5">
                Delete &quot;{deleting}&quot; — replace with:
              </div>
              <div className="flex flex-wrap gap-1">
                <button
                  onClick={() => { onDeleteCategory(deleting, ""); setDeleting(null); setSearch(""); setOpen(false); }}
                  className="px-2 py-0.5 text-[11px] rounded-full bg-white border border-red-200 text-red-500 hover:bg-red-100 transition-colors"
                >
                  None (clear)
                </button>
                {othersForReplace.map(c => (
                  <button
                    key={c}
                    onClick={() => { onDeleteCategory(deleting, c); setDeleting(null); setSearch(""); setOpen(false); }}
                    className="px-2 py-0.5 text-[11px] rounded-full bg-white border border-gray-200 text-gray-600 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 transition-colors"
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Options list */}
          <div className="max-h-[200px] overflow-y-auto py-0.5">
            {/* Clear current */}
            {value && !search && (
              <button
                onClick={() => { onChange(""); setOpen(false); setSearch(""); }}
                className="w-full px-3 py-1.5 text-left text-[13px] text-gray-400 hover:bg-gray-50 flex items-center gap-2 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                Clear
              </button>
            )}

            {filtered.map(c => (
              <div
                key={c}
                className={`flex items-center transition-colors ${
                  c === value ? "bg-blue-50" : "hover:bg-gray-50"
                }`}
              >
                <button
                  onClick={() => { onChange(c); setSearch(""); setOpen(false); }}
                  className={`flex-1 px-3 py-1.5 text-left text-[13px] flex items-center gap-2 truncate ${
                    c === value ? "text-blue-700 font-medium" : "text-gray-700"
                  }`}
                >
                  {c === value ? <Check className="w-3.5 h-3.5 text-blue-500 shrink-0" /> : <span className="w-3.5 shrink-0" />}
                  {c}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setDeleting(deleting === c ? null : c); }}
                  className="px-2 py-1.5 text-gray-300 hover:text-red-500 transition-colors"
                  title={`Delete "${c}"`}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}

            {/* Create new */}
            {isNew && (
              <button
                onClick={() => { onChange(search.trim()); setSearch(""); setOpen(false); }}
                className="w-full px-3 py-1.5 text-left text-[13px] text-blue-600 hover:bg-blue-50 flex items-center gap-2 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Create &quot;{search.trim()}&quot;
              </button>
            )}

            {!isNew && filtered.length === 0 && (
              <div className="px-3 py-2 text-[13px] text-gray-400 text-center">No categories found</div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

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
  const [showColumnMenu, setShowColumnMenu] = useState(false);

  const [myRole, setMyRole] = useState<"owner" | "editor" | "viewer">("viewer");
  const [bulkEdit, setBulkEdit] = useState<{ field: keyof Product; label: string; type: "number" | "text" } | null>(null);
  const [bulkValue, setBulkValue] = useState("");
  const [platformMarkupInput, setPlatformMarkupInput] = useState("");
  const [sortBy, setSortBy] = useState<{ id: string; dir: "asc" | "desc" } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("");
  const [statusTab, setStatusTab] = useState<"active" | "inactive" | "all">("active");
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [activeTab, setActiveTab] = useState<"offline" | "online">("offline");
  const [offlineChannels, setOfflineChannels] = useState<OfflineChannel[]>(DEFAULT_OFFLINE_CHANNELS);
  const [onlineChannels, setOnlineChannels] = useState<OnlineChannel[]>(DEFAULT_ONLINE_CHANNELS);
  const [visibleGroups, setVisibleGroups] = useState<Record<string, boolean>>({
    sku: true,
    category: true,
    cost: true,
    srp: true,
    pricing: true,
    ...Object.fromEntries([...DEFAULT_OFFLINE_CHANNELS, ...DEFAULT_ONLINE_CHANNELS].map(ch => [ch.name, true])),
  });

  // Sticky header: measure first row height for second row top offset
  const [groupRowH, setGroupRowH] = useState(33);
  const groupRowRef = useCallback((el: HTMLTableRowElement | null) => {
    if (el) setGroupRowH(el.offsetHeight);
  }, []);


  const toggleGroup = (group: string) => {
    setVisibleGroups(prev => ({ ...prev, [group]: !prev[group] }));
  };

  const categories = [...new Set(products.map(p => p.category).filter(Boolean))];

  // Active channels based on tab
  const channels: SalesChannel[] = activeTab === "offline" ? offlineChannels : onlineChannels;

  const columnGroups = [
    { key: "sku", label: "SKU" },
    { key: "category", label: "Category" },
    { key: "cost", label: "Cost" },
    { key: "srp", label: "SRP" },
    { key: "pricing", label: "Pricing" },
    ...channels.map(ch => ({ key: ch.name, label: ch.name })),
  ];

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [brandRes, productsRes, bmRes, channelsRes] = await Promise.all([
      supabase.from("brands").select("*").eq("id", brandId).single(),
      supabase
        .from("products")
        .select("*")
        .eq("brand_id", brandId)
        .order("sort_order", { ascending: true }),
      supabase.from("brand_members").select("*").eq("brand_id", brandId).eq("user_id", user.id).maybeSingle(),
      supabase.from("brand_channels").select("*").eq("brand_id", brandId).order("sort_order"),
    ]);
    setBrand(brandRes.data);
    setPlatformMarkupInput(brandRes.data?.platform_markup_pct ? String(brandRes.data.platform_markup_pct) : "");
    setProducts(productsRes.data || []);
    // Determine role
    if (brandRes.data?.user_id === user.id) {
      setMyRole("owner");
    } else if (bmRes.data) {
      setMyRole(bmRes.data.role === "editor" ? "editor" : "viewer");
    } else {
      setMyRole("viewer");
    }
    // Load channels from DB or seed defaults
    const dbChannels = channelsRes.data || [];
    if (dbChannels.length > 0) {
      const offline = dbChannels.filter((c: { type: string }) => c.type === "offline").map((c: Record<string, unknown>) => ({
        type: "offline" as const, name: c.name as string,
        gp_pct: Number(c.gp_pct) || 0, pc_pct: Number(c.pc_pct) || 0, dc_pct: Number(c.dc_pct) || 0,
        promo_pct: Number(c.promo_pct) || 0,
      }));
      const online = dbChannels.filter((c: { type: string }) => c.type === "online").map((c: Record<string, unknown>) => ({
        type: "online" as const, name: c.name as string,
        commission_pct: Number(c.commission_pct) || 0, transaction_fee_pct: Number(c.transaction_fee_pct) || 0,
        service_fee_pct: Number(c.service_fee_pct) || 0, shipping_thb: Number(c.shipping_thb) || 0,
        promo_pct: Number(c.promo_pct) || 0,
      }));
      if (offline.length > 0) setOfflineChannels(offline);
      if (online.length > 0) setOnlineChannels(online);
    } else if (brandRes.data) {
      // Seed defaults for this brand
      const seedRows = [
        ...DEFAULT_OFFLINE_CHANNELS.map((ch, i) => ({ brand_id: brandId, type: "offline", name: ch.name, sort_order: i, gp_pct: ch.gp_pct, pc_pct: ch.pc_pct, dc_pct: ch.dc_pct, promo_pct: ch.promo_pct })),
        ...DEFAULT_ONLINE_CHANNELS.map((ch, i) => ({ brand_id: brandId, type: "online", name: ch.name, sort_order: i, commission_pct: ch.commission_pct, transaction_fee_pct: ch.transaction_fee_pct, service_fee_pct: ch.service_fee_pct, shipping_thb: ch.shipping_thb, promo_pct: ch.promo_pct })),
      ];
      supabase.from("brand_channels").insert(seedRows).then();
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

  // Counts for status tabs (independent of other filters)
  const activeCount = calculated.filter((p) => p.is_active !== false).length;
  const inactiveCount = calculated.filter((p) => p.is_active === false).length;

  // Filter (status + search + category)
  const filteredCalculated = (() => {
    let arr = calculated;
    if (statusTab === "active") arr = arr.filter((p) => p.is_active !== false);
    else if (statusTab === "inactive") arr = arr.filter((p) => p.is_active === false);
    if (filterCategory) arr = arr.filter((p) => p.category === filterCategory);
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      arr = arr.filter(
        (p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
      );
    }
    return arr;
  })();

  // Sort
  const SORT_GETTERS: Record<string, (p: CalculatedProduct) => number | string> = {
    name: (p) => p.name.toLowerCase(),
    sku: (p) => p.sku.toLowerCase(),
    category: (p) => p.category.toLowerCase(),
    fob_usd: (p) => p.fob_usd || 0,
    fob_eur: (p) => p.fob_eur || 0,
    fob_thb: (p) => p.fob_thb || 0,
    freight_do: (p) => p.freight_do || 0,
    import_tax_pct: (p) => p.import_tax_pct || 0,
    shipping_cost: (p) => p.shipping_cost || 0,
    total_import_cost: (p) => p.total_import_cost || 0,
    srp_usd: (p) => p.srp_usd || 0,
    srp_eur: (p) => p.srp_eur || 0,
    srp_thb: (p) => p.srp_thb || 0,
    suggested: (p) => p.suggested_price || 0,
    our_price: (p) => p.our_price_thb || p.suggested_price || 0,
    margin_our: (p) => marginPct(p.our_price_thb || p.suggested_price || 0, p.total_import_cost),
    platform_price: (p) => p.platform_price_thb || 0,
    margin_platform: (p) => marginPct(p.platform_price_thb || 0, p.total_import_cost),
    last_edited: (p) => p.last_edited_at || "",
  };

  const sortedCalculated = (() => {
    if (!sortBy) return filteredCalculated;
    const getter = SORT_GETTERS[sortBy.id];
    if (!getter) return filteredCalculated;
    const sorted = [...filteredCalculated].sort((a, b) => {
      const av = getter(a);
      const bv = getter(b);
      if (typeof av === "number" && typeof bv === "number") return av - bv;
      return String(av).localeCompare(String(bv));
    });
    if (sortBy.dir === "desc") sorted.reverse();
    return sorted;
  })();

  const handleSort = (id: string) => {
    setSortBy((prev) => {
      if (prev?.id === id) {
        if (prev.dir === "asc") return { id, dir: "desc" };
        return null; // 3rd click clears sort
      }
      return { id, dir: "asc" };
    });
    setCurrentPage(1);
  };

  const SortIcon = ({ id }: { id: string }) => {
    if (sortBy?.id !== id) {
      return <ArrowUpDown className="w-3 h-3 inline-block opacity-25 ml-0.5" />;
    }
    return sortBy.dir === "asc"
      ? <ArrowUp className="w-3 h-3 inline-block ml-0.5" />
      : <ArrowDown className="w-3 h-3 inline-block ml-0.5" />;
  };

  const BulkEditBtn = ({ onClick }: { onClick: () => void }) => (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="text-gray-400 hover:text-blue-600 mr-1 align-middle"
      title="Bulk edit"
    >
      <Pencil className="w-2.5 h-2.5 inline" />
    </button>
  );

  const totalPages = Math.max(1, Math.ceil(sortedCalculated.length / perPage));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedProducts = sortedCalculated.slice((safePage - 1) * perPage, safePage * perPage);

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

  // Debounced DB save — instant local update, batched DB write
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const handleProductUpdate = useCallback(
    (productId: string, field: keyof Product, value: number | string | boolean) => {
      const editedBy = user?.email || "";
      const editedAt = new Date().toISOString();
      // Instant local state update
      setProducts((prev) =>
        prev.map((p) => (p.id === productId ? { ...p, [field]: value, last_edited_by: editedBy, last_edited_at: editedAt } : p))
      );
      // Debounce DB write (400ms)
      const key = `${productId}_${field}`;
      if (saveTimers.current[key]) clearTimeout(saveTimers.current[key]);
      saveTimers.current[key] = setTimeout(async () => {
        await supabase
          .from("products")
          .update({ [field]: value, last_edited_by: editedBy, last_edited_at: editedAt })
          .eq("id", productId);
        delete saveTimers.current[key];
      }, 400);
    },
    [user]
  );

  const handleApplySuggested = useCallback(
    (productId: string, suggestedPrice: number) => {
      const editedBy = user?.email || "";
      const editedAt = new Date().toISOString();
      setProducts((prev) =>
        prev.map((p) => (p.id === productId ? { ...p, our_price_thb: suggestedPrice, platform_price_thb: suggestedPrice, last_edited_by: editedBy, last_edited_at: editedAt } : p))
      );
      const key = `${productId}_suggested`;
      if (saveTimers.current[key]) clearTimeout(saveTimers.current[key]);
      saveTimers.current[key] = setTimeout(async () => {
        await supabase.from("products").update({ our_price_thb: suggestedPrice, platform_price_thb: suggestedPrice, last_edited_by: editedBy, last_edited_at: editedAt }).eq("id", productId);
        delete saveTimers.current[key];
      }, 400);
    },
    [user]
  );

  const handleApplyAllSuggested = useCallback(async () => {
    if (!brand) return;
    const updates = products.map((p) => {
      const calc = calculateProduct(p, brand);
      return { id: p.id, our_price_thb: calc.suggested_price, platform_price_thb: calc.suggested_price };
    });

    setProducts((prev) =>
      prev.map((p) => {
        const u = updates.find((x) => x.id === p.id);
        return u ? { ...p, our_price_thb: u.our_price_thb, platform_price_thb: u.platform_price_thb } : p;
      })
    );

    await Promise.all(
      updates.map((u) =>
        supabase.from("products").update({ our_price_thb: u.our_price_thb, platform_price_thb: u.platform_price_thb }).eq("id", u.id)
      )
    );
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

  const handleDeleteCategory = useCallback(
    (cat: string, replaceTo: string) => {
      setProducts(prev =>
        prev.map(p =>
          p.category === cat ? { ...p, category: replaceTo } : p
        )
      );
      // Persist to DB
      products.filter(p => p.category === cat).forEach(p => {
        supabase.from("products").update({ category: replaceTo }).eq("id", p.id).then();
      });
    },
    [products]
  );

  const handleImageUpload = useCallback(
    async (productId: string, file: File) => {
      // Crop to square + compress to ≤300KB
      const compressed = await new Promise<Blob>((resolve) => {
        const img = new window.Image();
        img.onload = () => {
          const size = Math.min(img.width, img.height);
          const sx = (img.width - size) / 2;
          const sy = (img.height - size) / 2;
          const canvas = document.createElement("canvas");
          canvas.width = 800;
          canvas.height = 800;
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(img, sx, sy, size, size, 0, 0, 800, 800);
          // Try decreasing quality until ≤300KB
          let quality = 0.9;
          const tryCompress = () => {
            canvas.toBlob(
              (blob) => {
                if (blob && (blob.size <= 300 * 1024 || quality <= 0.1)) {
                  resolve(blob!);
                } else {
                  quality -= 0.1;
                  tryCompress();
                }
              },
              "image/jpeg",
              quality
            );
          };
          tryCompress();
        };
        img.src = URL.createObjectURL(file);
      });

      const path = `${brandId}/${productId}.jpg`;
      const { error } = await supabase.storage
        .from("product-images")
        .upload(path, compressed, { upsert: true, contentType: "image/jpeg" });
      if (error) {
        console.error("Upload error:", error.message);
        return;
      }
      const {
        data: { publicUrl },
      } = supabase.storage.from("product-images").getPublicUrl(path);
      handleProductUpdate(productId, "image_url", `${publicUrl}?t=${Date.now()}`);
    },
    [brandId, handleProductUpdate]
  );

  const handleImageDelete = useCallback(
    async (productId: string) => {
      if (!confirm("ต้องการลบรูปนี้ใช่หรือไม่?")) return;
      await supabase.storage.from("product-images").remove([`${brandId}/${productId}.jpg`]);
      handleProductUpdate(productId, "image_url", "");
      setLightboxId(null);
    },
    [brandId, handleProductUpdate]
  );

  const handleLogoUpload = useCallback(async (file: File) => {
    const compressed = await new Promise<Blob>((resolve) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 200;
        canvas.height = 200;
        const ctx = canvas.getContext("2d")!;
        const size = Math.min(img.width, img.height);
        const sx = (img.width - size) / 2;
        const sy = (img.height - size) / 2;
        ctx.drawImage(img, sx, sy, size, size, 0, 0, 200, 200);
        canvas.toBlob((blob) => resolve(blob!), "image/jpeg", 0.85);
      };
      img.src = URL.createObjectURL(file);
    });
    const path = `logos/${brandId}.jpg`;
    const { error } = await supabase.storage
      .from("product-images")
      .upload(path, compressed, { upsert: true, contentType: "image/jpeg" });
    if (error) { console.error("Logo upload error:", error.message); return; }
    const { data: { publicUrl } } = supabase.storage.from("product-images").getPublicUrl(path);
    const logoUrl = `${publicUrl}?t=${Date.now()}`;
    await supabase.from("brands").update({ logo_url: logoUrl }).eq("id", brandId);
    setBrand((prev) => prev ? { ...prev, logo_url: logoUrl } : prev);
  }, [brandId]);

  const canEdit = myRole === "owner" || myRole === "editor";

  // Save channel to DB (debounced via caller)
  const channelSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const saveChannelToDB = useCallback((ch: SalesChannel) => {
    const key = `ch_${ch.name}`;
    if (channelSaveTimers.current[key]) clearTimeout(channelSaveTimers.current[key]);
    channelSaveTimers.current[key] = setTimeout(async () => {
      const row: Record<string, unknown> = { brand_id: brandId, type: ch.type, name: ch.name, promo_pct: ch.promo_pct };
      if (ch.type === "offline") {
        row.gp_pct = ch.gp_pct; row.pc_pct = ch.pc_pct; row.dc_pct = ch.dc_pct;
      } else {
        row.commission_pct = ch.commission_pct; row.transaction_fee_pct = ch.transaction_fee_pct;
        row.service_fee_pct = ch.service_fee_pct; row.shipping_thb = ch.shipping_thb;
      }
      await supabase.from("brand_channels").upsert(row, { onConflict: "brand_id,name" });
      delete channelSaveTimers.current[key];
    }, 500);
  }, [brandId]);

  const updateOfflineChannel = useCallback((idx: number, updates: Partial<OfflineChannel>) => {
    setOfflineChannels(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], ...updates };
      saveChannelToDB(updated[idx]);
      return updated;
    });
  }, [saveChannelToDB]);

  const updateOnlineChannel = useCallback((idx: number, updates: Partial<OnlineChannel>) => {
    setOnlineChannels(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], ...updates };
      saveChannelToDB(updated[idx]);
      return updated;
    });
  }, [saveChannelToDB]);

  const handleBulkApply = useCallback(async () => {
    if (!bulkEdit || bulkValue === "") return;
    const val = bulkEdit.type === "number" ? parseFloat(bulkValue) || 0 : bulkValue;
    const editedBy = user?.email || "";
    const editedAt = new Date().toISOString();
    setProducts((prev) =>
      prev.map((p) => ({ ...p, [bulkEdit.field]: val, last_edited_by: editedBy, last_edited_at: editedAt }))
    );
    const ids = products.map((p) => p.id);
    await supabase
      .from("products")
      .update({ [bulkEdit.field]: val, last_edited_by: editedBy, last_edited_at: editedAt })
      .in("id", ids);
    setBulkEdit(null);
    setBulkValue("");
  }, [bulkEdit, bulkValue, products, user]);

  const handlePlatformMarkupApply = useCallback(async (pct: number) => {
    if (isNaN(pct) || pct < 0) return;
    // Persist on brand
    setBrand((prev) => prev ? { ...prev, platform_markup_pct: pct } : prev);
    await supabase.from("brands").update({ platform_markup_pct: pct }).eq("id", brandId);
    // Recompute platform_price_thb for all products
    const editedBy = user?.email || "";
    const editedAt = new Date().toISOString();
    const updates = calculated.map((c) => {
      const ourPrice = c.our_price_thb || c.suggested_price || 0;
      return { id: c.id, platform_price_thb: roundToNicePrice(ourPrice * (1 + pct / 100)) };
    });
    const updateMap = new Map(updates.map((u) => [u.id, u.platform_price_thb]));
    setProducts((prev) =>
      prev.map((p) => {
        const newPlat = updateMap.get(p.id) ?? p.platform_price_thb;
        return { ...p, platform_price_thb: newPlat, last_edited_by: editedBy, last_edited_at: editedAt };
      })
    );
    // Save to DB in batches of 20
    for (let i = 0; i < updates.length; i += 20) {
      await Promise.all(
        updates.slice(i, i + 20).map((u) =>
          supabase.from("products").update({ platform_price_thb: u.platform_price_thb, last_edited_by: editedBy, last_edited_at: editedAt }).eq("id", u.id)
        )
      );
    }
  }, [brandId, user, calculated]);

  const handleExportPriceList = useCallback(async () => {
    if (calculated.length === 0) return;
    const ExcelJS = (await import("exceljs")).default;
    const { saveAs } = await import("file-saver");
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("ใบราคา");

    // Image = 70pt square; row height = 70pt so image fills the row exactly
    const IMG_PT = 70;
    const defaultFont = { name: "Tahoma", size: 14 };

    // Header row
    ws.columns = [
      { header: "#", key: "no", width: 5 },
      { header: "รูป", key: "image", width: 13 },
      { header: "ชื่อสินค้า", key: "name", width: 40 },
      { header: "SKU", key: "sku", width: 20 },
      { header: "Our Price (฿)", key: "our_price", width: 15 },
      { header: "Platform Price (฿)", key: "platform_price", width: 18 },
    ];

    // Style header
    const headerRow = ws.getRow(1);
    headerRow.font = { ...defaultFont, bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };
    headerRow.height = 28;

    // Fetch images in parallel
    const imageBuffers: (ArrayBuffer | null)[] = await Promise.all(
      calculated.map(async (p) => {
        if (!p.image_url) return null;
        try {
          const res = await fetch(p.image_url);
          if (!res.ok) return null;
          return await res.arrayBuffer();
        } catch {
          return null;
        }
      })
    );

    // Build data rows
    for (let i = 0; i < calculated.length; i++) {
      const p = calculated[i];
      const ourPrice = p.our_price_thb || p.suggested_price;
      const platPrice = p.platform_price_thb || 0;

      const dataRow = ws.addRow({
        no: i + 1,
        name: p.name,
        sku: p.sku,
        our_price: ourPrice,
        platform_price: platPrice,
      });

      dataRow.height = IMG_PT;
      dataRow.font = defaultFont;
      dataRow.alignment = { vertical: "middle", wrapText: true };
      dataRow.getCell("our_price").numFmt = "#,##0";
      dataRow.getCell("platform_price").numFmt = "#,##0";
      dataRow.getCell("our_price").alignment = { vertical: "middle", horizontal: "right" };
      dataRow.getCell("platform_price").alignment = { vertical: "middle", horizontal: "right" };

      // Zebra striping
      if (i % 2 === 1) {
        dataRow.eachCell((cell) => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
        });
      }

      // Add image — fixed square (1:1), positioned at cell B
      const buf = imageBuffers[i];
      if (buf) {
        const imgId = wb.addImage({ buffer: buf, extension: "jpeg" });
        const rowIdx = dataRow.number - 1; // 0-based for tl
        ws.addImage(imgId, {
          tl: { col: 1.05, row: rowIdx + 0.05 },
          ext: { width: IMG_PT, height: IMG_PT },
        });
      }
    }

    // Border for all cells
    ws.eachRow((row) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: "thin", color: { argb: "FFE2E8F0" } },
          bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
          left: { style: "thin", color: { argb: "FFE2E8F0" } },
          right: { style: "thin", color: { argb: "FFE2E8F0" } },
        };
      });
    });

    const buffer = await wb.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `${brand?.name || "products"}-ใบราคา.xlsx`);
  }, [calculated, brand]);

  const handleExport = useCallback(() => {
    if (calculated.length === 0) return;
    const data = calculated.map((p, i) => {
      const ourPrice = p.our_price_thb || p.suggested_price;
      const platPrice = p.platform_price_thb || 0;
      const row: Record<string, unknown> = {
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
        "Our Price (THB)": ourPrice,
        "Margin (THB)": p.margin_thb,
        "Margin (%)": p.margin_pct,
        "Platform Price (THB)": platPrice,
        "Platform Margin (%)": marginPct(platPrice, p.total_import_cost),
      };
      // Offline channels
      for (const ch of offlineChannels) {
        const cp = calculateChannelProfit(ourPrice, p.total_import_cost, ch);
        row[`${ch.name} Selling`] = cp.selling_price;
        row[`${ch.name} Profit`] = cp.our_profit_thb;
        row[`${ch.name} Profit%`] = cp.our_profit_pct;
      }
      // Online channels
      for (const ch of onlineChannels) {
        const cp = calculateChannelProfit(platPrice, p.total_import_cost, ch);
        row[`${ch.name} Selling`] = cp.selling_price;
        row[`${ch.name} Profit`] = cp.our_profit_thb;
        row[`${ch.name} Profit%`] = cp.our_profit_pct;
      }
      row["Notes"] = p.notes;
      return row;
    });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, brand?.name || "Products");
    XLSX.writeFile(wb, `${brand?.name || "products"}-prices.xlsx`);
  }, [calculated, brand, offlineChannels, onlineChannels]);

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
            <label className="cursor-pointer flex-shrink-0 relative group/logo">
              {brand.logo_url ? (
                <img src={brand.logo_url} alt={brand.name} className="w-9 h-9 rounded-lg object-cover border border-gray-200" />
              ) : (
                <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center text-amber-600 font-bold text-sm border border-amber-200">
                  {brand.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="absolute inset-0 rounded-lg bg-black/40 opacity-0 group-hover/logo:opacity-100 flex items-center justify-center transition-opacity">
                <ImageIcon className="w-4 h-4 text-white" />
              </div>
              <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f); e.target.value = ""; }} />
            </label>
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
                className="bg-white border-0 text-sm font-bold text-purple-700 focus:ring-0 cursor-pointer pr-6 rounded"
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
              onClick={handleExportPriceList}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-900 bg-amber-400 rounded-lg hover:bg-amber-500 transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4" />
              ใบราคา
            </button>
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
            {/* Offline Channels */}
            <div className="mt-4 border-t border-gray-200 pt-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-3">Offline Channels</h3>
              <div className="space-y-3">
                {offlineChannels.map((ch, idx) => (
                  <div key={idx} className="grid grid-cols-4 gap-3 items-center">
                    <div>
                      <label className="block text-xs text-gray-700 mb-1">Channel</label>
                      <input type="text" value={ch.name} onChange={(e) => updateOfflineChannel(idx, { name: e.target.value })} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm text-gray-900" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-700 mb-1">GP %</label>
                      <input type="number" value={ch.gp_pct} onChange={(e) => updateOfflineChannel(idx, { gp_pct: parseFloat(e.target.value) || 0 })} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm text-gray-900" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-700 mb-1">PC %</label>
                      <input type="number" value={ch.pc_pct} onChange={(e) => updateOfflineChannel(idx, { pc_pct: parseFloat(e.target.value) || 0 })} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm text-gray-900" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-700 mb-1">DC %</label>
                      <input type="number" value={ch.dc_pct} onChange={(e) => updateOfflineChannel(idx, { dc_pct: parseFloat(e.target.value) || 0 })} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm text-gray-900" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Online Channels */}
            <div className="mt-4 border-t border-gray-200 pt-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-3">Online Channels</h3>
              <div className="space-y-3">
                {onlineChannels.map((ch, idx) => (
                  <div key={idx} className="grid grid-cols-5 gap-3 items-center">
                    <div>
                      <label className="block text-xs text-gray-700 mb-1">Channel</label>
                      <input type="text" value={ch.name} onChange={(e) => updateOnlineChannel(idx, { name: e.target.value })} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm text-gray-900" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-700 mb-1">Commission %</label>
                      <input type="number" value={ch.commission_pct} onChange={(e) => updateOnlineChannel(idx, { commission_pct: parseFloat(e.target.value) || 0 })} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm text-gray-900" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-700 mb-1">Tx Fee %</label>
                      <input type="number" value={ch.transaction_fee_pct} onChange={(e) => updateOnlineChannel(idx, { transaction_fee_pct: parseFloat(e.target.value) || 0 })} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm text-gray-900" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-700 mb-1">Service Fee %</label>
                      <input type="number" value={ch.service_fee_pct} onChange={(e) => updateOnlineChannel(idx, { service_fee_pct: parseFloat(e.target.value) || 0 })} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm text-gray-900" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-700 mb-1">Shipping &#3647;</label>
                      <input type="number" value={ch.shipping_thb} onChange={(e) => updateOnlineChannel(idx, { shipping_thb: parseFloat(e.target.value) || 0 })} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm text-gray-900" />
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
            {/* Column toggle toolbar + Channel tab */}
            <div className="px-4 py-2 border-b border-gray-200 flex items-center gap-1 flex-wrap bg-gray-50">
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
              {/* Offline/Online channel tab */}
              <span className="mx-1 text-gray-300">|</span>
              <div className="flex bg-white rounded-md border border-gray-200 overflow-hidden">
                <button
                  onClick={() => setActiveTab("offline")}
                  className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                    activeTab === "offline"
                      ? "bg-gray-800 text-white"
                      : "text-gray-500 hover:bg-gray-100"
                  }`}
                >
                  Offline
                </button>
                <button
                  onClick={() => setActiveTab("online")}
                  className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                    activeTab === "online"
                      ? "bg-gray-800 text-white"
                      : "text-gray-500 hover:bg-gray-100"
                  }`}
                >
                  Online
                </button>
              </div>

              {/* Active/Inactive status tabs */}
              <span className="mx-1 text-gray-300">|</span>
              <div className="flex bg-white rounded-md border border-gray-200 overflow-hidden">
                <button
                  onClick={() => { setStatusTab("active"); setCurrentPage(1); }}
                  className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                    statusTab === "active"
                      ? "bg-green-600 text-white"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  Active ({activeCount})
                </button>
                <button
                  onClick={() => { setStatusTab("inactive"); setCurrentPage(1); }}
                  className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                    statusTab === "inactive"
                      ? "bg-gray-600 text-white"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  Inactive ({inactiveCount})
                </button>
                <button
                  onClick={() => { setStatusTab("all"); setCurrentPage(1); }}
                  className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                    statusTab === "all"
                      ? "bg-blue-600 text-white"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  All ({calculated.length})
                </button>
              </div>

              {/* Search + Category filter */}
              <span className="mx-1 text-gray-300">|</span>
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                  placeholder="ค้นหา ชื่อสินค้า / SKU..."
                  className="pl-2 pr-7 py-1 text-xs border border-gray-300 rounded-md text-gray-800 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400 w-56"
                />
                {searchQuery && (
                  <button
                    onClick={() => { setSearchQuery(""); setCurrentPage(1); }}
                    className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
                    aria-label="Clear search"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
              <select
                value={filterCategory}
                onChange={(e) => { setFilterCategory(e.target.value); setCurrentPage(1); }}
                className="px-2 py-1 text-xs border border-gray-300 rounded-md text-gray-800 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400 cursor-pointer"
              >
                <option value="">หมวดหมู่ทั้งหมด</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              {sortBy && (
                <button
                  onClick={() => setSortBy(null)}
                  className="px-2 py-1 text-xs rounded-md border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors flex items-center gap-1"
                  title="Clear sort"
                >
                  <X className="w-3 h-3" />
                  Sort: {sortBy.id} {sortBy.dir === "asc" ? "↑" : "↓"}
                </button>
              )}
            </div>

            <div className="overflow-auto" style={{ maxHeight: "calc(100vh - 220px)" }}>
              <style>{`.excel-grid th, .excel-grid td { outline: 1px solid #d1d5db; outline-offset: -0.5px; }
.excel-grid thead tr:first-child th { position: sticky; top: 0; z-index: 5; outline-color: #e08a00; }
.excel-grid thead tr:nth-child(2) th { position: sticky; z-index: 5; }
.excel-grid thead tr:first-child th.frozen,
.excel-grid thead tr:nth-child(2) th.frozen { z-index: 30; }
.excel-grid tbody td { padding-top: 4px; padding-bottom: 4px; }
.row-highlight td { background-color: #1e293b !important; }
.row-highlight td, .row-highlight td * { color: #f1f5f9 !important; }
.row-highlight td span[class*="bg-"], .row-highlight td div[class*="bg-"] { background-color: rgba(255,255,255,0.1) !important; }
.row-highlight td input::placeholder, .row-highlight td textarea::placeholder { color: #64748b !important; }
.frozen { position: sticky; left: 0; z-index: 10; outline: none; border: 1px solid #d1d5db; }
.frozen-last { box-shadow: 3px 0 6px rgba(0,0,0,0.1); clip-path: inset(0 -8px 0 0); }`}</style>
              <table className="border-separate excel-grid" style={{ borderSpacing: 0, fontSize: "14px" }}>
                <thead>
                  {/* Group header row */}
                  <tr ref={groupRowRef} className="text-white text-sm" style={{ backgroundColor: "#f9a11b" }}>
                    <th className="px-2 py-1.5 frozen frozen-last" style={{ left: 0, minWidth: 280, backgroundColor: "#f9a11b" }}>Product</th>
                    {visibleGroups.sku && <th className="px-2 py-1.5" style={{ backgroundColor: "#f9a11b" }}>SKU</th>}
                    {visibleGroups.category && <th className="px-2 py-1.5" style={{ backgroundColor: "#f9a11b" }}>Cat</th>}
                    {visibleGroups.cost && <th className="px-2 py-1.5 text-center" style={{ backgroundColor: "#f9a11b" }} colSpan={7 - (hasData.fob_usd ? 0 : 1) - (hasData.fob_eur ? 0 : 1)}>Cost</th>}
                    {visibleGroups.srp && <th className="px-2 py-1.5 text-center" style={{ backgroundColor: "#f9a11b" }} colSpan={3 - (hasData.srp_usd ? 0 : 1) - (hasData.srp_eur ? 0 : 1)}>SRP</th>}
                    {visibleGroups.pricing && <th className="px-2 py-1.5 text-center bg-green-800" colSpan={5}>Pricing</th>}
                    {channels.map((ch, ci) => (
                      visibleGroups[ch.name] ? (
                        <th key={ch.name} className={`px-2 py-1.5 text-center ${chGroupBg(ci)}`} colSpan={4}>{ch.name}</th>
                      ) : null
                    ))}
                    <th className="px-2 py-1.5 w-8" style={{ backgroundColor: "#f9a11b" }} colSpan={2}></th>
                  </tr>
                  {/* Column header row */}
                  <tr className="bg-gray-100 text-gray-700 font-semibold" style={{ top: groupRowH }}>
                    <th className="p-0 bg-gray-100 frozen frozen-last" style={{ left: 0, minWidth: 280 }} data-group="product">
                      <div className="flex items-center h-full">
                        <div className="w-[28px] flex-shrink-0 flex items-center justify-center border-r border-gray-300">
                          <Checkbox
                            checked={paginatedProducts.length > 0 && paginatedProducts.every(p => selectedRows.has(p.id))}
                            indeterminate={paginatedProducts.some(p => selectedRows.has(p.id)) && !paginatedProducts.every(p => selectedRows.has(p.id))}
                            onChange={(c) => {
                              if (c) setSelectedRows(new Set(paginatedProducts.map(p => p.id)));
                              else setSelectedRows(new Set());
                            }}
                          />
                        </div>
                        <div className="w-[32px] flex-shrink-0 text-center border-r border-gray-300">#</div>
                        <div className="w-[50px] flex-shrink-0 text-center border-r border-gray-300">Img</div>
                        <div className="flex-1 px-1.5 text-left whitespace-nowrap cursor-pointer hover:bg-gray-200 select-none" onClick={() => handleSort("name")}>
                          Product<SortIcon id="name" />
                        </div>
                      </div>
                    </th>
                    {visibleGroups.sku && (
                      <th className="px-1.5 py-1.5 text-left bg-gray-100 whitespace-nowrap cursor-pointer hover:bg-gray-200 select-none" data-group="product" onClick={() => handleSort("sku")}>
                        SKU<SortIcon id="sku" />
                      </th>
                    )}

                    {visibleGroups.category && (
                      <th className="px-1.5 py-1.5 text-left bg-white whitespace-nowrap cursor-pointer hover:bg-gray-100 select-none" data-group="category" onClick={() => handleSort("category")}>
                        Cat<SortIcon id="category" />
                      </th>
                    )}

                    {visibleGroups.cost && (
                      <>
                        {hasData.fob_usd && (
                          <th className="px-1.5 py-1.5 text-right bg-sky-50 whitespace-nowrap cursor-pointer hover:bg-sky-100 select-none" data-group="cost" onClick={() => handleSort("fob_usd")}>
                            <BulkEditBtn onClick={() => { setBulkEdit({ field: "fob_usd", label: "FOB USD", type: "number" }); setBulkValue(""); }} />
                            FOB $<SortIcon id="fob_usd" />
                          </th>
                        )}
                        {hasData.fob_eur && (
                          <th className="px-1.5 py-1.5 text-right bg-sky-50 whitespace-nowrap cursor-pointer hover:bg-sky-100 select-none" data-group="cost" onClick={() => handleSort("fob_eur")}>
                            <BulkEditBtn onClick={() => { setBulkEdit({ field: "fob_eur", label: "FOB EUR", type: "number" }); setBulkValue(""); }} />
                            FOB &euro;<SortIcon id="fob_eur" />
                          </th>
                        )}
                        <th className="px-1.5 py-1.5 text-right bg-sky-50 whitespace-nowrap cursor-pointer hover:bg-sky-100 select-none" data-group="cost" onClick={() => handleSort("fob_thb")}>
                          FOB &#3647;<SortIcon id="fob_thb" />
                        </th>
                        <th className="px-1.5 py-1.5 text-right bg-sky-50 whitespace-nowrap cursor-pointer hover:bg-sky-100 select-none" data-group="cost" onClick={() => handleSort("freight_do")}>
                          <BulkEditBtn onClick={() => { setBulkEdit({ field: "freight_do", label: "Freight+D/O", type: "number" }); setBulkValue(""); }} />
                          Freight+D/O<SortIcon id="freight_do" />
                        </th>
                        <th className="px-1.5 py-1.5 text-right bg-sky-50 whitespace-nowrap cursor-pointer hover:bg-sky-100 select-none" data-group="cost" onClick={() => handleSort("import_tax_pct")}>
                          <BulkEditBtn onClick={() => { setBulkEdit({ field: "import_tax_pct", label: "Import Tax %", type: "number" }); setBulkValue(""); }} />
                          Tax %<SortIcon id="import_tax_pct" />
                        </th>
                        <th className="px-1.5 py-1.5 text-right bg-sky-50 whitespace-nowrap cursor-pointer hover:bg-sky-100 select-none" data-group="cost" onClick={() => handleSort("shipping_cost")}>
                          <BulkEditBtn onClick={() => { setBulkEdit({ field: "shipping_cost", label: "Shipping Cost", type: "number" }); setBulkValue(""); }} />
                          Shipping<SortIcon id="shipping_cost" />
                        </th>
                        <th className="px-1.5 py-1.5 text-right bg-sky-100 font-bold whitespace-nowrap cursor-pointer hover:bg-sky-200 select-none" data-group="cost" onClick={() => handleSort("total_import_cost")}>
                          Total Cost<SortIcon id="total_import_cost" />
                        </th>
                      </>
                    )}

                    {visibleGroups.srp && (
                      <>
                        {hasData.srp_usd && (
                          <th className="px-1.5 py-1.5 text-right bg-violet-50 whitespace-nowrap cursor-pointer hover:bg-violet-100 select-none" data-group="srp" onClick={() => handleSort("srp_usd")}>
                            <BulkEditBtn onClick={() => { setBulkEdit({ field: "srp_usd", label: "SRP USD", type: "number" }); setBulkValue(""); }} />
                            SRP $<SortIcon id="srp_usd" />
                          </th>
                        )}
                        {hasData.srp_eur && (
                          <th className="px-1.5 py-1.5 text-right bg-violet-50 whitespace-nowrap cursor-pointer hover:bg-violet-100 select-none" data-group="srp" onClick={() => handleSort("srp_eur")}>
                            <BulkEditBtn onClick={() => { setBulkEdit({ field: "srp_eur", label: "SRP EUR", type: "number" }); setBulkValue(""); }} />
                            SRP &euro;<SortIcon id="srp_eur" />
                          </th>
                        )}
                        <th className="px-1.5 py-1.5 text-right bg-violet-50 whitespace-nowrap cursor-pointer hover:bg-violet-100 select-none" data-group="srp" onClick={() => handleSort("srp_thb")}>
                          SRP &#3647;<SortIcon id="srp_thb" />
                        </th>
                      </>
                    )}

                    {visibleGroups.pricing && (
                      <>
                        <th className="px-1.5 py-1.5 text-right bg-green-50 whitespace-nowrap cursor-pointer hover:bg-green-100 select-none" data-group="pricing" onClick={() => handleSort("suggested")}>
                          Suggested<SortIcon id="suggested" />
                        </th>
                        <th className="px-1.5 py-1.5 text-right bg-emerald-200 font-bold text-emerald-900 whitespace-nowrap cursor-pointer hover:bg-emerald-300 select-none" data-group="pricing" onClick={() => handleSort("our_price")}>
                          <BulkEditBtn onClick={() => { setBulkEdit({ field: "our_price_thb", label: "Our Price (THB)", type: "number" }); setBulkValue(""); }} />
                          Our Price<SortIcon id="our_price" />
                        </th>
                        <th className="px-1.5 py-1.5 text-right bg-green-50 whitespace-nowrap cursor-pointer hover:bg-green-100 select-none" data-group="pricing" onClick={() => handleSort("margin_our")}>
                          Margin<SortIcon id="margin_our" />
                        </th>
                        <th className="px-1.5 py-1.5 text-right bg-orange-200 font-bold text-orange-900 whitespace-nowrap" data-group="pricing">
                          <div className="flex items-center justify-end gap-1">
                            <span className="cursor-pointer hover:underline select-none" onClick={() => handleSort("platform_price")}>
                              Platform<SortIcon id="platform_price" />
                            </span>
                            <input
                              type="number"
                              value={platformMarkupInput}
                              onChange={(e) => setPlatformMarkupInput(e.target.value)}
                              onBlur={() => {
                                const v = parseFloat(platformMarkupInput);
                                if (!isNaN(v) && v !== (brand?.platform_markup_pct ?? 0)) {
                                  handlePlatformMarkupApply(v);
                                }
                              }}
                              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                              placeholder="0"
                              className="w-12 px-1 py-0.5 border border-orange-400 rounded text-right bg-white text-orange-900 font-semibold focus:outline-none focus:ring-1 focus:ring-orange-500"
                            />
                            <span>%</span>
                          </div>
                        </th>
                        <th className="px-1.5 py-1.5 text-right bg-orange-50 whitespace-nowrap cursor-pointer hover:bg-orange-100 select-none" data-group="pricing" onClick={() => handleSort("margin_platform")}>
                          Margin<SortIcon id="margin_platform" />
                        </th>
                      </>
                    )}

                    {channels.map((ch, ci) => (
                      visibleGroups[ch.name] ? (
                        <React.Fragment key={ch.name}>
                          <th className={`px-1 py-1 text-center whitespace-nowrap ${chHeaderBg(ci)}`} data-group={ch.name}>
                              <select
                                value={ch.promo_pct}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value);
                                  if (activeTab === "offline") updateOfflineChannel(ci, { promo_pct: val });
                                  else updateOnlineChannel(ci, { promo_pct: val });
                                }}
                                className="bg-white border border-gray-300 rounded px-1 py-0.5 text-xs text-gray-800 cursor-pointer"
                              >
                                {PROMO_OPTIONS.map(v => (
                                  <option key={v} value={v}>{v}%</option>
                                ))}
                              </select>
                          </th>
                          <th className={`px-1.5 py-1.5 text-right whitespace-nowrap ${chHeaderBg(ci)}`} data-group={ch.name}>
                            {ch.type === "offline" ? `GP ${ch.gp_pct + ch.pc_pct + ch.dc_pct}%` : `Fee ${ch.commission_pct + ch.transaction_fee_pct + ch.service_fee_pct}%`}
                          </th>
                          <th className={`px-1.5 py-1.5 text-right whitespace-nowrap ${chHeaderBg(ci)}`} data-group={ch.name}>Profit&#3647;</th>
                          <th className={`px-1.5 py-1.5 text-right whitespace-nowrap ${chHeaderBg(ci)}`} data-group={ch.name}>Profit%</th>
                        </React.Fragment>
                      ) : null
                    ))}
                    <th className="px-1.5 py-1.5 text-left whitespace-nowrap bg-white cursor-pointer hover:bg-gray-100 select-none" onClick={() => handleSort("last_edited")}>
                      Last Edit<SortIcon id="last_edited" />
                    </th>
                    <th className="px-1 py-1.5 w-8 bg-white"></th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedProducts.map((p, i) => {
                    const ourPrice = p.our_price_thb || p.suggested_price;
                    const margin = marginPct(ourPrice, p.total_import_cost);
                    const platPrice = p.platform_price_thb || 0;
                    const platMargin = marginPct(platPrice, p.total_import_cost);
                    const rowNum = (safePage - 1) * perPage + i + 1;
                    const isSelected = selectedRows.has(p.id);

                    return (
                      <tr
                        key={p.id}
                        className={`group cursor-pointer ${isSelected ? "row-highlight" : ""} ${p.is_active === false ? "opacity-50" : ""}`}
                        onClick={(e) => {
                          const tag = (e.target as HTMLElement).tagName;
                          const isEditable = (e.target as HTMLElement).closest("input, select, textarea, button, a, [contenteditable], [data-no-row-select]");
                          if (isEditable || tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || tag === "BUTTON") return;
                          setSelectedRows(prev => {
                            const next = new Set(prev);
                            if (next.has(p.id)) next.delete(p.id); else next.add(p.id);
                            return next;
                          });
                        }}
                      >
                        {/* Product column (frozen) */}
                        <td className="p-0 bg-white frozen frozen-last" style={{ left: 0, minWidth: 280 }} data-group="product">
                          <div className="flex items-stretch">
                            <div className="w-[28px] flex-shrink-0 flex items-center justify-center border-r border-gray-300">
                              <Checkbox
                                checked={isSelected}
                                dark={isSelected}
                                onChange={(c) => {
                                  setSelectedRows(prev => {
                                    const next = new Set(prev);
                                    if (c) next.add(p.id); else next.delete(p.id);
                                    return next;
                                  });
                                }}
                              />
                            </div>
                            <div className="w-[32px] flex-shrink-0 text-center text-gray-500 border-r border-gray-300">{rowNum}</div>
                            <div className="w-[50px] flex-shrink-0 flex items-center justify-center border-r border-gray-300" data-no-row-select>
                              {p.image_url ? (
                                <button type="button" onClick={() => setLightboxId(p.id)}>
                                  <img
                                    src={p.image_url}
                                    alt={p.name}
                                    className="w-[42px] h-[42px] object-contain rounded hover:opacity-80 transition-opacity cursor-pointer"
                                  />
                                </button>
                              ) : (
                                <label className="cursor-pointer">
                                  <ImageIcon className="w-5 h-5 text-gray-300 hover:text-blue-400 transition-colors" />
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => {
                                      const f = e.target.files?.[0];
                                      if (f) handleImageUpload(p.id, f);
                                      e.target.value = "";
                                    }}
                                  />
                                </label>
                              )}
                            </div>
                            <div className="flex-1 px-1 overflow-hidden">
                              <textarea
                                value={p.name}
                                rows={2}
                                onChange={(e) => handleProductUpdate(p.id, "name", e.target.value)}
                                className="w-full bg-transparent border-0 p-0 font-semibold text-gray-900 focus:ring-0 focus:outline-none focus:bg-blue-50 resize-none leading-tight"
                              />
                            </div>
                          </div>
                        </td>
                        {visibleGroups.sku && (
                        <td className="px-1 py-0.5 bg-white min-w-[140px]" data-group="product">
                          <input
                            type="text"
                            value={p.sku}
                            onChange={(e) =>
                              handleProductUpdate(p.id, "sku", e.target.value)
                            }
                            className="w-full bg-transparent border-0 p-0 text-gray-700 focus:ring-0 focus:outline-none focus:bg-blue-50"
                          />
                        </td>
                        )}

                        {/* Scrollable columns */}
                        {visibleGroups.category && (
                          <td className="px-1 py-0.5 bg-white min-w-[200px] w-[200px] max-w-[200px] relative" data-group="category">
                            <CategoryCell
                              value={p.category}
                              categories={categories}
                              onChange={(val) => handleProductUpdate(p.id, "category", val)}
                              onDeleteCategory={handleDeleteCategory}
                            />
                          </td>
                        )}

                        {visibleGroups.cost && (
                          <>
                            {hasData.fob_usd && (
                            <td className="px-1 py-0.5 text-right bg-sky-50" data-group="cost">
                              <NumInput value={p.fob_usd || ""} step="0.01" decimals={2} placeholder="-" onChange={(v) => handleProductUpdate(p.id, "fob_usd", v)} className="w-full bg-transparent border-0 p-0 text-right font-medium text-gray-800 focus:ring-0 focus:outline-none focus:bg-blue-50" />
                            </td>
                            )}
                            {hasData.fob_eur && (
                            <td className="px-1 py-0.5 text-right bg-sky-50" data-group="cost">
                              <NumInput value={p.fob_eur || ""} step="0.01" decimals={2} placeholder="-" onChange={(v) => handleProductUpdate(p.id, "fob_eur", v)} className="w-full bg-transparent border-0 p-0 text-right font-medium text-gray-800 focus:ring-0 focus:outline-none focus:bg-blue-50" />
                            </td>
                            )}
                            <td className="px-1 py-0.5 text-right text-gray-900 font-semibold whitespace-nowrap bg-sky-50" data-group="cost">
                              {fmt(p.fob_thb)}
                            </td>
                            <td className="px-1 py-0.5 text-right bg-sky-50" data-group="cost">
                              <NumInput value={p.freight_do || ""} placeholder="-" onChange={(v) => handleProductUpdate(p.id, "freight_do", v)} className="w-full bg-transparent border-0 p-0 text-right text-gray-700 focus:ring-0 focus:outline-none focus:bg-blue-50" />
                            </td>
                            <td className="px-1 py-0.5 text-right bg-sky-50" data-group="cost">
                              <NumInput value={p.import_tax_pct || ""} placeholder="5" onChange={(v) => handleProductUpdate(p.id, "import_tax_pct", v)} className="w-full bg-transparent border-0 p-0 text-right text-gray-700 focus:ring-0 focus:outline-none focus:bg-blue-50" />
                            </td>
                            <td className="px-1 py-0.5 text-right bg-sky-50" data-group="cost">
                              <NumInput value={p.shipping_cost || ""} placeholder="-" onChange={(v) => handleProductUpdate(p.id, "shipping_cost", v)} className="w-full bg-transparent border-0 p-0 text-right text-gray-700 focus:ring-0 focus:outline-none focus:bg-blue-50" />
                            </td>
                            <td className="px-1 py-0.5 text-right font-bold text-gray-900 whitespace-nowrap bg-sky-100" data-group="cost">
                              {fmt(p.total_import_cost)}
                            </td>
                          </>
                        )}

                        {visibleGroups.srp && (
                          <>
                            {hasData.srp_usd && (
                            <td className="px-1 py-0.5 text-right bg-violet-50" data-group="srp">
                              <NumInput value={p.srp_usd || ""} step="0.01" placeholder="-" onChange={(v) => handleProductUpdate(p.id, "srp_usd", v)} className="w-full bg-transparent border-0 p-0 text-right font-medium text-gray-800 focus:ring-0 focus:outline-none focus:bg-blue-50" />
                            </td>
                            )}
                            {hasData.srp_eur && (
                            <td className="px-1 py-0.5 text-right bg-violet-50" data-group="srp">
                              <NumInput value={p.srp_eur || ""} step="0.01" placeholder="-" onChange={(v) => handleProductUpdate(p.id, "srp_eur", v)} className="w-full bg-transparent border-0 p-0 text-right font-medium text-gray-800 focus:ring-0 focus:outline-none focus:bg-blue-50" />
                            </td>
                            )}
                            <td className="px-1 py-0.5 text-right text-gray-900 font-semibold whitespace-nowrap bg-violet-50" data-group="srp">
                              {p.srp_thb > 0 ? fmt(p.srp_thb) : "-"}
                            </td>
                          </>
                        )}

                        {/* Pricing: Suggested + Our Price + Platform Price + Margin */}
                        {visibleGroups.pricing && (
                          <>
                            <td className="px-1 py-0.5 text-right bg-green-50 whitespace-nowrap" data-group="pricing">
                              <div className="text-[11px] text-gray-400 leading-none">{fmt(p.raw_price)}</div>
                              <button
                                onClick={() =>
                                  handleApplySuggested(p.id, p.suggested_price)
                                }
                                className="text-gray-700 hover:text-green-700 hover:underline transition-colors font-medium"
                                title="Click to apply"
                              >
                                {fmt(p.suggested_price)}
                              </button>
                            </td>
                            <td className="px-1 py-0.5 bg-green-800" data-group="pricing">
                              <NumInput value={p.our_price_thb || ""} placeholder={fmt(p.suggested_price)} onChange={(v) => handleProductUpdate(p.id, "our_price_thb", v)} className="w-full bg-transparent border-0 p-0 text-right font-bold text-white focus:ring-0 focus:outline-none focus:bg-green-700 placeholder:text-green-300" />
                            </td>
                            <td className="px-1 py-0.5 text-right bg-green-50" data-group="pricing">
                              <span className={`inline-block px-1 py-0 rounded text-xs font-semibold ${profitColor(margin)}`}>
                                {fmtDec(margin)}%
                              </span>
                            </td>
                            <td className="px-1 py-0.5 bg-orange-600" data-group="pricing">
                              <NumInput value={p.platform_price_thb || ""} placeholder="-" onChange={(v) => handleProductUpdate(p.id, "platform_price_thb", v)} className="w-full bg-transparent border-0 p-0 text-right font-bold text-white focus:ring-0 focus:outline-none focus:bg-orange-700 placeholder:text-orange-300" />
                            </td>
                            <td className="px-1 py-0.5 text-right bg-orange-50" data-group="pricing">
                              <span className={`inline-block px-1 py-0 rounded text-xs font-semibold ${profitColor(platMargin)}`}>
                                {platPrice > 0 ? `${fmtDec(platMargin)}%` : "-"}
                              </span>
                            </td>
                          </>
                        )}

                        {/* Sales Channel columns */}
                        {channels.map((ch, ci) => {
                          if (!visibleGroups[ch.name]) return null;
                          const channelPrice = ch.type === "online" ? (p.platform_price_thb || 0) : ourPrice;
                          const cp = calculateChannelProfit(channelPrice, p.total_import_cost, ch);
                          return (
                            <React.Fragment key={ch.name}>
                              <td className={`px-1 py-0.5 text-right whitespace-nowrap ${chBg(ci)}`} data-group={ch.name}>
                                <div className="font-medium text-gray-900">{fmt(cp.selling_price)}</div>
                                {ch.promo_pct > 0 && (
                                  <div className="text-[11px] text-red-500 leading-none">-{ch.promo_pct}%</div>
                                )}
                              </td>
                              <td className={`px-1 py-0.5 text-right whitespace-nowrap text-gray-700 ${chBg(ci)}`} data-group={ch.name}>
                                {fmt(cp.fees_thb)}
                              </td>
                              <td className={`px-1 py-0.5 text-right whitespace-nowrap font-semibold text-gray-900 ${chBg(ci)}`} data-group={ch.name}>
                                {fmt(cp.our_profit_thb)}
                              </td>
                              <td className={`px-1 py-0.5 text-right ${chBg(ci)}`} data-group={ch.name}>
                                <span className={`inline-block px-1 py-0 rounded text-xs font-semibold ${profitColor(cp.our_profit_pct)}`}>
                                  {fmtDec(cp.our_profit_pct)}%
                                </span>
                              </td>
                            </React.Fragment>
                          );
                        })}

                        <td className="px-1 py-0.5 bg-white text-[11px] text-gray-400 min-w-[120px]">
                          {p.last_edited_by && (
                            <div>
                              <div className="truncate">{p.last_edited_by.split("@")[0]}</div>
                              {p.last_edited_at && (
                                <div className="text-[10px] text-gray-300">
                                  {new Date(p.last_edited_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-1 py-0.5 bg-white">
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleProductUpdate(p.id, "is_active", p.is_active === false)}
                              className={`transition-colors ${p.is_active === false ? "text-gray-300 hover:text-green-500" : "text-green-500 hover:text-gray-400"}`}
                              title={p.is_active === false ? "เปิดใช้งานสินค้า" : "ปิดใช้งานสินค้า"}
                            >
                              <Power className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteProduct(p.id)}
                              className="text-gray-300 hover:text-red-500 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="px-4 py-2.5 border-t text-white flex items-center justify-between text-[13px]" style={{ backgroundColor: "#f9a11b", borderColor: "#e08a00" }}>
              <div className="flex items-center gap-3">
                <span className="text-white/80">
                  {sortedCalculated.length === calculated.length
                    ? `${calculated.length} records`
                    : `${sortedCalculated.length} of ${calculated.length} records`}
                </span>
                {selectedRows.size > 0 && (
                  <>
                    <span className="text-white font-bold">{selectedRows.size} selected</span>
                    <button
                      onClick={async () => {
                        const ids = [...selectedRows];
                        const editedBy = user?.email || "";
                        const editedAt = new Date().toISOString();
                        setProducts(prev => prev.map(p => ids.includes(p.id) ? { ...p, is_active: true, last_edited_by: editedBy, last_edited_at: editedAt } : p));
                        await supabase.from("products").update({ is_active: true, last_edited_by: editedBy, last_edited_at: editedAt }).in("id", ids);
                      }}
                      className="px-2.5 py-1 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-full transition-colors flex items-center gap-1"
                    >
                      <Power className="w-3 h-3" />
                      Active
                    </button>
                    <button
                      onClick={async () => {
                        const ids = [...selectedRows];
                        const editedBy = user?.email || "";
                        const editedAt = new Date().toISOString();
                        setProducts(prev => prev.map(p => ids.includes(p.id) ? { ...p, is_active: false, last_edited_by: editedBy, last_edited_at: editedAt } : p));
                        await supabase.from("products").update({ is_active: false, last_edited_by: editedBy, last_edited_at: editedAt }).in("id", ids);
                      }}
                      className="px-2.5 py-1 bg-gray-600 hover:bg-gray-700 text-white text-xs font-medium rounded-full transition-colors flex items-center gap-1"
                    >
                      <Power className="w-3 h-3" />
                      Inactive
                    </button>
                    <button
                      onClick={async () => {
                        if (!confirm(`ลบสินค้าที่เลือก ${selectedRows.size} รายการ?`)) return;
                        const ids = [...selectedRows];
                        await supabase.from("products").delete().in("id", ids);
                        setProducts(prev => prev.filter(p => !selectedRows.has(p.id)));
                        setSelectedRows(new Set());
                      }}
                      className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-full transition-colors flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" />
                      ลบที่เลือก
                    </button>
                  </>
                )}
                <div className="flex items-center gap-1.5 text-white/80">
                  <span>Rows</span>
                  <div className="flex rounded-full border border-white/30 overflow-hidden">
                    {PER_PAGE_OPTIONS.map(n => (
                      <button
                        key={n}
                        onClick={() => { setPerPage(n); setCurrentPage(1); }}
                        className={`px-2.5 py-1 min-w-[36px] transition-colors ${
                          perPage === n
                            ? "bg-white text-amber-700 font-medium"
                            : "text-white hover:bg-white/20"
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 rounded-full border border-white/30 px-1 py-0.5">
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={safePage <= 1}
                  className={PAG_BTN}
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none"><path d="M11 3L6 8l5 5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M6 3L6 13" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
                </button>
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                  className={PAG_BTN}
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
                <span className="px-2.5 py-0.5 bg-white text-amber-700 font-medium rounded-full tabular-nums min-w-[60px] text-center">
                  {safePage} / {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                  className={PAG_BTN}
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none"><path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
                <button
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={safePage >= totalPages}
                  className={PAG_BTN}
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none"><path d="M5 3l5 5-5 5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M10 3v10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Bulk Edit Modal */}
      {bulkEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setBulkEdit(null)}>
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Bulk Edit: {bulkEdit.label}</h3>
            <p className="text-sm text-gray-500 mb-4">Apply to all {products.length} products</p>
            <input
              autoFocus
              type={bulkEdit.type}
              value={bulkValue}
              onChange={(e) => setBulkValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleBulkApply(); if (e.key === "Escape") setBulkEdit(null); }}
              placeholder={`Enter ${bulkEdit.label}...`}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none mb-4"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setBulkEdit(null)}
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkApply}
                disabled={bulkValue === ""}
                className="px-4 py-2 text-sm font-medium text-gray-900 bg-amber-400 rounded-lg hover:bg-amber-500 disabled:opacity-50 transition-colors"
              >
                Apply to All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image lightbox */}
      {lightboxId && (() => {
        const lp = products.find((p) => p.id === lightboxId);
        if (!lp || !lp.image_url) return null;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setLightboxId(null)}>
            <div className="bg-white rounded-xl shadow-xl p-4 w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-gray-900 truncate pr-2">{lp.name}</p>
                <button
                  onClick={() => setLightboxId(null)}
                  className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <img
                src={lp.image_url}
                alt={lp.name}
                className="w-full max-h-[60vh] object-contain rounded-lg bg-gray-50"
              />
              <div className="flex justify-center gap-2 mt-3">
                <Tooltip content="Change picture">
                  <label className="p-2.5 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg cursor-pointer transition-colors block">
                    <Pencil className="w-5 h-5" />
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleImageUpload(lp.id, f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </Tooltip>
                <Tooltip content="Delete picture">
                  <button
                    onClick={() => handleImageDelete(lp.id)}
                    className="p-2.5 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </Tooltip>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}
