-- Migration: Brand Channels + Platform Price
-- Run this in Supabase SQL Editor

-- 1. Brand channels table (per-brand channel settings)
create table if not exists brand_channels (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade not null,
  type text not null check (type in ('offline', 'online')),
  name text not null,
  sort_order int default 0,
  -- Offline fields
  gp_pct numeric default 0,
  pc_pct numeric default 0,
  dc_pct numeric default 0,
  -- Online fields
  commission_pct numeric default 0,
  transaction_fee_pct numeric default 0,
  service_fee_pct numeric default 0,
  shipping_thb numeric default 0,
  -- Shared
  promo_pct numeric default 0,
  created_at timestamptz default now(),
  unique(brand_id, name)
);

-- 2. Enable RLS
alter table brand_channels enable row level security;

-- 3. RLS policies (use has_brand_access function from existing migration)
create policy "Users can view brand channels" on brand_channels
  for select using (has_brand_access(brand_id));
create policy "Users can insert brand channels" on brand_channels
  for insert with check (can_edit_brand(brand_id));
create policy "Users can update brand channels" on brand_channels
  for update using (can_edit_brand(brand_id));
create policy "Users can delete brand channels" on brand_channels
  for delete using (can_edit_brand(brand_id));

-- 4. Add platform_price_thb to products
alter table products add column if not exists platform_price_thb numeric default 0;
