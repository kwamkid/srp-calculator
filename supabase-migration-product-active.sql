-- Migration: Add active/inactive flag per product
-- Run this in Supabase SQL Editor

alter table products add column if not exists is_active boolean default true;
