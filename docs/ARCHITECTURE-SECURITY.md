# ARCHITECTURE-SECURITY.md

KenyonExpress security architecture. This document is the binding security decision record: where it conflicts with any other doc, this one wins for security controls.

Revision 2026-07-29. This edition extends the previous one with a complete RLS matrix over all 33 live tables (section 1), the CSP and security-header contract as actually shipped (section 8), and QR redemption brute-force defence (section 9). Nothing from the previous edition was removed: SEC-QR, SEC-WALLET and SEC-RL are still open findings and still tracked here.

Stack (verified live): Next.js 16.2.4 (middleware replaced by `src/proxy.ts`), Supabase Postgres with RLS on all public tables, Cardcom (Israeli PSP, hosted Low Profile in an iframe). Money is stored in agorot (integer, 1 ILS = 100 agorot). Never use floats for money.

Role model (Postgres enum `user_role`): `customer`, `content_uploader`, `vendor` (the supplier-facing role, UI label ספק), `admin`, `super_admin`, `support`.

Authorization primitives:

- Customer scope: own rows via `auth.uid()`.
- Supplier scope: `supplier_members(is_active = true)` plus `is_supplier_member(supplier_id)` / `is_supplier_owner(supplier_id)`. These are the live helpers; `current_user_supplier_id()` is the target helper described in 1.4 and is not yet the shipped form everywhere.
- Admin scope: never a client-side RLS write path on money. Admin mutations run through the service-role `adminClient` only after `requireAdminSession()` at the server-action layer.
- Content uploader: catalog tables only (products, variants, images, categories, media_assets); no money, no orders, no coupons.
- Financial writes: only through `SECURITY DEFINER` functions or the service-role client. There are zero client-facing write policies on any money table.

---

## 0. Table of contents

1. RLS: the full 33-table matrix, live state, and the target policies
2. Rate limiting (per route, fail-closed vs fail-open)
3. CSRF protection for mutations
4. Webhook signature verification (Cardcom)
5. Card token storage rules (SAQ-A)
6. Coupon QR anti-forgery (HMAC + Ed25519)
7. Admin 2FA, secrets management on Vercel, rotation plan
8. CSP and security headers (as shipped)
9. QR redemption: brute force, enumeration, and replay
10. Open findings register

---

## 1. RLS across all 61 tables

### 1.0 Live state, measured

Measured against project `ixvwfbuvfxxsjiywhbbb` on 2026-07-29 via `pg_class` and `pg_policies`.

| Fact | Value |
|---|---|
| Tables in `public` | 33 |
| With `relrowsecurity` (RLS enabled) | **33 of 33** |
| With `relforcerowsecurity` (FORCE RLS) | **0 of 33** |
| With at least one policy | 30 |
| With RLS enabled and **zero** policies | 3 |
| Total policies | 103 |

Two of these numbers are findings.

**FORCE ROW LEVEL SECURITY is on nothing.** The previous edition of this document asserted that every table carries `ENABLE` plus `FORCE`. That is not the live state and never has been. The difference matters exactly once, and it is the case that matters most: without `FORCE`, the **table owner bypasses RLS entirely**. Any `SECURITY DEFINER` function owned by `postgres` therefore reads and writes past every policy, whether or not that was the intent when the function was written. RLS is being relied on as the truth boundary while the boundary has a documented hole in it. See SEC-FORCE in section 10.

**Three tables have RLS enabled and no policy at all.** `payment_webhook_events`, `rate_limits` and `user_rate_limits`. This is deny-all for `anon` and `authenticated` (RLS with no permissive policy denies everything) while `service_role` passes through, and for these three tables it is exactly right: a webhook event log and two rate-limit counters must never be readable or writable from a browser. This is documented here so a future audit does not read "0 policies" as "unprotected" and add one.

### 1.1 The full matrix

Legend: `own` = rows where `auth.uid()` matches the owner column. `supplier` = scoped through `is_supplier_member()` / `is_supplier_owner()`. `catalog` = writable by `content_uploader`. `service` = no client policy; only the service-role client (after `requireAdminSession`) or a `SECURITY DEFINER` function. `read:*` = read-only. `none` = no access. `deny-all` = RLS on, zero policies.

| # | Table | customer | content_uploader | vendor (ספק) | support | admin / super_admin | Money? |
|---|---|---|---|---|---|---|---|
| 1 | `profiles` | own r/w (role pinned) | own r/w | own r/w | read:all | write via service | |
| 2 | `user_addresses` | own r/w/d | none | none | none | full via RLS + service | |
| 3 | `carts` | own r/w (or session cookie) | own | own | none | via service | |
| 4 | `categories` | read:active | catalog r/w own | none | read | write via service | |
| 5 | `products` | read:active | catalog r/w own | read own supplier | read:all | write via service | |
| 6 | `product_variants` | read:active | catalog r/w | none | read | write via service | |
| 7 | `product_images` | read:active parent | catalog r/w | none | read | write via service | |
| 8 | `media_assets` | read:all | insert/update | none | read | full | |
| 9 | `suppliers` | none | none | read own | read:all | full via service | |
| 10 | `supplier_members` | own row | none | read own team; owner manages | read:all | via service | |
| 11 | `vendors` (legacy) | none | none | read own | read:all | super_admin only | |
| 12 | `orders` | own read | none | supplier read (paid+) | read:all | read via service | **yes** |
| 13 | `order_items` | own read via parent | none | supplier read own | read:all | read via service | **yes** |
| 14 | `payments` | own read via order | none | none | read:all | read via service | **yes** |
| 15 | `payment_tokens` | own read (NO token col) | none | none | none | read (NO token col) | **yes** |
| 16 | `payment_webhook_events` | **deny-all** | deny-all | deny-all | deny-all | service only | **yes** |
| 17 | `wallet_accounts` | own read | none | none | read:all | read via service | **yes** |
| 18 | `wallet_entries` | own read via account | none | none | read:all | read via service | **yes** |
| 19 | `wallet_balances` (dep.) | own read | none | none | read:all | full | **yes** |
| 20 | `wallet_transactions` (dep.) | own read | none | none | read:all | full | **yes** |
| 21 | `escrow_holds` | own read via order | none | supplier read | read:all | read | **yes** |
| 22 | `split_executions` | own read via order | none | supplier read | read:all | read | **yes** |
| 23 | `vouchers` | own read | none | read when redeemed by them | read:all | read | **yes** |
| 24 | `voucher_redemptions` | own read via voucher | none | supplier read | read:all | read | **yes** |
| 25 | `coupon_codes` (legacy) | own read | none | none | read:all | read | **yes** |
| 26 | `coupon_deals` | read:active | none | none | read:all | full | |
| 27 | `coupons` (drift) | read:active | none | none | none | none | |
| 28 | `cashback_rules` | read:active window | none | none | read | full | **yes** |
| 29 | `referrals` | own read (either side) | none | none | read:all | full | **yes** |
| 30 | `affiliates` | own read + own update | none | none | read:all | full | **yes** |
| 31 | `audit_log` | none | none | none | none | **read only, no write for anyone** | |
| 32 | `rate_limits` | **deny-all** | deny-all | deny-all | deny-all | service only | |
| 33 | `user_rate_limits` | **deny-all** | deny-all | deny-all | deny-all | service only | |

What the matrix cannot show:

- Every money table has NO client write policy. Writes happen only via `SECURITY DEFINER` functions (checkout, redeem, wallet transfer) or the service-role client. This is intentional and is not a gap.
- `admin` and `super_admin` do not get RLS write policies on money tables. Their power comes from the service-role client used server-side after `requireAdminSession()`. A stolen admin JWT plus the anon key cannot write money through PostgREST.
- `audit_log` carries four policies whose entire job is to say no: `SELECT` for admin, and `INSERT`/`UPDATE`/`DELETE` pinned to `false`. Append-only is enforced by the definer that writes it, not by a client policy. This is the correct shape for an evidence table.
- Guest carts (`profile_id IS NULL`) are written only via the service-role client server-side, never by an anonymous browser policy.

### 1.2 The four structural defects in the live policy set

These are not "missing policies". They are policies that are present and wrong.

**(a) `products` carries 11 policies that widen by OR.** Live count: 11 policies, 5 of them `SELECT`, plus a `FOR ALL` admin policy. Permissive policies union, so the effective read rule is the OR of five expressions. Two of them (`products: public read` and `products_public_read`) are near-duplicates, and only one checks `deleted_at IS NULL`. The result: a soft-deleted product is readable through the weaker policy. The same shape exists on `product_variants` (4 policies, 2 of them `FOR ALL`), `user_addresses` (6) and `suppliers` (5).

This is SEC-06 from the master register, still live. The fix is not to add a stricter policy; adding one changes nothing, because OR. The fix is to **drop the old ones**.

```sql
-- The weaker twin has no deleted_at guard, so it re-exposes soft-deleted rows.
drop policy if exists products_public_read on public.products;
drop policy if exists products_admin_write on public.products;   -- duplicate of "products: admin *"
drop policy if exists variants_public_read on public.product_variants;
drop policy if exists variants_admin_write on public.product_variants;
```

**(b) `products: admin update` gates on `has_role('content_uploader')`, not on admin.** The policy named for admins checks the uploader role. Combined with (a), an account whose only role is `content_uploader` gets `UPDATE` on every product, not just its own, because `products: content_uploader update` (which does pin `created_by = auth.uid()`) is OR-ed with the unpinned one. An uploader can edit `platform_percent` on any product in the catalog. That is a money field.

```sql
-- The name says admin. Make the predicate say admin.
drop policy if exists "products: admin update" on public.products;
create policy products_admin_update on public.products
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());
```

**(c) `affiliates_user_update` has no column restriction.** `USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())`. An affiliate can therefore set their own `status` to approved and write their own `total_earnings_ils`. This is SEC-02, and it is live: the table is empty today (0 rows), which is the only reason it has not been exploited.

```sql
drop policy if exists affiliates_user_update on public.affiliates;
create policy affiliates_user_update on public.affiliates
  for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and status              is not distinct from (select a.status              from public.affiliates a where a.user_id = auth.uid())
    and total_earnings_ils  is not distinct from (select a.total_earnings_ils  from public.affiliates a where a.user_id = auth.uid())
    and total_conversions   is not distinct from (select a.total_conversions   from public.affiliates a where a.user_id = auth.uid())
    and approved_at         is not distinct from (select a.approved_at         from public.affiliates a where a.user_id = auth.uid())
  );
```

Postgres RLS cannot express "these columns are read-only" directly, so the self-comparison above is the idiom. The alternative, a `BEFORE UPDATE` trigger that rejects changes to the protected columns, is stronger and should be layered on top.

**(d) `carts: owner all` trusts a cookie read from a request setting.**

```sql
using (
  profile_id = auth.uid()
  or session_id = ((current_setting('request.cookies', true))::json ->> 'session_id')
  or is_admin()
)
with check (profile_id = auth.uid() or profile_id is null or is_admin())
```

Two problems. The `WITH CHECK` allows `profile_id IS NULL` for **anyone**, so any authenticated user can create an ownerless cart row (SEC-09). And the guest branch reads `session_id` out of `request.cookies`, which is a value PostgREST populates from the request; the cookie name it looks for is `session_id`, while `src/proxy.ts` sets `ke_session_id`. The branch therefore matches nothing in practice, and the guest-cart path works only because the server writes guest carts through the service role. A policy that is dead but looks alive is worse than an absent one: it will be "fixed" by someone renaming the cookie, and that will silently open cross-guest cart reads.

```sql
drop policy if exists "carts: owner all" on public.carts;

create policy carts_owner_rw on public.carts
  for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());
-- Guest carts stay server-side only: created, read and merged by the
-- service-role client. No anon policy, and no cookie-derived predicate
-- inside the database.
```

### 1.3 FORCE ROW LEVEL SECURITY

```sql
do $$
declare t record;
begin
  for t in
    select c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
      and not c.relforcerowsecurity
  loop
    execute format('alter table public.%I force row level security', t.relname);
  end loop;
end $$;
```

This must not be applied blind. `FORCE` makes the owner subject to RLS too, and every `SECURITY DEFINER` function owned by `postgres` that today reads past policies will start being filtered. That is the point, but it will break any definer that was written assuming owner bypass.

The safe order:

1. Enumerate definers: `select proname, prosecdef from pg_proc join pg_namespace n on n.oid = pronamespace where n.nspname = 'public' and prosecdef;`
2. For each, confirm it either operates on tables it has an explicit policy for, or is granted to `service_role` only (which bypasses RLS by role, not by ownership, and is unaffected).
3. Apply `FORCE` to the leaf tables first (`audit_log`, `payment_webhook_events`, rate limits), then catalog, then money last.
4. Re-run the money test suite between groups.

### 1.4 Reference policies

The customer, supplier, uploader and admin patterns below are the target shape. They are what the drops in 1.2 should leave behind.

```sql
-- profiles: own row only; role and supplier_id pinned against self-elevation.
create policy profiles_owner_read on public.profiles
  for select to authenticated using (id = auth.uid());

create policy profiles_owner_update on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role        is not distinct from (select p.role        from public.profiles p where p.id = auth.uid())
    and supplier_id is not distinct from (select p.supplier_id from public.profiles p where p.id = auth.uid())
  );

-- orders / order_items: owner read only. No write policy: checkout writes via service role.
create policy orders_owner_read on public.orders
  for select to authenticated using (user_id = auth.uid());

create policy order_items_owner_read on public.order_items
  for select to authenticated
  using (exists (select 1 from public.orders o
                 where o.id = order_items.order_id and o.user_id = auth.uid()));

-- wallet: owner read, never client write.
create policy wallet_accounts_owner_read on public.wallet_accounts
  for select to authenticated using (user_id = auth.uid());

create policy wallet_entries_owner_read on public.wallet_entries
  for select to authenticated
  using (exists (select 1 from public.wallet_accounts a
                 where a.id in (wallet_entries.debit_account, wallet_entries.credit_account)
                   and a.user_id = auth.uid()));
```

```sql
-- Supplier scope. The live helpers are is_supplier_member / is_supplier_owner.
create policy vouchers_supplier_read on public.vouchers
  for select to authenticated
  using (redeemed_by_supplier_id is not null
         and public.is_supplier_member(redeemed_by_supplier_id));

create policy orders_supplier_read on public.orders
  for select to authenticated
  using (
    status in ('paid','partially_fulfilled','fulfilled','refunded')
    and exists (select 1 from public.order_items oi
                where oi.order_id = orders.id
                  and public.is_supplier_member(oi.supplier_id))
  );
```

The `orders_supplier_read` shape above is the one that survived: migration 077 exists specifically because an earlier version recursed (`orders` policy selecting `order_items`, whose policy selected `orders`). Any future edit to either policy must be checked against that.

```sql
-- Content uploader: catalog only, own rows only.
create policy products_uploader_insert on public.products
  for insert to authenticated
  with check (public.current_user_role() = 'content_uploader' and created_by = auth.uid());

create policy products_uploader_update on public.products
  for update to authenticated
  using  (public.current_user_role() = 'content_uploader' and created_by = auth.uid())
  with check (public.current_user_role() = 'content_uploader' and created_by = auth.uid());
```

```ts
// src/lib/admin/session.ts (shape). getUser(), never getSession().
export async function requireAdminSession() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (!['admin', 'super_admin', 'support'].includes(profile?.role ?? '')) {
    throw new Error('forbidden')
  }
  return { user, role: profile.role }
}
```

`getUser()` and not `getSession()`: `getSession()` returns the cookie contents unverified, so a forged cookie passes it. `getUser()` validates against the auth server.

Role elevation is additionally blocked in the database, so a policy mistake does not become a privilege escalation:

```sql
create or replace function public.enforce_role_change_privilege()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role then
    if new.role in ('admin','super_admin')
       and (public.current_user_role() <> 'super_admin' or new.id = auth.uid()) then
      raise exception 'role elevation denied';
    end if;
  end if;
  return new;
end $$;

create trigger trg_enforce_role_change
  before update on public.profiles
  for each row execute function public.enforce_role_change_privilege();
```

Migration `090_profiles_no_self_role_change.sql` is applied and covers the self-elevation half of this.

### 1.5 Sensitive columns

```sql
-- payment_tokens: owner reads metadata; the token column is revoked from browsers.
create policy payment_tokens_owner_read on public.payment_tokens
  for select to authenticated using (profile_id = auth.uid());

revoke select (cardcom_token) on public.payment_tokens from anon, authenticated;

-- Bank details never reach a browser role at all.
revoke select (bank_account, bank_branch, bank_account_holder)
  on public.vendors from anon, authenticated;

-- wallet transfers: service-role only. This closes SEC-WALLET.
revoke all on function public.fn_wallet_transfer(uuid, uuid, bigint, text, text)
  from public, anon, authenticated;
grant execute on function public.fn_wallet_transfer(uuid, uuid, bigint, text, text)
  to service_role;
```

### 1.6 The RLS test contract

RLS is the truth boundary, so it is tested as one. `tests/sql/` holds an assertion per rule, run against a clean local stack:

| Assertion | Shape |
|---|---|
| Customer A cannot read customer B's order | set role, set `request.jwt.claims`, expect 0 rows |
| Customer cannot read any `payments` row not theirs | expect 0 |
| Supplier A cannot read supplier B's vouchers | expect 0 |
| `content_uploader` cannot update a product it did not create | expect 0 rows updated |
| `content_uploader` cannot write any money column anywhere | expect error or 0 |
| No browser role can `SELECT cardcom_token` | expect `42501` |
| No browser role can execute `fn_wallet_transfer` | expect `42501` |
| `audit_log` rejects INSERT/UPDATE/DELETE from every client role | expect 0 |
| Every table in `public` has `relrowsecurity` | expect 0 rows in the negation |
| Every table in `public` has `relforcerowsecurity` | expect 0 (**fails today**, 33 rows) |

The last two are written as catalog queries, not per-table cases, so a table added next month is covered without anyone remembering to add a test.

---

## 2. Rate limiting

Target infrastructure: Upstash Redis (serverless, HTTP, edge-friendly) via `@upstash/ratelimit`. This replaces the Postgres-based limiter in `src/lib/utils/rate-limit.ts`, which fails open on money paths (SEC-RL).

Core rule: money and coupon endpoints fail **closed**. If the limiter is unreachable, deny. Pure UX endpoints fail **open**, so an Upstash outage does not take the storefront down.

The rule reads backwards at first. Failing closed on checkout means an Upstash outage stops sales. That is the correct trade: an hour of lost sales is recoverable, and an hour of unlimited unmetered attempts against the redemption endpoint is not.

### 2.1 Limits

| Route / action | Key | Limit | Fail mode |
|---|---|---|---|
| `redeem_voucher` (scan) | supplier id | 30 / min | **closed** |
| voucher lookup (pre-redeem) | supplier id | 30 / min | **closed** |
| voucher lookup by token | IP | 10 / min | **closed** |
| `begin_checkout` | user id | 10 / min | **closed** |
| wallet spend / transfer | user id | 10 / min | **closed** |
| login / signup / magic link / reset | IP | 10 / 5 / 5 / 5 per hour | **closed** |
| account deletion request | user id | 3 / 24h | **closed** |
| cancellation request | user id | 5 / 24h | **closed** |
| Cardcom webhook | IP | 300 / min (loose) | open (signature is the real gate) |
| add-to-cart | session / user | 120 / min | open |
| analytics ingest `/api/a` | IP | 120 / min | open |
| consent change | user id | 20 / hr | open |
| agent chat | user id | 20 / hr | open |
| search | IP | 60 / min | open |

The scan limit is 30/min, matching decision 1.7 in the master document. The number 60 that appeared in the previous edition of this file is superseded.

### 2.2 Implementation

```ts
// src/lib/security/ratelimit.ts
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const redis = Redis.fromEnv() // UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN

export const redeemLimiter   = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(30, '1 m'), prefix: 'rl:redeem' })
export const checkoutLimiter = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, '1 m'), prefix: 'rl:checkout' })
export const tokenLimiter    = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, '1 m'), prefix: 'rl:token' })

export async function enforce(
  limiter: Ratelimit,
  key: string,
  mode: 'closed' | 'open',
): Promise<boolean> {
  try {
    const { success } = await limiter.limit(key)
    return success
  } catch (err) {
    captureException(err, { tags: { subsystem: 'ratelimit', mode } })
    return mode === 'open'   // closed => deny, open => allow
  }
}
```

```ts
// Usage in the redeem server action.
const supplierId = await currentUserSupplierId()
if (!supplierId) return { error: 'forbidden' }
if (!(await enforce(redeemLimiter, supplierId, 'closed'))) return { error: 'rate_limited' }
```

Sliding window and not fixed window: a fixed window lets an attacker send the full quota at 10:59:59 and again at 11:00:00, which is double the intended rate at the boundary.

Every limiter breach is reported to Sentry with the key hashed, never raw. A raw user id in an alert is PII in a third-party system.

---

## 3. CSRF protection for mutations

All mutations run as Next.js Server Actions or route handlers. The defence is layered:

1. Server Actions are POST-only to an opaque, per-render action endpoint, not addressable by a cross-site form or image GET. State-changing logic never lives in a GET handler.
2. Origin / Referer check on every mutation, enforced centrally in `src/proxy.ts`.
3. SameSite cookies. The Supabase session and the guest `ke_session_id` cookie are `httpOnly`, `Secure`, `SameSite=Lax`, so they are not attached to cross-site top-level POSTs.
4. Identity from `auth.getUser()` server-side, never from a client-supplied id.

```ts
// src/proxy.ts
const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const WEBHOOK_PATHS = ['/api/webhooks/cardcom']

function assertSameOrigin(req: NextRequest): NextResponse | null {
  if (!MUTATION_METHODS.has(req.method)) return null
  if (WEBHOOK_PATHS.some((p) => req.nextUrl.pathname.startsWith(p))) return null
  const origin = req.headers.get('origin') ?? req.headers.get('referer')
  if (!origin) return new NextResponse('missing origin', { status: 403 })
  const host = req.headers.get('host')
  try {
    if (new URL(origin).host !== host) return new NextResponse('cross-origin blocked', { status: 403 })
  } catch {
    return new NextResponse('bad origin', { status: 403 })
  }
  return null
}
```

Two things this must get right, both of which have already bitten this project:

**The Cardcom webhook is excluded deliberately.** It is cross-origin by nature, carries no session cookie, and is authenticated by HMAC plus server-to-server verification instead of by origin. Running it through the origin check rejects every real webhook.

**Host must be the deployment host, not a guess.** In development, browsing `127.0.0.1` against a dev server bound to `localhost` produces an Origin of `http://127.0.0.1:3000` and a Host of `localhost:3000`. They do not match, and every server action is silently blocked with no useful error. Probes and manual testing must use `localhost`, consistently on both sides. Next 16 enforces its own version of this check independently of ours.

---

## 4. Webhook signature verification (Cardcom)

The webhook is the single writer of `payments` state and must use the service-role `adminClient`. The pattern is verify, log, then act, in that order.

### 4.1 The four steps

1. **Verify the HMAC** of the raw body against `CARDCOM_WEBHOOK_SECRET`. `src/lib/payments/hmac.ts` computes `HMAC-SHA256(rawBody, secret)` as hex and compares with `timingSafeEqual`. On failure: log `signature_valid = false`, return 200, change no state.
2. **Verify against the Cardcom API.** Even with a valid signature, re-fetch the transaction server-to-server and trust only that response for amount and status. A forged "paid 1 agora" on a 500 ILS order fails the amount match.
3. **Log before acting.** Insert into `payment_webhook_events` first, with `UNIQUE(provider, external_event_id)` as the replay barrier. A unique conflict means the event was already processed: return 200 and stop.
4. **Act via service role only**, inside one transaction, on the verified `paid` transition. Coupon issuance, wallet credit and stock decrement happen there and nowhere else, never on a browser redirect.

Returning 200 on a bad signature is deliberate. A 4xx tells an attacker probing the endpoint that their guess was rejected for a specific reason, and it makes Cardcom retry a message we have decided to drop. The event is recorded with `signature_valid = false`, which is the alertable signal.

### 4.2 Reference

```ts
// src/lib/payments/hmac.ts (verified live)
export function verifyCardcomSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): boolean {
  if (!signatureHeader || !secret) return false
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
  const provided = signatureHeader.trim().toLowerCase().replace(/^sha256=/i, '')
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(provided, 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
```

The raw body must be read as text **before** any JSON parse, and the HMAC computed over those exact bytes. Re-serializing the parsed object changes whitespace and key order and the signature will never match.

```ts
export async function POST(req: Request) {
  const raw = await req.text()                       // raw bytes, before parse
  const sig = req.headers.get('x-cardcom-signature')
  const signatureValid = verifyCardcomSignature(raw, sig, env.CARDCOM_WEBHOOK_SECRET)

  const event = JSON.parse(raw)
  const { error: dupe } = await adminClient.from('payment_webhook_events').insert({
    provider: 'cardcom',
    external_event_id: event.LowProfileId,
    signature_valid: signatureValid,
    payload: event,
  })
  if (dupe?.code === '23505') return new Response('ok', { status: 200 })  // replay
  if (!signatureValid)        return new Response('ok', { status: 200 })  // drop

  const verified = await cardcomGetLpResult(event.LowProfileId)           // API truth
  if (verified.status !== 'success') return new Response('ok', { status: 200 })

  await settlePaidOrder(adminClient, verified)
  return new Response('ok', { status: 200 })
}
```

Replay protection summary: `payment_webhook_events(provider, external_event_id)` is UNIQUE and `payments.cardcom_transaction_id` is UNIQUE, so one Cardcom transaction settles exactly one payment row, ever.

**Cardcom does not sign its callbacks.** The legacy `/Interface/*.aspx` endpoints this project uses send unsigned form posts. `CARDCOM_WEBHOOK_SECRET` therefore protects a shared-secret query parameter or header that we ourselves put into the callback URL, not a vendor signature. That makes step 2, the server-to-server re-fetch, the load-bearing control rather than a belt-and-braces extra. It is not optional, and no code path may treat a valid signature as sufficient.

---

## 5. Card token storage rules (SAQ-A)

Cardholder data (the PAN) is entered only on the Cardcom-hosted Low Profile page, never on any KenyonExpress origin. We never receive, process, transmit or store a PAN.

- We store `payment_tokens(cardcom_token, last_4, card_brand, expiry_month, expiry_year, is_default, profile_id)`. Never a PAN, never a CVV.
- Column-level hardening: `REVOKE SELECT (cardcom_token) ... FROM anon, authenticated`. A browser `SELECT *` then fails with `42501`, even with an admin JWT, because admins read via the service client.
- Never log the token. A dedicated audit trigger records only non-secret columns; the generic audit trigger must never be attached to this table.

PCI-DSS scope: all cardholder data handling is outsourced to Cardcom (a PCI-DSS validated provider) and no card field is served from our origin, so we qualify for SAQ-A. Conditions:

1. No card form or card field ever served from our origin.
2. TLS on any page linking to payment; CSP `form-action` and `frame-src` allowing only the Cardcom domain (section 8 shows this shipped).
3. Token revoked from browser roles, never logged, redacted from audit.
4. Cardcom's PCI-DSS Attestation of Compliance on file annually.

Anything that pulls a PAN onto our origin (a self-hosted card form, a JS tokenizer in our page context) escalates us to SAQ-A-EP and is prohibited.

**The iframe does not change this.** Rendering the Low Profile page in an iframe rather than a full redirect keeps the card fields inside Cardcom's document and origin. SAQ-A is preserved as long as we never script into that frame and never accept card data postMessage'd out of it.

**Invariant: no real Cardcom token may be written to the database before the column hardening above is applied.** A token written into an unhardened column is readable by every authenticated browser session until it is rotated, and rotating a stored payment token means asking every customer to re-enter a card.

---

## 6. Coupon QR anti-forgery

### 6.1 Current flaw (SEC-QR, Critical)

`src/lib/checkout/coupon-issue.ts` builds the QR payload as:

```text
raw    = KE|<code>|<orderItemId>|<expiresUnix>|<userId>
digest = sha256(raw)   // UNKEYED
qr     = raw|digest
```

Forgeable. The digest is a plain unkeyed hash over a fully public format, so anyone can craft `raw` and compute a matching digest with no secret. There is no authenticity guarantee at all. This must be replaced before any real coupon flows.

The env inventory already carries `VOUCHER_QR_SECRET`, `VOUCHER_QR_SECRET_PREVIOUS` and `VOUCHER_QR_KEY_ID`, so the key material and rotation slots exist; the signing code is what has not been switched over.

### 6.2 Target: keyed HMAC (online) + Ed25519 (offline)

- **Online** (scanner has connectivity): keyed HMAC-SHA256 over the payload with a server-side secret. The scanner posts the code to the redeem RPC, which recomputes and compares constant-time. The secret never leaves the server.
- **Offline** (business with no connectivity): Ed25519. The private key is server-only; the scanner verifies against an embedded public key. This proves authenticity without connectivity, but authenticity is **not** single-use: an offline scan shows "valid, confirm online", and no goods are released until the online check runs.

```text
KE2.<base64url(payload)>.<base64url(signature)>
payload = { code, voucherId, supplierId, exp, kid }
kid     = qr_key_id   (selects the HMAC secret / Ed25519 public key)
```

```ts
import { createHmac, timingSafeEqual } from 'node:crypto'

export function signVoucherHmac(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload, 'utf8').digest('base64url')
}

export function verifyVoucherHmac(payload: string, sig: string, secret: string): boolean {
  const expected = Buffer.from(signVoucherHmac(payload, secret), 'utf8')
  const provided = Buffer.from(sig, 'utf8')
  if (expected.length !== provided.length) return false
  return timingSafeEqual(expected, provided)
}
```

### 6.3 Single-use enforcement

Signature proves authenticity, not that a voucher is unused. Single-use lives in the database only:

- `UNIQUE` on the redemption row per voucher: a second redemption violates the constraint.
- Atomic compare-and-set inside the redeem `SECURITY DEFINER` function: `UPDATE vouchers SET status='redeemed' WHERE id = $1 AND status='issued'`. The second concurrent scan updates 0 rows and is diagnosed `already_used`. The row lock serializes the race.

Both barriers are required. The CAS alone is enough for concurrency; the unique constraint is what catches a future code path that forgets the `AND status='issued'`.

### 6.4 Key rotation via `kid`

Each voucher embeds `kid`. The verifier selects the secret from a keymap indexed by `kid`. On rotation, new vouchers sign with a new `kid` while scanners keep old public keys so previously issued vouchers still verify. Retire an old `kid` only after everything signed with it has expired. `VOUCHER_QR_SECRET_PREVIOUS` is the two-key window that makes this zero-downtime.

---

## 7. Admin 2FA, secrets, rotation

### 7.1 Admin 2FA

- All staff accounts (`admin`, `super_admin`, `support`) must carry a second factor. Prefer WebAuthn (phishing-resistant); TOTP is the fallback.
- Enrollment via Supabase Auth MFA. `requireAdminSession()` checks the session `aal` is `aal2` before any admin surface renders or any admin action runs. A staff role without an enrolled factor is redirected to enrollment.
- Money-out actions (supplier payout mark-paid) additionally require `super_admin` plus a step-up verified within 15 minutes.

```ts
export async function requireRecentMfa(maxAgeSec = 900) {
  const supabase = await createClient()
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aal?.currentLevel !== 'aal2') throw new Error('mfa_required')
  // assert the aal2 factor was verified within maxAgeSec
}
```

### 7.2 Secrets classification

Rule: any variable without a `NEXT_PUBLIC_` prefix is a server-only secret and must never appear in a client bundle.

| Secret | Sensitivity | Notes |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SECRET_KEY` | **Critical** (RLS bypass = full DB) | Only in `src/lib/supabase/admin.ts`. Never imported by a client component |
| `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` | Public | RLS is what protects data |
| `CARDCOM_TERMINAL_NUMBER` / `_API_NAME` / `_API_PASSWORD` | **Critical** (money) | Only in `src/server/actions/payments/` and `src/lib/payments/` |
| `CARDCOM_ACCOUNTS` | **Critical** | Per-supplier terminal map. A wrong entry routes a charge to the wrong merchant |
| `CARDCOM_WEBHOOK_SECRET` | **Critical** | Shared secret on the callback URL, see 4.2 |
| `VOUCHER_QR_SECRET` (+ `_PREVIOUS`, `_KEY_ID`) | **Critical** (voucher authenticity) | Rotate via `kid` |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | High | Signs presigned PUTs. A leak means arbitrary writes to the CDN bucket |
| `UPSTASH_REDIS_REST_TOKEN` | High | Limiter backend |
| `MEILISEARCH_API_KEY` | High | Server-only. Must never reach the browser, which is why there is no client-side autocomplete |
| `CRON_SECRET` | High | Every cron route checks it |
| `SENTRY_DSN` | Low | Write-only endpoint, but keep server-side |
| `SUPABASE_DB_URL` | **Critical** | Tooling only. Direct Postgres superuser path |

`CARDCOM_SANDBOX` and `CARDCOM_ALLOW_SANDBOX` are not secrets but are safety-critical: sandbox mode enabled in production means real orders settling against a test terminal. `env.ts` must assert that both are false when `NODE_ENV === 'production'`.

### 7.3 Vercel env scoping

- Three scopes: Production, Preview, Development, each with distinct values. Preview shares the dev Supabase project and dev Cardcom terminal, never the production ones.
- No secret committed to git. `.env.local` is gitignored.
- `src/lib/env.ts` with a zod schema that fails fast at boot if a required server secret is missing or if a secret is accidentally prefixed `NEXT_PUBLIC_`. **Not yet built.**
- CI check: grep the built client bundle and fail if any server secret name appears in it.

### 7.4 Rotation

| Secret | Cadence | Zero-downtime |
|---|---|---|
| Supabase service_role / anon | Quarterly or on leak | Brief |
| `CARDCOM_*` | Per PSP policy or on leak | Coordinate with PSP |
| `CARDCOM_WEBHOOK_SECRET` | Quarterly or on leak | Short window |
| `VOUCHER_QR_SECRET` | Yearly or on leak | Yes, via `kid` + `_PREVIOUS` |
| `R2_*` | Quarterly or on leak | Yes |
| `UPSTASH_REDIS_REST_TOKEN` | Quarterly | Yes |
| `CRON_SECRET` | Quarterly | Yes |

On a suspected service-role leak: rotate immediately, then audit `payment_webhook_events`, `wallet_entries`, `vouchers` and `audit_log` for the exposure window.

### 7.5 The wallet-minting lockdown (SEC-WALLET)

`fn_wallet_transfer` was left with the default `PUBLIC EXECUTE` grant, so any authenticated user could call it and credit their own wallet. Platform accounts are exempt from the non-negative floor, so the debit side never blocked.

```sql
revoke all on function public.fn_wallet_transfer(uuid, uuid, bigint, text, text)
  from public, anon, authenticated;
grant execute on function public.fn_wallet_transfer(uuid, uuid, bigint, text, text)
  to service_role;
```

Defence in depth (follow-up code task): an in-function guard that rejects any transfer whose credit account is a user account when `auth.uid()` is non-null and not an admin, so a future accidental re-grant stays safe.

---

## 8. CSP and security headers

### 8.1 What ships today

Unlike most of this document, this section describes a control that is **built and correct**. `next.config.ts` emits security headers on every route, and the policy lives in `src/lib/security/frame-policy.ts`.

```
default-src 'self'
script-src 'self' 'unsafe-inline'
style-src 'self' 'unsafe-inline'
img-src 'self' data: blob: https://*.supabase.co https://images.unsplash.com https://plus.unsplash.com
font-src 'self'
connect-src 'self' https://*.supabase.co
frame-src https://secure.cardcom.solutions
base-uri 'self'
form-action 'self' https://secure.cardcom.solutions
object-src 'none'
upgrade-insecure-requests
frame-ancestors 'none'          <- 'self' on /checkout/frame-return only
```

Alongside it:

| Header | Value |
|---|---|
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` |
| `X-Frame-Options` | `DENY`, or `SAMEORIGIN` on the frame-return path |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(self)` |

### 8.2 The path-dependent directive, and why it is done this way

`frame-ancestors` is the one directive that varies by path, and the reason is a real constraint rather than a preference. Cardcom's Low Profile page renders inside our checkout iframe. When payment finishes, Cardcom navigates **that iframe** to a redirect URL of ours. At that instant our page is the framed one, and `frame-ancestors 'none'` plus `X-Frame-Options: DENY` produce a blank frame and a payment whose outcome the shopper never sees.

The framed page cannot be the confirmation page, for a reason unrelated to CSP: the navigation from Cardcom into our iframe is a cross-site subresource navigation, and browsers withhold `SameSite=Lax` cookies on those. The Supabase session cookie is Lax. The confirmation page would load unauthenticated, the proxy would bounce it to `/login`, and the shopper would watch a login form appear inside the payment box after paying.

So exactly one path is framable: `/checkout/frame-return`, a stub that holds no session, renders no order, and exists to move the top window to `/checkout/return`. That second navigation is top-level, Lax cookies ride along, and the real confirmation runs authenticated and unframed with `frame-ancestors 'none'` intact.

`frame-ancestors 'self'` is not a clickjacking hole. A cross-origin attacker still cannot frame that path, because they are not us. It permits precisely one thing: our own origin framing it.

Two implementation traps, both already handled in the config and both worth restating because a future edit will re-introduce them:

- **Two `Content-Security-Policy` headers are both enforced and the strictest wins.** Emitting a second, relaxed header alongside the default silently undoes the exception. The config therefore uses two **non-overlapping** `source` patterns, with a negative lookahead on the default entry.
- **Headers from `next.config.ts` are applied after middleware and overwrite what it set.** The relaxation cannot be done in `src/proxy.ts`.

### 8.3 What is still weak

**`script-src 'unsafe-inline'` is the real gap.** It defeats the primary purpose of CSP: with it, an injected `<script>` executes. The comment in `next.config.ts` states the reason honestly, that a per-request nonce cannot live in a static config header. The fix:

```ts
// src/proxy.ts
const nonce = crypto.randomUUID().replace(/-/g, '')
const csp = contentSecurityPolicyFor(pathname, nonce)   // "script-src 'self' 'nonce-<n>' 'strict-dynamic'"
const res = NextResponse.next({ request: { headers: withHeader(request.headers, 'x-nonce', nonce) } })
res.headers.set('Content-Security-Policy', csp)
```

with the nonce read in the root layout and passed to any inline script. Because config headers overwrite middleware headers, the CSP entries must move out of `next.config.ts` entirely when this lands, not sit alongside. Half a migration here produces two headers and the intersection, which is the trap in 8.2.

`style-src 'unsafe-inline'` stays. React and Tailwind emit inline styles, and CSS injection without script injection is a much smaller class of attack.

**`connect-src` does not include Upstash or Sentry.** Both are added server-side today, so nothing breaks yet. The moment browser-side Sentry or a client-side limiter call lands, requests will be blocked with a console error and no server-side trace. Whoever adds either must add the origin in the same commit.

**`img-src` will need the R2 origin.** `next.config.ts` already allows `*.r2.dev` and `*.kenyonexpress.co.il` for `next/image`, but the CSP `img-src` list does not include them. Serving a product image from `cdn.kenyonexpress.co.il` today would be blocked by CSP even though `next/image` is configured for it. This will surface the day the image pipeline runs, and it will look like a broken image with no server-side error.

**No `report-uri` / `report-to`.** Nothing tells us when the policy blocks something real. A report endpoint that logs violations to Sentry is how the nonce migration gets verified without breaking the storefront.

**No `Cross-Origin-Opener-Policy` or `Cross-Origin-Embedder-Policy`.** `COOP: same-origin-allow-popups` is safe to add and closes the cross-window reference class of attack. `COEP` would break the Cardcom frame and must not be added.

### 8.4 The header test

Header regressions are invisible until an audit. They are asserted in the test suite instead:

```ts
it('serves frame-ancestors none everywhere except the payment return stub', async () => {
  const home = await fetch(`${BASE}/`)
  expect(home.headers.get('content-security-policy')).toContain("frame-ancestors 'none'")
  expect(home.headers.get('x-frame-options')).toBe('DENY')

  const stub = await fetch(`${BASE}/checkout/frame-return`)
  expect(stub.headers.get('content-security-policy')).toContain("frame-ancestors 'self'")
  expect(stub.headers.get('x-frame-options')).toBe('SAMEORIGIN')

  // Exactly one CSP header. Two would be intersected and the exception lost.
  expect(stub.headers.getSetCookie).toBeDefined()
  expect([...stub.headers].filter(([k]) => k === 'content-security-policy')).toHaveLength(1)
})
```

The last assertion is the one that catches the trap in 8.2, and it is the reason to have this test at all.

---

## 9. QR redemption: brute force, enumeration, replay

Redemption is where a signature, a database state machine and a physical human meet. It is the highest-value target in the system: a successful attack is free goods, and the loss lands on a supplier who trusted a screen.

### 9.1 The threat model

| # | Attack | Attacker | Defeated by |
|---|---|---|---|
| T1 | Guess a valid voucher code | anyone | code entropy + rate limit + lockout |
| T2 | Enumerate the code space to map issued vouchers | anyone | uniform error responses + rate limit |
| T3 | Forge a QR from a known format | anyone | **keyed** HMAC (SEC-QR, open) |
| T4 | Replay a screenshot of a used voucher | customer | DB single-use CAS |
| T5 | Redeem another supplier's voucher | a supplier | supplier scoping in the RPC |
| T6 | Two scans of the same voucher at once | customer | row lock + unique constraint |
| T7 | Redeem an expired voucher | customer | `exp` check server-side |
| T8 | Offline scanner accepts a valid but used voucher | customer | offline mode releases nothing |
| T9 | Supplier redeems vouchers without customers | insider | `voucher_redemptions` audit + anomaly alert |
| T10 | Steal a token from a URL in a sitemap or referer | anyone | not in sitemap, robots deny, `noindex`, `Referrer-Policy` |

### 9.2 Code entropy

The manual code (the fallback a cashier types when the QR does not scan) is the weakest surface, because it is short by necessity.

| Length | Alphabet | Space | Time to first hit at 30/min |
|---|---|---|---|
| 8 digits | 10 | 10^8 | ~5 years |
| 8 chars | Crockford base32 (32) | 1.1 x 10^12 | ~70,000 years |
| 10 chars | Crockford base32 | 1.1 x 10^15 | far beyond |

**Decision: 10 characters, Crockford base32**, generated from a CSPRNG, formatted for humans as `XXXX-XXX-XXX`.

Crockford base32 and not base64 or plain digits, for three specific reasons: it excludes `I`, `L`, `O` and `U`, which removes the 1/l/I and 0/O confusions that dominate transcription errors at a counter; it is case-insensitive on input; and it carries an optional check symbol, so a typo is rejected locally before it ever becomes a lookup and a rate-limit consumption.

Entropy is necessary but not sufficient. It makes online guessing hopeless **only while the rate limit holds**, which is precisely why the redeem path fails closed (section 2).

### 9.3 The tiered lockout

A flat rate limit is the wrong tool alone: 30/min is generous for a real cashier and still allows 43,200 attempts a day from one supplier account. Failures are tracked separately from attempts.

| Tier | Trigger | Response |
|---|---|---|
| 1 | 5 consecutive failed lookups from one supplier | 2-second delay injected on each further attempt |
| 2 | 10 failures in 5 minutes | supplier scan blocked for 15 minutes; alert to admin |
| 3 | 25 failures in 1 hour | supplier scan blocked pending manual review; page the operator |
| 4 | any failure rate above 30% over 100+ scans in a day | flagged for review, not blocked (a broken scanner looks like this too) |

A successful redemption resets the consecutive counter but not the windowed ones. That distinction matters: an attacker with one real voucher would otherwise reset their budget by redeeming it.

Tier 4 exists because tiers 1 to 3 punish a supplier whose camera lens is dirty exactly as they punish an attacker. Blocking a legitimate business at a busy counter is a real cost, so the slow signal reviews rather than blocks.

### 9.4 Uniform errors: the anti-enumeration rule

The scanner client receives **one** failure shape:

```json
{ "ok": false, "reason": "not_found" }
```

for all of: code does not exist, code exists but belongs to another supplier, code already redeemed, code expired, code cancelled, signature invalid.

The precise reason is recorded server-side in `voucher_redemptions` for dispute resolution and fraud analysis. It never crosses the wire.

The reason this is not over-engineering: distinguishable errors turn the endpoint into an oracle. `wrong_supplier` confirms a code is real, which converts a 10^15 search into a 10^15 search for *any* valid code, and then a targeted attack on the one supplier who will accept it.

The one deliberate exception is `already_used`. A cashier holding a customer's phone needs to know the difference between "this is not a voucher" and "this was already used at 14:22 today", or the dispute is unresolvable at the counter. The compromise: `already_used` is returned **only** when the voucher belongs to the scanning supplier, in which case the supplier already knew the code was real.

Timing must be uniform too. A lookup that misses returns faster than one that hits and then fails a status check, and that difference is measurable over enough samples. The RPC performs the same work in both branches, and the response is padded to a fixed floor:

```sql
-- inside redeem_voucher(): resolve first, decide second, so both paths do equal work
perform pg_sleep(greatest(0, 0.05 - extract(epoch from clock_timestamp() - v_started)));
```

### 9.5 The redemption transaction

```sql
create or replace function public.redeem_voucher(p_code text, p_supplier_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_voucher public.vouchers%rowtype;
begin
  -- 1. rate limit, fail-closed. Raises if the limiter is unreachable.
  perform public.assert_rate_limit('voucher_scan', p_supplier_id::text, 30, interval '1 minute');

  -- 2. caller must actually act for this supplier. No admin bypass (decision 1.9).
  if not public.is_supplier_member(p_supplier_id) then
    perform public.log_scan_attempt(p_code, p_supplier_id, 'forbidden');
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  -- 3. single-use compare-and-set. The row lock serializes concurrent scans.
  update public.vouchers v
     set status = 'redeemed',
         redeemed_at = now(),
         redeemed_by_supplier_id = p_supplier_id
   where v.code = p_code
     and v.supplier_id = p_supplier_id
     and v.status = 'issued'
     and v.expires_at > now()
  returning * into v_voucher;

  -- 4. every attempt is logged, successful or not. This is the dispute record.
  perform public.log_scan_attempt(p_code, p_supplier_id,
            case when v_voucher.id is null then 'rejected' else 'ok' end);

  if v_voucher.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  -- 5. the money side, in the same transaction.
  insert into public.voucher_redemptions (voucher_id, supplier_id, amount_collected_agorot)
  values (v_voucher.id, p_supplier_id, v_voucher.remaining_amount_due_agorot);

  return jsonb_build_object(
    'ok', true,
    'collect_agorot', v_voucher.remaining_amount_due_agorot,
    'redeemed_at', now()
  );
end $$;

revoke all on function public.redeem_voucher(text, uuid) from public, anon;
grant execute on function public.redeem_voucher(text, uuid) to authenticated;
```

Five properties this shape guarantees:

1. **The CAS is the single-use barrier.** Two concurrent scans: the first `UPDATE` takes the row lock, the second blocks, then re-evaluates `status = 'issued'`, matches 0 rows, and is rejected. No application-level check-then-act window exists.
2. **The rate limit is inside the transaction and raises.** A limiter failure aborts before any state changes.
3. **No admin bypass.** Decision 1.9 of the master document: an admin who needs to redeem joins as a member. An admin override here would be an unauditable path to free goods.
4. **Every attempt is logged, including rejections.** `voucher_redemptions` is described in the schema as the append-only audit "what a dispute is settled with". A log that records only successes cannot settle a dispute about a scan that failed.
5. **The function is granted to `authenticated`, not `service_role`.** It must be callable from the supplier's scanner. Its safety comes from the membership check in step 2, not from the grant, which is why that check is not optional.

### 9.6 Offline mode

The offline scanner verifies the Ed25519 signature and shows one of two things:

- Signature invalid: **"שובר לא תקף"**, red, final.
- Signature valid: **"חתימה תקינה. נדרש אישור מקוון"**, amber, with a queue entry.

It never shows a green "redeemed". Offline verification proves the voucher was issued by us; it cannot prove it has not been used at a different branch ten minutes ago. Goods are released only after the online CAS returns `ok`.

Queued offline scans sync when connectivity returns. A queued scan that fails the online check is surfaced to the supplier with the timestamp of the earlier redemption, because by then it is a dispute with a customer who has already walked out.

### 9.7 Token URLs

`/redeem/[token]` is a signed voucher token in a URL path. Its exposure surface is not the database:

| Leak vector | Control |
|---|---|
| Sitemap | Excluded, with the reason in the file |
| Search engine crawl | `Disallow: /redeem/` in robots.txt |
| Indexing anyway | `noindex` set by the page itself |
| `Referer` on outbound clicks | `Referrer-Policy: strict-origin-when-cross-origin` |
| Server logs | Path must be redacted in the Sentry scrubber and any access log |
| Browser history / screenshots | Short `exp` in the payload |
| Shared screenshot | Single-use CAS |

The Sentry scrubber row is the one that is easy to miss. An error thrown on `/redeem/KE2.abc...` puts the full token in the exception's URL field, and Sentry retains it. The scrubber must rewrite `/redeem/*` to `/redeem/[redacted]` before transmission.

---

## 10. Open findings register

Severity: **C** critical, **H** high, **M** medium. Status as of 2026-07-29.

| ID | Sev | Finding | Where | Status |
|---|---|---|---|---|
| SEC-QR | **C** | Voucher QR signed with an unkeyed sha256; forgeable by anyone | `src/lib/checkout/coupon-issue.ts` | **Open.** Blocks real coupons |
| SEC-WALLET | **C** | `fn_wallet_transfer` left with PUBLIC EXECUTE; any user can mint balance | 026 | Fix drafted, not applied |
| SEC-FORCE | **H** | `FORCE ROW LEVEL SECURITY` on 0 of 61 tables; every definer bypasses RLS | live schema | **New this edition.** Open |
| SEC-UPLOADER | **H** | `products: admin update` gates on `content_uploader`; uploader can edit any product's money fields | live policy | **New this edition.** Open |
| SEC-06 | **H** | Overlapping permissive policies widen by OR; `products` has 11, and the weakest ignores `deleted_at` | live policy | Open |
| SEC-02 | **H** | `affiliates_user_update` unrestricted by column: self-approval and balance inflation | 010 | Open (table empty) |
| SEC-RL | **H** | Limiter is Postgres-based and fails **open** on money paths | `src/lib/utils/rate-limit.ts` | Open. Blocks live checkout |
| SEC-CSP | **H** | `script-src 'unsafe-inline'`: CSP does not stop script injection | `frame-policy.ts` | Open. Needs nonce in proxy |
| SEC-ENV | **H** | No `src/lib/env.ts`: a missing or misprefixed secret fails at request time, not boot | code | Open |
| SEC-CSRF | **M** | No origin check on mutations in `src/proxy.ts` | `src/proxy.ts` | Open |
| SEC-09 | **M** | `carts` WITH CHECK allows `profile_id IS NULL` for any user; guest branch reads a cookie name that is never set | 001 | Open |
| SEC-IMG | **M** | CSP `img-src` lacks the R2 origin that `next.config.ts` already allows | `frame-policy.ts` | Open. Surfaces when images migrate |
| SEC-REPORT | **M** | No CSP `report-to`: violations are invisible | config | Open |
| SEC-SCRUB | **M** | `/redeem/<token>` not redacted in the Sentry scrubber | observability | Open |
| SEC-12 | **M** | Full bank account numbers reach `audit_log` via the generic trigger | 025/027 | Fix drafted (masking trigger) |
| SEC-15 | **M** | `cardcom_token` readable by the owner until column REVOKE lands | 001 | Invariant: no real token before the fix |

**Launch gate.** No real money and no real voucher moves until SEC-QR, SEC-WALLET, SEC-RL, SEC-UPLOADER and SEC-02 are closed and SEC-CSRF is in place. SEC-FORCE and SEC-CSP are required before public launch but are not blockers for a controlled first transaction.

---

Related: `docs/MASTER-ARCHITECTURE.md` (authority, SEC-01..17 register), `docs/CONTRADICTIONS.md` (money model), `docs/ARCHITECTURE-TESTING.md` (how these controls are asserted), `docs/ARCHITECTURE-OPS.md` (secrets, rotation, incident response), `docs/ARCHITECTURE-LEGAL-COMPLIANCE.md` (compliance authority).
