-- Migration: Members, Invites, Roles, Login History
-- Run this in Supabase SQL Editor

-- 1. Invites table (single-use invite links)
create table if not exists invites (
  id uuid primary key default gen_random_uuid(),
  token text unique not null default encode(gen_random_bytes(32), 'hex'),
  created_by uuid references auth.users(id) not null,
  used_by uuid references auth.users(id),
  used_at timestamptz,
  expires_at timestamptz default (now() + interval '7 days'),
  created_at timestamptz default now()
);

-- 2. Team members table (central, not per-brand)
create table if not exists team_members (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade not null,
  member_user_id uuid references auth.users(id) on delete cascade not null,
  member_email text not null,
  invited_via uuid references invites(id),
  created_at timestamptz default now(),
  unique(owner_id, member_user_id)
);

-- 3. Brand access (which member can see/edit which brand)
create table if not exists brand_members (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  role text default 'viewer' check (role in ('viewer', 'editor')),
  granted_by uuid references auth.users(id),
  created_at timestamptz default now(),
  unique(brand_id, user_id)
);

-- 4. Add last_edited_by columns to products
alter table products add column if not exists last_edited_by text default '';
alter table products add column if not exists last_edited_at timestamptz;

-- 5. Login history table
create table if not exists login_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  email text not null,
  login_at timestamptz default now(),
  ip_address text default '',
  user_agent text default ''
);

-- 6. Enable RLS
alter table invites enable row level security;
alter table team_members enable row level security;
alter table brand_members enable row level security;
alter table login_history enable row level security;

-- 7. Helper: is user owner or has brand access?
create or replace function has_brand_access(b_id uuid) returns boolean as $$
  select exists(
    select 1 from brands where id = b_id and user_id = auth.uid()
  ) or exists(
    select 1 from brand_members
    where brand_id = b_id and user_id = auth.uid()
  );
$$ language sql security definer;

-- Helper: can user edit this brand?
create or replace function can_edit_brand(b_id uuid) returns boolean as $$
  select exists(
    select 1 from brands where id = b_id and user_id = auth.uid()
  ) or exists(
    select 1 from brand_members
    where brand_id = b_id and user_id = auth.uid() and role = 'editor'
  );
$$ language sql security definer;

-- 8. Drop old policies
drop policy if exists "Users can view own brands" on brands;
drop policy if exists "Users can insert own brands" on brands;
drop policy if exists "Users can update own brands" on brands;
drop policy if exists "Users can delete own brands" on brands;
drop policy if exists "Users can view own products" on products;
drop policy if exists "Users can insert own products" on products;
drop policy if exists "Users can update own products" on products;
drop policy if exists "Users can delete own products" on products;

-- 9. Brands policies
create policy "Users can view brands" on brands
  for select using (has_brand_access(id));
create policy "Users can insert own brands" on brands
  for insert with check (auth.uid() = user_id);
create policy "Users can update brands" on brands
  for update using (can_edit_brand(id));
create policy "Users can delete own brands" on brands
  for delete using (auth.uid() = user_id);

-- 10. Products policies (view = any access, edit = editor or owner)
create policy "Users can view products" on products
  for select using (has_brand_access(brand_id));
create policy "Users can insert products" on products
  for insert with check (can_edit_brand(brand_id));
create policy "Users can update products" on products
  for update using (can_edit_brand(brand_id));
create policy "Users can delete products" on products
  for delete using (can_edit_brand(brand_id));

-- 11. Invites policies (only creator can manage)
create policy "Users can view own invites" on invites
  for select using (auth.uid() = created_by);
create policy "Users can create invites" on invites
  for insert with check (auth.uid() = created_by);
create policy "Anyone can use invite" on invites
  for update using (used_by is null); -- only unused invites

-- 12. Team members policies
create policy "Owners can view their team" on team_members
  for select using (auth.uid() = owner_id);
create policy "Owners can add team members" on team_members
  for insert with check (auth.uid() = owner_id);
create policy "Owners can remove team members" on team_members
  for delete using (auth.uid() = owner_id);
-- Members can see they belong to a team
create policy "Members can see their membership" on team_members
  for select using (auth.uid() = member_user_id);

-- 13. Brand members policies
create policy "Owners can manage brand access" on brand_members
  for select using (brand_id in (select id from brands where user_id = auth.uid()));
create policy "Members can see their access" on brand_members
  for select using (auth.uid() = user_id);
create policy "Owners can grant access" on brand_members
  for insert with check (brand_id in (select id from brands where user_id = auth.uid()));
create policy "Owners can update access" on brand_members
  for update using (brand_id in (select id from brands where user_id = auth.uid()));
create policy "Owners can revoke access" on brand_members
  for delete using (brand_id in (select id from brands where user_id = auth.uid()));

-- 14. Login history policies
create policy "Users can view related login history" on login_history
  for select using (
    auth.uid() = user_id
    or user_id in (select member_user_id from team_members where owner_id = auth.uid())
  );
create policy "Users can insert own login" on login_history
  for insert with check (auth.uid() = user_id);
