-- Add brand_id and role to invites so access is granted on accept
alter table invites add column if not exists brand_id uuid references brands(id) on delete set null;
alter table invites add column if not exists role text default 'editor' check (role in ('viewer', 'editor'));
