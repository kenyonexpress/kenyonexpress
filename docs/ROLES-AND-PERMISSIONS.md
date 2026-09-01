# Roles and Permissions

Who can do what, and which layer actually stops them.

Verified against production (`ixvwfbuvfxxsjiywhbbb`) on **2026-09-01**. Every
function body quoted here was read out of the live database, not out of a
migration file.

Companion documents: `docs/DB-SECURITY-MODEL.md` (grant tables),
`docs/SECURITY-POSTURE.md` (threat model), `docs/SUPPLIER-PAGE.md` (supplier
side in detail).

---

## 1. There are three independent role systems, not one

This is the first thing to get straight, because they are routinely conflated
and they do not line up.

| Layer | Values | Where it lives |
|---|---|---|
| **Postgres roles** | `anon`, `authenticated`, `service_role` | the connection |
| **Application roles** | `customer`, `content_uploader`, `vendor`, `admin`, `super_admin`, `support` | `profiles.role` |
| **Supplier membership** | `owner`, `manager`, `scanner` | `supplier_members.member_role` |

A user has **one** Postgres role, **one** application role, and **zero or more**
supplier memberships. An `admin` is not automatically a supplier. A supplier is
not an elevated customer. The three are orthogonal.

---

## 2. Layer 1: Postgres roles

| Role | SELECT | INSERT / UPDATE / DELETE |
|---|---|---|
| `anon` | 62 relations, gated by RLS | **1 table only: `carts`** |
| `authenticated` | 64 relations | **56 relations** |
| `service_role` | 73 | 73, and it **bypasses RLS entirely** |

`service_role` is used only from `src/lib/supabase/admin.ts`, server-side, and
never reaches a browser. Client code uses the anon key with the user's session.

### The thing to understand about this layer

Migration `126_revoke_authenticated_dml` is in the applied ledger, but
**`authenticated` still holds INSERT, UPDATE and DELETE on 56 relations**,
including `orders`, `order_items`, `payments`, `vouchers`, `refunds` and every
wallet table.

**RLS is therefore the only thing standing between a logged-in user and those
tables, not RLS plus a grant.** Every write policy on them has to be correct on
its own; there is no second layer underneath. In practice the policies do hold
the line (writes to `orders`, `order_items` and the wallet tables are gated on
`is_admin()`), but treat a missing or over-broad write policy there as a live
vulnerability rather than a defence-in-depth gap.

The revoke **did** land on the nine server-only tables, which carry no client
grants at all. See §7.

---

## 3. Layer 2: application roles

`profiles.role`, typed `user_role`. **`profiles.role` is authoritative, not
`app_metadata`**, which can be stale after a role change.

### 3.1 What each role is for

| Role | Purpose |
|---|---|
| `customer` | the default. Buys things. |
| `content_uploader` | writes catalogue content: products, suppliers, images. No money access. |
| `vendor` | a supplier-side application role. Largely superseded by `supplier_members`. |
| `support` | reads customer data to answer questions. Cannot write money. |
| `admin` | full operational access. |
| `super_admin` | `admin`, plus whatever is gated on `super_admin` specifically. |

### 3.2 The four helper functions, and exactly what they return

All four are `STABLE SECURITY DEFINER` with a pinned `search_path`, and all read
`profiles` by `auth.uid()`.

```sql
current_user_role()  -- returns the raw user_role, or NULL
  SELECT role FROM profiles WHERE id = auth.uid()

is_admin()           -- role IN (admin, super_admin)
is_support()         -- role IN (support, admin, super_admin)
```

`has_role(required_role text)` is a **hierarchy**, not an equality test, and its
shape is worth reading in full because two of its branches surprise people:

| `has_role(x)` | true when `profiles.role` is |
|---|---|
| `'customer'` | **anything at all** (see the trap below) |
| `'vendor'` | `vendor`, `content_uploader`, `admin`, `super_admin` |
| `'content_uploader'` | `content_uploader`, `admin`, `super_admin` |
| `'admin'` | `admin`, `super_admin` |
| `'super_admin'` | `super_admin` |
| anything else | `false` |

> **Trap 1: `has_role('customer')` returns `true` for every signed-in user with
> a profile row.** It is not a check that someone *is* a customer; it is a check
> that they exist. A policy written as `has_role('customer')` grants access to
> every authenticated user including `content_uploader` and `support`. If you
> want "this row belongs to the caller", write `user_id = (SELECT auth.uid())`.

> **Trap 2: `support` is not in the `has_role` hierarchy at all.** Every branch
> above returns `false` for a `support` user except `'customer'`. Support access
> is granted exclusively through `is_support()`, which is a separate function
> with its own set. A policy that uses `has_role('vendor')` to mean "staff" will
> silently exclude support; a policy that uses `is_support()` will silently
> include admins. Both are correct, and they are different sets.

> **Trap 3: `has_role` returns `false` when `auth.uid()` is NULL**, so it is
> safe under `anon`, but `current_user_role()` returns `NULL` rather than
> raising. A policy comparing `current_user_role() = 'admin'` is safe;
> `current_user_role() <> 'admin'` is `NULL`, which is not `true`, so it denies.
> That is the right direction, but it is luck rather than design, and inverted
> role tests should be avoided.

### 3.3 Nobody can promote themselves

`enforce_profile_privilege_columns`, a trigger on `profiles`:

```sql
IF auth.uid() IS NULL THEN RETURN NEW; END IF;   -- service_role passes
IF is_admin() THEN RETURN NEW; END IF;
IF NEW.role IS DISTINCT FROM OLD.role THEN
  RAISE EXCEPTION 'profiles.role may only be changed by an admin' USING ERRCODE = '42501';
END IF;
IF NEW.supplier_id IS DISTINCT FROM OLD.supplier_id THEN
  RAISE EXCEPTION 'profiles.supplier_id may only be changed by an admin' USING ERRCODE = '42501';
END IF;
```

This matters because `profiles_update_unified` lets a user update **their own
row** (`id = (SELECT auth.uid())`). Without the trigger, "update your own
profile" would include "set your own role to `super_admin`". The RLS policy
grants the row; the trigger protects the two columns that confer privilege.

Note the first line: **a `service_role` write passes the trigger unchecked**,
because `auth.uid()` is NULL. That is deliberate (admin tooling has to be able
to set roles) and it means server-side code assigning a role carries the whole
responsibility itself.

---

## 4. Layer 3: supplier membership

Supplier rights come from an **active row in `supplier_members`**, never from
`profiles.role`.

```sql
is_supplier_member(p_supplier_id)   -- active membership, any member_role
  EXISTS (SELECT 1 FROM supplier_members
          WHERE supplier_id = p_supplier_id AND user_id = auth.uid() AND is_active)

is_supplier_owner(p_supplier_id)    -- active membership with member_role = 'owner'
```

| `member_role` | Scan vouchers | See orders and history | Manage staff |
|---|---|---|---|
| `owner` | yes | yes | yes |
| `manager` | yes | yes | no |
| `scanner` | yes | limited | no |

`is_active` is part of both checks, so deactivating a member revokes scanning
immediately without deleting the audit history attached to their user id.

Staff identity at the till is a **separate** concept again: `supplier_staff`
rows with bcrypt PINs. A PIN is not a login. See `docs/SUPPLIER-PAGE.md` §4.

---

## 5. What each actor can and cannot do

### Anonymous visitor (`anon`)

| Can | Cannot |
|---|---|
| Read active, non-deleted products, categories, suppliers, live banners and homepage sections | Read any order, payment, voucher, wallet or profile |
| Create and update a guest cart (`carts`, the only table `anon` may write) | Write anything else |
| Call `is_admin()`, `is_supplier_member()`, `fn_record_recent_search()` | Call any other RPC |

The catalogue read predicate is one expression, and the search indexer uses the
same one so the index and RLS cannot disagree:

```sql
status = 'active' AND deleted_at IS NULL
```

`anon` and `authenticated` get **separate** SELECT policies on `products`
rather than one policy with an `OR`, so the anonymous plan stays simple.

### Customer

| Can | Cannot |
|---|---|
| Read their own orders, order items, payments, refunds, vouchers, wallet, addresses | Read anyone else's |
| Update their own profile | Change their own `role` or `supplier_id` (§3.3) |
| Redeem nothing | Call `redeem_voucher` usefully: it requires an active supplier membership |

A customer sees a voucher through `user_id = (SELECT auth.uid())`.

### Supplier member

| Can | Cannot |
|---|---|
| Scan vouchers for **their own** supplier | Scan for any other supplier (`wrong_supplier`) |
| See paid orders containing their lines | See `pending` orders at all |
| See a voucher **after** redeeming it | Enumerate outstanding vouchers issued against their business |
| Write `supplier_branches` for their supplier | Write products, prices or money |
| Owners only: manage `supplier_members` | Managers and scanners cannot |

The voucher rule is the interesting one:

```sql
vouchers_select_unified
  is_admin()
  OR user_id = (SELECT auth.uid())
  OR (redeemed_by_supplier_id IS NOT NULL AND is_supplier_member(redeemed_by_supplier_id))
```

Reading is gated on `redeemed_by_supplier_id`, which is NULL until redemption.
A supplier therefore cannot learn how much unredeemed liability is walking
around, or correlate outstanding vouchers to individual customers.

### Content uploader

| Can | Cannot |
|---|---|
| Insert and update `products`, `suppliers`, `product_images`, `media_assets` | Touch `orders`, `payments`, `vouchers`, wallets |
| See their own draft products before approval | Approve their own products |

`products_insert_unified` admits `has_role('content_uploader')` **or** a
`created_by = auth.uid()` clause for the uploader's own rows.
`enforce_product_approval` is the trigger that keeps publication separate from
authorship.

### Support

| Can | Cannot |
|---|---|
| Read `profiles`, `orders`, `order_items`, `wallet_balances`, `refunds`, `payment_events` for any customer | Write any of them |
| | Anything gated on `is_admin()` |

Support is read-only by construction: `is_support()` appears in `SELECT`
policies and in no `INSERT`, `UPDATE` or `DELETE` policy anywhere.

Note the `deleted_at IS NULL` conjunct that accompanies `is_support()` in
`order_items_select_unified` and `wallet_balances_select_unified`: support sees
live rows, admins see soft-deleted ones too.

### Admin and super_admin

Full operational access through `is_admin()`. Every `INSERT`, `UPDATE` and
`DELETE` policy on the money tables is gated on it.

`super_admin` is a strict superset. Today the only place the distinction is
enforced is `supplier_branches_admin_all` and a handful of policies that spell
out `current_user_role() = ANY (ARRAY['admin','super_admin'])`, which is the
same set as `is_admin()`. **In practice `super_admin` currently confers nothing
`admin` does not.** That is worth knowing before relying on it as a separation
boundary.

---

## 6. Where each rule is actually enforced

The same rule often exists at three layers. Knowing which one is load-bearing
decides what a change can safely assume.

| Rule | Postgres grant | RLS policy | Trigger | Application |
|---|---|---|---|---|
| Anonymous cannot read an order | yes | yes | | yes |
| Customer sees only their own orders | **no** | **yes** | | yes |
| Nobody promotes themselves | **no** | partial | **yes** | yes |
| Voucher is single-use | **no** | **no** | | **the atomic UPDATE in `redeem_voucher`** |
| Only the owning supplier redeems | **no** | **no** | | **`redeem_voucher` derives supplier from `auth.uid()`** |
| Money conservation | | | **CHECK constraints** | yes |
| `payment_events` is append-only | | | **trigger** | |
| Admin-only route | | | | **`src/proxy.ts` + per-page + per-action** |

Three observations follow:

1. **For the money tables, RLS is the only database-level defence**, because
   the `authenticated` grant is still there (§2).
2. **Voucher single-use is enforced by neither grants nor RLS.** It is one
   conditional `UPDATE ... WHERE status = 'issued' AND expires_at > now() AND
   supplier_id IN (...)` inside a `SECURITY DEFINER` function. That statement is
   the whole guarantee, and it is sufficient: two concurrent scans cannot both
   match.
3. **Route guarding is optimistic and re-checked.** `src/proxy.ts` gates
   `/admin/*` on `profiles.role`, but every page re-gates per section and every
   server action re-checks its own guard. The proxy check is a redirect for
   humans, not a security boundary.

> **Auditing trap.** Server-action guards sit **two hops in**, behind
> `withActionContext` wrappers. Grepping for a guard call at the top of each
> action body reports almost none and is wrong. Separately, `apps/mobile` is a
> second RPC caller, so any grants audit scoped to `src/` under-counts.

---

## 7. The nine server-only tables

Closed to every client role, in two shapes:

**Zero policies (4):** `payment_webhook_events`, `rate_limits`,
`search_index_outbox`, `user_rate_limits`.

**A single `RESTRICTIVE` policy with `USING (false)` (5):**
`legacy_percent_archive_112`, `referral_signals`, `search_index_dlq`,
`settlement_events`, `stock_reservations`.

Migration 122 made the deny explicit on the second group, and 144 revoked the
underlying table grants, so a later `CREATE POLICY` cannot silently hand out
DML as well. Only the first four are flagged `rls_enabled_no_policy` by the
Supabase advisor, because the other five technically have a policy.

**RLS with no permissive policy denies; it does not allow.** A future audit
reading "0 policies" as "unprotected" and adding one would be the mistake.

---

## 8. Function execute grants

Production carries 69 functions, **61 `SECURITY DEFINER`, all 61 with a pinned
`search_path`** and zero unpinned.

`anon` holds **six** EXECUTE grants. Three are real RPCs; three are trigger
functions carrying Postgres's default public grant, which take no arguments and
return `trigger`, so calling them over PostgREST achieves nothing:

| Grant | Reachable? |
|---|---|
| `is_admin()` | yes, called by RLS policies under the anon role |
| `is_supplier_member(uuid)` | yes, same |
| `fn_record_recent_search(text)` | yes, deliberately, so a guest's recent searches work |
| `enqueue_search_index()` | no, trigger function |
| `payment_events_append_only()` | no, trigger function |
| `refunds_force_due_by()` | no, trigger function |

`check_rate_limit` was narrowed to `service_role` only by
`127_revoke_check_rate_limit_execute`. Before that an anonymous caller chose
both the rate-limit key and the threshold, and its body increments the counter
**before** comparing it to the maximum, so five calls with
`phone-otp-number:<victim>` locked a known number out of OTP sign-in, and every
call was an unbounded write of attacker-chosen rows into `rate_limits`.

**Do not revoke `EXECUTE` on `is_admin()` from `authenticated`.** It is
referenced by 81 of the 133 policies, and a policy expression is evaluated with
the privileges of the querying role. Revoking it makes those 81 policies raise
`permission denied for function is_admin` for every signed-in user on every
table they guard.

---

## 9. Verification

```sql
-- grant surface per role
select grantee, privilege_type, count(distinct table_name) as relations
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon','authenticated','service_role')
  and privilege_type in ('SELECT','INSERT','UPDATE','DELETE')
group by grantee, privilege_type order by grantee, privilege_type;

-- the role helpers, as production has them
select proname, pg_get_functiondef(oid)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and proname in ('is_admin','is_support','has_role','current_user_role',
                  'is_supplier_member','is_supplier_owner');

-- which policies depend on is_admin
select count(*) from pg_policies
where schemaname = 'public'
  and coalesce(qual,'') || coalesce(with_check,'') like '%is_admin%';
-- 81 of 133

-- anon EXECUTE grants
select p.proname, p.prosecdef
from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
  lateral aclexplode(p.proacl) ax join pg_roles r on r.oid = ax.grantee
where n.nspname = 'public' and ax.privilege_type = 'EXECUTE' and r.rolname = 'anon'
order by p.proname;
```
