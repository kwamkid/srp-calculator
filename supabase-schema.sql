-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor > New Query)

-- Brands table
create table if not exists brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  user_id uuid references auth.users(id) not null,
  usd_to_thb numeric default 37,
  eur_to_thb numeric default 39,
  vat numeric default 7,
  default_multiplier numeric default 3,
  created_at timestamptz default now()
);

-- Products table
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade not null,
  name text not null,
  category text default '',
  sku text default '',
  image_url text default '',
  fob_usd numeric default 0,
  fob_eur numeric default 0,
  freight numeric default 0,
  do_fee numeric default 0,
  import_tax_pct numeric default 5,
  srp_usd numeric default 0,
  srp_eur numeric default 0,
  multiplier numeric default 3,
  our_price_thb numeric default 0,
  notes text default '',
  sort_order int default 0,
  created_at timestamptz default now()
);

-- Brand members table (invite system)
create table if not exists brand_members (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade,
  email text not null,
  role text default 'editor',
  invited_by uuid references auth.users(id),
  accepted boolean default false,
  created_at timestamptz default now(),
  unique(brand_id, email)
);

-- Add last_edited_by to products
alter table products add column if not exists last_edited_by text default '';
alter table products add column if not exists last_edited_at timestamptz;

-- Enable RLS
alter table brands enable row level security;
alter table products enable row level security;
alter table brand_members enable row level security;

-- Helper: check if user is owner or accepted member of a brand
create or replace function is_brand_member(b_id uuid) returns boolean as $$
  select exists(
    select 1 from brands where id = b_id and user_id = auth.uid()
  ) or exists(
    select 1 from brand_members
    where brand_id = b_id and user_id = auth.uid() and accepted = true
  );
$$ language sql security definer;

-- Brands policies (owner or accepted member can view)
create policy "Users can view own brands" on brands
  for select using (auth.uid() = user_id or id in (
    select brand_id from brand_members where user_id = auth.uid() and accepted = true
  ));
create policy "Users can insert own brands" on brands
  for insert with check (auth.uid() = user_id);
create policy "Users can update own brands" on brands
  for update using (auth.uid() = user_id or id in (
    select brand_id from brand_members where user_id = auth.uid() and accepted = true
  ));
create policy "Users can delete own brands" on brands
  for delete using (auth.uid() = user_id);

-- Products policies (owner or accepted member)
create policy "Users can view own products" on products
  for select using (is_brand_member(brand_id));
create policy "Users can insert own products" on products
  for insert with check (is_brand_member(brand_id));
create policy "Users can update own products" on products
  for update using (is_brand_member(brand_id));
create policy "Users can delete own products" on products
  for delete using (is_brand_member(brand_id));

-- Brand members policies
create policy "Brand owners and members can view members" on brand_members
  for select using (is_brand_member(brand_id));
create policy "Brand owners can invite members" on brand_members
  for insert with check (brand_id in (select id from brands where user_id = auth.uid()));
create policy "Brand owners can remove members" on brand_members
  for delete using (brand_id in (select id from brands where user_id = auth.uid()) or user_id = auth.uid());
create policy "Members can accept invite" on brand_members
  for update using (email = (select email from auth.users where id = auth.uid()));

-- Storage bucket for product images
insert into storage.buckets (id, name, public) values ('product-images', 'product-images', true)
on conflict (id) do nothing;

create policy "Anyone can view product images" on storage.objects
  for select using (bucket_id = 'product-images');
create policy "Authenticated users can upload product images" on storage.objects
  for insert with check (bucket_id = 'product-images' and auth.role() = 'authenticated');
create policy "Authenticated users can update product images" on storage.objects
  for update using (bucket_id = 'product-images' and auth.role() = 'authenticated');
create policy "Authenticated users can delete product images" on storage.objects
  for delete using (bucket_id = 'product-images' and auth.role() = 'authenticated');
