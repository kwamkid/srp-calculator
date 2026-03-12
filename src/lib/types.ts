export interface Brand {
  id: string;
  name: string;
  user_id: string;
  usd_to_thb: number;
  eur_to_thb: number;
  vat: number;
  default_multiplier: number;
  created_at: string;
}

export interface Product {
  id: string;
  brand_id: string;
  name: string;
  category: string;
  sku: string;
  image_url: string;
  fob_usd: number;
  fob_eur: number;
  freight_do: number;
  import_tax_pct: number;
  shipping_cost: number;
  srp_usd: number;
  srp_eur: number;
  multiplier: number;
  our_price_thb: number;
  notes: string;
  sort_order: number;
  created_at: string;
  last_edited_by: string;
  last_edited_at: string;
}

export interface Invite {
  id: string;
  token: string;
  created_by: string;
  used_by: string | null;
  used_at: string | null;
  expires_at: string;
  created_at: string;
  brand_id: string | null;
  brand_ids: string[];
  role: "viewer" | "editor" | null;
}

export interface TeamMember {
  id: string;
  owner_id: string;
  member_user_id: string;
  member_email: string;
  invited_via: string | null;
  created_at: string;
}

export interface BrandMember {
  id: string;
  brand_id: string;
  user_id: string;
  role: "viewer" | "editor";
  granted_by: string;
  created_at: string;
}

export interface CalculatedProduct extends Product {
  fob_thb: number;
  total_import_cost: number;
  srp_thb: number;
  raw_price: number;
  suggested_price: number;
  margin_pct: number;
  margin_thb: number;
}

export interface SalesChannel {
  name: string;
  gp_pct: number;
  pc_pct: number;
  dc_pct: number;
  promo_pct: number;
}

export interface ChannelProfit {
  channel_name: string;
  selling_price: number;
  total_gp_pct: number;
  store_profit_thb: number;
  our_profit_thb: number;
  our_profit_pct: number;
}

export interface LoginHistory {
  id: string;
  user_id: string;
  email: string;
  login_at: string;
  ip_address: string;
  user_agent: string;
}

export const DEFAULT_CHANNELS: SalesChannel[] = [
  { name: "Retail", gp_pct: 30, pc_pct: 0, dc_pct: 0, promo_pct: 10 },
  { name: "Central", gp_pct: 37, pc_pct: 7, dc_pct: 2, promo_pct: 0 },
  { name: "The Mall", gp_pct: 35, pc_pct: 7, dc_pct: 0, promo_pct: 0 },
];
