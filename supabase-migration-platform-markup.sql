-- Migration: Add platform markup % per brand
-- Run this in Supabase SQL Editor

alter table brands add column if not exists platform_markup_pct numeric default 0;
