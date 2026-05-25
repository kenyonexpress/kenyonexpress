---
name: supabase-migrations
description: Use whenever creating or editing a file in supabase/migrations/. Covers idempotency rules, enum handling, RLS policy patterns.
---

## Every migration MUST be idempotent

Every statement must be safe to run multiple times:

- Tables: `CREATE TABLE IF NOT EXISTS`
- Indexes: `CREATE INDEX IF NOT EXISTS`
- Columns: `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
- Functions: `CREATE OR REPLACE FUNCTION`
- Triggers: `DROP TRIGGER IF EXISTS` then `CREATE TRIGGER`
- Enums: wrap in `DO $$ BEGIN CREATE TYPE ... EXCEPTION WHEN duplicate_object THEN null; END $$;`
- Policies: `DROP POLICY IF EXISTS "name" ON table;` immediately before every `CREATE POLICY`
- Buckets: `INSERT INTO storage.buckets ... ON CONFLICT (id) DO NOTHING`

## ALTER COLUMN to enum type

When converting a text column to an enum type, in this exact order inside a `DO $$ IF ... END IF $$` block:

1. `ALTER TABLE t DROP CONSTRAINT IF EXISTS t_column_check;` -- remove old check constraint FIRST
2. `UPDATE t SET col = 'default_value' WHERE col NOT IN ('val1','val2',...);` -- normalize unknown values
3. `DROP POLICY IF EXISTS "policy that references col" ON t;` -- drop policies that Postgres re-validates
4. `ALTER TABLE t ALTER COLUMN col DROP DEFAULT;`
5. `ALTER TABLE t ALTER COLUMN col TYPE public.enum_type USING (CASE col WHEN 'val1' THEN 'val1'::public.enum_type ... ELSE 'default'::public.enum_type END);`
6. `ALTER TABLE t ALTER COLUMN col SET DEFAULT 'default_value'::public.enum_type;`
7. Recreate dropped policies unconditionally after the DO block.

## Enum vs text: explicit casts required

Every text literal compared to a `user_role` (or any enum) column/return value MUST carry an explicit cast:

```sql
-- WRONG
WHERE role = 'admin'
WHERE role IN ('admin', 'super_admin')
v_role = 'super_admin'

-- CORRECT
WHERE role = 'admin'::public.user_role
WHERE role IN ('admin'::public.user_role, 'super_admin'::public.user_role)
v_role = 'super_admin'::public.user_role
```

This applies inside: PL/pgSQL function bodies, RLS policy USING/WITH CHECK clauses, DO blocks.

## set_updated_at() dependency

`public.set_updated_at()` is defined in `001_initial_schema.sql`. Because 001 is not idempotent and may stop early on a live DB, migrations 005+ include a defensive `CREATE OR REPLACE FUNCTION public.set_updated_at()` at the top before any trigger references it.

## Standard table shape

Every table gets:

```sql
id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
created_at  timestamptz NOT NULL DEFAULT now(),
updated_at  timestamptz NOT NULL DEFAULT now()
-- optional soft delete:
deleted_at  timestamptz
```

Add `DROP TRIGGER IF EXISTS set_updated_at ON t; CREATE TRIGGER set_updated_at BEFORE UPDATE ON t FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();`

## RLS

Every table must have:

```sql
ALTER TABLE public.t ENABLE ROW LEVEL SECURITY;
```

Followed by explicit `DROP POLICY IF EXISTS / CREATE POLICY` for every operation (SELECT, INSERT, UPDATE, DELETE) that is permitted. No implicit fallback.

## Migration run order

001 (fresh DB only) -> 002 -> 003 -> 004 -> 005 -> 006 -> 007 -> 008 -> 009 -> 010 -> 011

004 (storage) must run before 005 (products) because 004 depends on `public.has_role()` defined in 003.
