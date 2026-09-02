---
name: supabase-migrations
description: Use whenever creating or editing a file in supabase/migrations/. Covers idempotency rules, enum handling, RLS policy patterns.
---

## Where a migration goes, and what may apply it

**`db push` is forbidden.** A schema change is written as a file in
`migrations/pending/` and waits for explicit approval. Applying it to production
goes through MCP `apply_migration`. Running a migration against production is
one of the four situations that require stopping and asking.

**`supabase/migrations/` does not describe production.** It holds the applied
history by filename (080 to 129), but the hosted database is the pre-059 lineage
and the two chains diverged. A from-zero reset is not runnable here. The
authoritative descriptions of production are the live schema and
`src/types/database.ts`, not this directory.

**Numbers get reused.** A file's number in `migrations/pending/` is often not
the name it applied under. As of 2026-09-01, pending `143`, `144` and `145`
applied as `125`, `126` and `127`; pending `138` through `141` applied as one
migration; pending `135` applied as two. Always check
`supabase_migrations.schema_migrations` before assuming a number is free or a
migration is unapplied. The mapping table is in
`docs/ARCHITECTURE-OVERVIEW.md` section 8.1.

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

## Money columns

Money is an integer number of agorot. A new money column is `integer` or
`bigint` named `*_agorot`, never `numeric` and never a float.

Where a legacy `numeric` column still exists, its agorot twin is generated, not
written:

```sql
ALTER TABLE public.t
  ADD COLUMN IF NOT EXISTS price_ils_agorot bigint
  GENERATED ALWAYS AS ((round((price_ils * 100::numeric)))::bigint) STORED;
```

Add a non-negative CHECK unless the column genuinely carries a sign. The six
that do, and must NOT get one: the five wallet columns
(`profiles.wallet_balance_agorot`, `wallet_accounts.balance_ils_agorot`,
`wallet_balances.balance_ils_agorot`, `wallet_entries.amount_ils_agorot`,
`wallet_transactions.amount_ils_agorot` and `.gross_amount_ils_agorot`) and
`product_variants.price_modifier_agorot`. A ledger entry has a sign; a variant
modifier can subtract.

Prefer a CHECK that states the conservation law over one that only bounds a
range, because it catches the class of bug that matters:

```sql
CHECK (face_value_agorot = coupon_price_agorot + remaining_amount_due_agorot)
```

## RLS

Every table must have:

```sql
ALTER TABLE public.t ENABLE ROW LEVEL SECURITY;
```

Followed by explicit `DROP POLICY IF EXISTS / CREATE POLICY` for every operation (SELECT, INSERT, UPDATE, DELETE) that is permitted. No implicit fallback.

**Zero policies is a valid, deliberate answer.** RLS enabled with no permissive
policy denies every client role unconditionally, and that is how the
server-only tables are locked: `legacy_percent_archive_112`,
`payment_webhook_events`, `rate_limits`, `referral_signals`, `search_index_dlq`,
`settlement_events`, `stock_reservations`, `user_rate_limits`, and
`search_index_outbox`. Do not "fix" one by adding a policy.

**Revoke the table grant too, not just the policy.** The moment anybody adds one
permissive `authenticated` policy to such a table to grant a read, that role
also gains INSERT, UPDATE and DELETE if the grant was left in place. On
`settlement_events` that is the money journal. Production today: `anon` has DML
on exactly one table (`carts`), `authenticated` on 56.

**Wrap `auth.uid()` in a scalar subquery** inside a policy:
`(SELECT auth.uid())`, not a bare call. It turns a per-row evaluation into an
InitPlan evaluated once.

**`SECURITY DEFINER` functions must pin `search_path`.** All 61 in production do,
and zero are unpinned. Keep it that way: `SET search_path = ''` plus
fully-qualified names. The EXECUTE grant on such a function is the real access
surface, not the policy that calls it.

## Migration run order

The 001 to 011 chain below is historical. It describes a fresh-database
bootstrap that cannot be run against this project: production is the pre-059
lineage, `001` is not idempotent and stops early on a live database, and a
from-zero reset is not runnable here.

For anything new, the order that matters is the one in
`migrations/pending/APPLY-ORDER.md`, and the only remaining blocked file is
`137_order_transition_guard.sql`. It was written against enums that are not the
live ones: its guard forbids `order_items` moving `paid -> redeemed`, which is
the coupon redemption path, and it omits `platform_settled` from both
`orders.status` and `payments.status` although the value is live in each.

Historical note, kept because it explains the shape of the early files: 004
(storage) had to run before 005 (products) because 004 depends on
`public.has_role()` defined in 003.

Re-verified against production `ixvwfbuvfxxsjiywhbbb` on 2026-09-01.
