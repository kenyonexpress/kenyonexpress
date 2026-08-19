# AUTH-MODEL.md

Who may do what, where each rule is enforced, and what the database actually
says today.

Status: BINDING. Branch `feat/auth-model`, worktree `ke-merge`, 2026-08-19.
Queue: AUTOPILOT step (11) AUTH.
Every number in §2 and §4 was read from **production** through Supabase MCP on
2026-08-19, not from `supabase/migrations/`. §4.1 is about why that distinction
is not pedantry.
Code: `src/lib/admin/rbac.ts`, `src/lib/admin/permissions.ts`,
`src/lib/supplier/rbac.ts`, `src/lib/supabase/bearer.ts`,
`src/__tests__/route-guards.test.ts`.

---

## 0. The two identity systems

There is no `tenant_id` anywhere in this schema, and nothing here introduces one.

| System | Stored in | Answers |
|---|---|---|
| **Platform role** | `profiles.role`, enum `user_role` | what a person may do across the site |
| **Supplier membership** | `supplier_members(user_id, supplier_id, role)` | which business a person acts for |

```
user_role             customer | content_uploader | vendor | admin | super_admin | support
supplier_member_role  owner | manager | scanner
```

They are orthogonal on purpose. A supplier owner is a `customer` at platform
level who happens to own a business; an `admin` is not automatically a member of
any supplier. Collapsing them would mean an admin implicitly gains the right to
redeem any voucher, which is precisely the authority the scan guard exists to
scope.

---

## 1. The four guard layers

A request crosses up to four independent checks. Each exists because the one
above it cannot do its job.

```
1. proxy         src/proxy.ts        headers, framing, the payment-return exception
2. layout        (admin)/layout.tsx  panel entry: requirePanelSession()
3. page/route    per file            the section matrix: requireSection(...)
4. action + RLS  server + Postgres   the write itself
```

### 1.1 Why layer 2 is not enough, and this is the important paragraph

`src/app/(admin)/layout.tsx` calls `requirePanelSession()`, and it is tempting
to read that as covering all 38 pages in the group.

**It does not.** In the App Router a layout and the page beneath it render **in
parallel**. `children` is an element the layout receives already built, so a
`redirect()` in the layout **discards the page's output but does not prevent the
page function from running and querying**. The layout is a *display* gate. The
per-page call is the *execution* gate.

Both are wanted. That is why layer 3 exists and why
`src/__tests__/route-guards.test.ts` asserts it file by file.

### 1.2 The guards

| Function | Module | Effect |
|---|---|---|
| `getSessionWithRole()` | admin/rbac | reads, never redirects |
| `requirePanelSession()` | admin/rbac | any panel role, else `/login` |
| `requireStaffSession()` | admin/rbac | staff, else `/login` |
| `requireAdminSession()` | admin/rbac | admin, else `/login` |
| `requireAdminPage()` | admin/rbac | admin, page flavour |
| `requireSection(section, 'read'\|'write')` | admin/rbac | the section matrix; redirects to `/admin`, not `/login` |
| `requireSupplierMember(next)` | supplier/rbac | membership of any supplier |
| `requireSupplierRole(role, next)` | supplier/rbac | membership at or above a role |
| `identityScopedClient()` | supabase/bearer | a Supabase client bound to the caller's bearer token |

`requireSection` redirects **into the panel** rather than to `/login`, so a
`support` user who deep-links to `/admin/payments` lands somewhere useful
instead of at a login form they are already past.

### 1.3 The section matrix

`AdminSection` is a closed list: `dashboard`, `catalog`, `orders`, `users`,
`payments`, `affiliates`, `analytics`, `audit-log`, `suppliers`, `discounts`.
Access per role is `none | read | write` in `src/lib/admin/permissions.ts`.

### 1.4 The scanner is a different mechanism, deliberately

The four scanner endpoints (`api/supplier/app/pin`,
`api/supplier/vouchers/{lookup,redeem,redeem-batch}`) authenticate by **device
bearer token**, not by a cookie session, because the caller is a phone on a shop
counter.

`identityScopedClient()` builds a Supabase client scoped to that token, so every
query runs as the caller under RLS. **This is a stronger guard than a page
check, not a weaker one:** a page guard is a check that can be forgotten one
statement before a query, while this is the client the query has to go through.
It is also why these routes are not CSRF-reachable: no ambient cookie
authenticates them.

---

## 2. Route guard coverage, measured

Counted on 2026-08-19 across `src/app/(admin)`, `src/app/(supplier)`,
`src/app/api/admin`, `src/app/api/supplier`.

| Surface | Files | Guarded | Gap |
|---|---|---|---|
| admin pages | 38 | 38 | none, after the fix below |
| supplier pages | all | all but one stub | `supplier/scan/page.tsx` is a pure `redirect('/scan')` |
| admin + supplier API routes | all | all but one alias | `api/supplier/redeem/route.ts` re-exports the guarded handler |

### 2.1 The one real gap, and what it was and was not

**`/admin/products` was the only page in a group of 38 with no guard of its
own** — including its own siblings `products/new` and `products/[id]/edit`,
which both gate on `catalog`.

What it was **not**: a draft-product leak. Public `SELECT` on `products` is
`status = 'active' AND deleted_at IS NULL` (migration 104), and the page uses
the request-scoped client, so a non-staff visitor's query returned only the live
catalogue.

What it **was**: the admin panel shell, with its edit links, rendering for any
authenticated visitor, and a query executing on their behalf. Fixed by adding
`await requireSection('catalog', 'read')`. `read` rather than `write`, because
listing is not editing and `content_uploader` is allowed to see the list.

### 2.2 The test that keeps it fixed

`src/__tests__/route-guards.test.ts`, 53 assertions. It walks the four
privileged roots and fails on any `page.tsx` or `route.ts` that calls no guard.

Two design choices worth stating:

- **The allowlist is two entries and each carries its reason**, and a second
  test asserts each allowlisted file still contains no `createClient`. A file
  allowlisted as a trivial stub that grows a database read stops being trivial,
  and that is the failure mode an allowlist normally hides.
- **It asserts it found more than 30 files.** A refactor that moves these
  directories must not turn the suite into a vacuous pass over zero files.

---

## 3. RLS, as production reports it

Read from `pg_class` and `pg_policies` on 2026-08-19.

```
tables in public          53
RLS enabled               53      <- every one
RLS disabled               0
RLS on with zero policies  8
```

**Every table in the database has RLS enabled.** The step (11) requirement "RLS
every table" is met.

### 3.1 The 8 with no policy are deny-all, and that is intended

```
legacy_percent_archive_112   payment_webhook_events   rate_limits
referral_signals             search_index_dlq         settlement_events
stock_reservations           user_rate_limits
```

RLS with **zero** policies denies every client role unconditionally. These are
service-key-only tables: journals, queues and limiter state that no browser
should ever touch. The Supabase advisor reports them as `rls_enabled_no_policy`,
which is a warning about a **shape**, not about an exposure.

---

## 4. The finding: for `authenticated`, RLS is the only layer

```
relations granted to `authenticated`            55
of those, with INSERT/UPDATE/DELETE granted     55      <- all of them
```

`authenticated` holds the full stock DML grant on **every** table, including
`settlement_events` (the money journal), `payment_webhook_events` and
`stock_reservations`. That is the Supabase default, not a decision anybody made
here.

Nothing is exposed **today**: RLS denies the writes, and for the 8 above it
denies them absolutely. The hazard is latent and specific:

> The moment anyone adds a single permissive policy for `authenticated` to one
> of those tables, that role gains **INSERT, UPDATE and DELETE** along with the
> read they intended to grant.

Migration `111_revoke_anon_writes` built exactly this second layer for `anon`,
and its own header calls it "defence in depth above RLS". It did not do the same
for `authenticated`. `migrations/pending/126_revoke_authenticated_dml.sql` is
the drafted sibling. **It is not applied.**

### 4.1 Why these numbers came from the database and not from the files

A grep over `supabase/migrations/*.sql` for `ENABLE ROW LEVEL SECURITY` reports
**four production tables with no RLS**: `coupons`, `orders`, `referrals`,
`wallet_balances`.

All four have RLS enabled in production, with 1, 4, 4 and 4 policies
respectively. `orders` — customer order data — is among them.

The file chain does not describe this database. A CI test that asserted RLS by
reading the migration files would have raised four false alarms, and the fourth
time somebody dismisses a false alarm is the time the real one is dismissed with
it. **An RLS assertion has to run against a database.** The query is in §6.

---

## 5. Rate limiting on auth

Step (11) asks for "Upstash rate limits on auth". Current state, measured:

```
package.json      no @upstash/redis, no @upstash/ratelimit
src/              no UPSTASH_REDIS_*, no Ratelimit
.env.example      Upstash appears once, for QSTASH_* only
```

Auth rate limiting today runs on Postgres, through `check_rate_limit` and
`check_user_rate_limit`, and **fails open** when the limiter is unreachable.

Ofir's decision of 2026-08-19 is that rate limiting moves to **Upstash Redis**,
and the design, key layout and fail-closed rule are in
`ARCHITECTURE-SECURITY-HARDENING.md` §1.5. Two properties matter most for auth
specifically:

1. **Fail closed on auth**, unlike search. An unthrottled login endpoint during
   a database incident is a credential-stuffing window; an unthrottled search is
   a cost.
2. **Independent of Postgres**, so the limiter does not fail in lockstep with
   the thing it protects.

It is **not implemented here**: it needs `UPSTASH_REDIS_REST_URL` and
`UPSTASH_REDIS_REST_TOKEN`, which do not exist yet, and shipping an untestable
limiter on the auth path is worse than shipping the documented one.

---

## 6. The audit queries

Run these against production when anything in this document is in doubt.

```sql
-- Every table has RLS on. Expect rls_off = 0.
select count(*) filter (where relrowsecurity) as rls_on,
       count(*) filter (where not relrowsecurity) as rls_off
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r';

-- RLS on with no policy: deny-all. Confirm each is meant to be service-key only.
select c.relname
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
  and (select count(*) from pg_policies p
        where p.schemaname = 'public' and p.tablename = c.relname) = 0;

-- Where `authenticated` can still write. Section 4.
select g.table_name, string_agg(distinct g.privilege_type, ',' order by g.privilege_type)
from information_schema.role_table_grants g
where g.table_schema = 'public' and g.grantee = 'authenticated'
  and g.privilege_type in ('INSERT','UPDATE','DELETE')
group by g.table_name order by g.table_name;

-- Policies still using the bare auth.uid(), which re-evaluates per row.
select schemaname, tablename, policyname
from pg_policies
where schemaname = 'public'
  and (qual like '%auth.uid()%' or with_check like '%auth.uid()%')
  and qual not like '%( SELECT auth.uid()%';
```

---

## 7. Open items

| # | Item | State |
|---|---|---|
| 1 | `authenticated` holds DML on all 55 relations | drafted, `migrations/pending/126`, **not applied** |
| 2 | Upstash Redis limiter on auth, fail-closed | designed, needs credentials |
| 3 | RLS assertion in CI | needs a database in CI; blocked on `CI_SUPABASE_URL`, the same secret that makes the E2E job skip itself |
| 4 | `supabase_admin` default privileges still grant `anon` the stock grant on dashboard-created tables | `111` could not close it (42501); operational rule is to re-run its section 2 after any dashboard table |
| 5 | `audit_log` is append-only by convention, not by trigger | `ARCHITECTURE-ORDER-STATE-MACHINE.md` §8.3 |

Item 3 is the reason §2.2's test asserts the **code** side rather than the
database side: it is the half that can be enforced without a secret this
repository does not have.
