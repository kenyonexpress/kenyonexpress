-- Phase 5: Add icon_url and name_en to categories
-- Both columns are referenced by the admin form and upsertCategory action
-- but were absent from the original 005_products_schema.sql definition.
-- name_en defaults to '' so existing rows satisfy any future NOT NULL constraint.
-- Idempotent: safe to run multiple times.

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS icon_url text,
  ADD COLUMN IF NOT EXISTS name_en text NOT NULL DEFAULT '';
