# ARCHITECTURE-SECURITY.md

KenyonExpress security architecture. This document is the binding security decision record: where it conflicts with any other doc, this one wins for security controls.

Stack (verified live): Next.js 16 (middleware in `src/proxy.ts`), Supabase Postgres with RLS on all public tables, Cardcom (Israeli PSP, hosted Low Profile). Money is stored in agorot (integer, 1 ILS = 100 agorot). Never use floats for money.

Role model (Postgres enum `user_role`): `customer`, `content_uploader`, `vendor` (the supplier-facing role, UI label ספק), `admin`, `super_admin`, `support`.

Authorization primitives:

- Customer scope: own rows via `auth.uid()`.
- Supplier scope: `supplier_members(is_active = true)` plus the helper `current_user_supplier_id()`, which resolves the acting user to their active supplier id (NULL if none).
- Admin scope: never a client-side RLS write path. Admin mutations run through the service-role `adminClient` only after `requireAdminSession()` at the server-action layer.
- Content uploader: catalog tables only (products, variants, images, categories); no money, no orders, no coupons.
- Financial writes: only through `SECURITY DEFINER` functions or the service-role client. There are zero client-facing write policies on any money table.

---

## 0. Table of contents

1. RLS full matrix per role x table (with example `CREATE POLICY` statements)
2. Rate limiting with Upstash (per route, fail-closed vs fail-open)
3. CSRF protection for mutations
4. Webhook signature verification (Cardcom)
5. Card token storage rules (SAQ-A)
6. Coupon QR anti-forgery (HMAC + Ed25519)
7. Admin 2FA, secrets management on Vercel, rotation plan

Known open findings tracked in this doc:

- SEC-QR (Critical): `src/lib/checkout/coupon-issue.ts` currently builds the QR payload with an UNKEYED `sha256` digest, which is forgeable by anyone who knows the (public) input format. Must become keyed HMAC-SHA256 (online) plus Ed25519 (offline). See section 6.
- SEC-WALLET (Critical): the `fn_wallet_transfer` draft was left with the default PUBLIC EXECUTE grant, so any authenticated user could invoke it and mint wallet balance. Controls must `REVOKE EXECUTE ... FROM PUBLIC` and grant `service_role` only. See section 1.7 and 7.4.
- SEC-RL (High): `src/lib/utils/rate-limit.ts` exists but is Postgres-based and fails open on money paths. The target is Upstash (Redis) with fail-closed money endpoints. See section 2.

---

## 1. RLS full matrix per role x table

Every table listed below has `ENABLE ROW LEVEL SECURITY` plus `FORCE ROW LEVEL SECURITY`. RLS is the truth boundary. The matrix reads as the effective permission granted to each role by the union of permissive policies.

Legend for cell values:

- `own` = rows where `auth.uid()` matches the owner column.
- `supplier` = rows scoped to `current_user_supplier_id()` via `supplier_members(is_active)`.
- `catalog` = catalog tables writable by `content_uploader`.
- `service` = no client policy at all; only the service-role `adminClient` (after `requireAdminSession`) or a `SECURITY DEFINER` function may write.
- `read:*` = read-only for that scope.
- `none` = no access.

### 1.1 Matrix

| Table | customer | content_uploader | vendor (ספק) | support | admin | super_admin |
|-------|----------|------------------|--------------|---------|-------|-------------|
| `profiles` | own r/w (role + supplier_id pinned) | own r/w (pinned) | own r/w (pinned) | read:all | read:all, write via service (WITH CHECK, no self-elevation) | full via service |
| `products` | read:published | catalog r/w | supplier r/w own | read:all | write via service | write via service |
| `orders` | own read | none | supplier read (paid+ statuses, own items) | read:all | read via service | read via service |
| `order_items` | own read (via parent) | none | supplier read (own items) | read:all | read via service | read via service |
| `coupon_codes` | own read | none | supplier read (own supplier), no direct write | read:all | read via service | read via service |
| `coupon_redemptions` | own read | none | supplier read (own supplier) | read:all | read via service | read via service |
| `coupon_scan_events` | none | none | supplier read (own supplier), append via definer | read:all | read via service | read via service |
| `payments` | own read | none | none | read:all | read via service | read via service |
| `payment_tokens` | own read (NO token column) | none | none | none | read:all (NO token column) | read:all (NO token column) |
| `wallet_accounts` | own read | none | none | read:all | read via service | read via service |
| `wallet_entries` | own read | none | none | read:all | read via service | read via service |
| `suppliers` | read:active | none | supplier read own, limited self-service via definer | read:all | write via service | write via service |
| `supplier_members` | own read (self) | none | supplier read own team; owner add limited to non-owner roles | read:all | write via service | write via service |
| `carts` | own r/w (`profile_id = auth.uid()`) | own r/w | own r/w | none | read via service | read via service |

Notes that the matrix cannot show:

- Every money table (`orders`, `order_items`, `payments`, `payment_tokens`, `wallet_accounts`, `wallet_entries`, `coupon_redemptions`) has NO client write policy. Writes happen only via `SECURITY DEFINER` functions (checkout, redeem, wallet transfer) or the service-role client. This is intentional and is not a gap.
- `admin` and `super_admin` do not get RLS write policies on money tables. Their power comes from the service-role client used server-side after `requireAdminSession()`. This keeps a stolen admin JWT (anon key + session) from writing money directly through PostgREST.
- Guest carts (`profile_id IS NULL`) are written only via the service-role client server-side, never by an anonymous browser policy.

### 1.2 Customer own-rows (auth.uid)

```sql
-- profiles: a user reads and updates only their own row, and cannot change
-- role or supplier_id (privilege / data-scope pinning).
create policy profiles_owner_read on public.profiles
  for select to authenticated
  using (id = auth.uid());

create policy profiles_owner_update on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role is not distinct from (select p.role from public.profiles p where p.id = auth.uid())
    and supplier_id is not distinct from (select p.supplier_id from public.profiles p where p.id = auth.uid())
  );

-- orders: owner read only. No insert/update/delete policy: checkout writes via service role.
create policy orders_owner_read on public.orders
  for select to authenticated
  using (user_id = auth.uid());

-- order_items: scoped through the parent order.
create policy order_items_owner_read on public.order_items
  for select to authenticated
  using (exists (
    select 1 from public.orders o
    where o.id = order_items.order_id and o.user_id = auth.uid()
  ));

-- wallet_accounts / wallet_entries: owner read only, never client write.
create policy wallet_accounts_owner_read on public.wallet_accounts
  for select to authenticated
  using (user_id = auth.uid());

create policy wallet_entries_owner_read on public.wallet_entries
  for select to authenticated
  using (exists (
    select 1 from public.wallet_accounts a
    where a.id = wallet_entries.account_id and a.user_id = auth.uid()
  ));

-- coupon_codes: customer reads coupons they own.
create policy coupons_owner_read on public.coupon_codes
  for select to authenticated
  using (user_id = auth.uid());
```

### 1.3 Vendor / supplier scoped (current_user_supplier_id)

```sql
-- Helper (SECURITY DEFINER): resolves the caller to their single active supplier.
create or replace function public.current_user_supplier_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select sm.supplier_id
  from public.supplier_members sm
  where sm.user_id = auth.uid()
    and sm.is_active = true
  limit 1
$$;

revoke all on function public.current_user_supplier_id() from public;
grant execute on function public.current_user_supplier_id() to authenticated;

-- suppliers: a member reads their own supplier row.
create policy suppliers_member_read on public.suppliers
  for select to authenticated
  using (id = public.current_user_supplier_id());

-- products: a supplier reads and writes only their own catalog rows.
create policy products_supplier_rw on public.products
  for all to authenticated
  using (supplier_id = public.current_user_supplier_id())
  with check (supplier_id = public.current_user_supplier_id());

-- coupon_codes: a supplier reads coupons that belong to their supplier
-- (for the scanner UI). No write: redemption goes through redeem_coupon() only.
create policy coupons_supplier_read on public.coupon_codes
  for select to authenticated
  using (supplier_id = public.current_user_supplier_id());

-- coupon_redemptions: supplier reads its own redemption ledger.
create policy redemptions_supplier_read on public.coupon_redemptions
  for select to authenticated
  using (supplier_id = public.current_user_supplier_id());

-- coupon_scan_events: supplier reads its own scan log; writes are append-only
-- via the redeem_coupon definer function, no direct insert policy.
create policy scan_events_supplier_read on public.coupon_scan_events
  for select to authenticated
  using (supplier_id = public.current_user_supplier_id());

-- orders: a supplier reads only paid+ orders that contain its own items.
create policy orders_supplier_read on public.orders
  for select to authenticated
  using (
    status in ('paid','fulfilled','completed','refunded')
    and exists (
      select 1 from public.order_items oi
      where oi.order_id = orders.id
        and oi.supplier_id = public.current_user_supplier_id()
    )
  );
```

### 1.4 Content uploader (catalog only)

```sql
-- content_uploader may manage catalog metadata but touches no money/order/coupon
-- table. Gate on the role via a helper that reads profiles authoritatively.
create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

create policy products_uploader_rw on public.products
  for all to authenticated
  using (public.current_user_role() = 'content_uploader')
  with check (public.current_user_role() = 'content_uploader');
-- (parallel policies on product_variants, product_images, categories)
```

### 1.5 Admin / super_admin (service client after requireAdminSession)

Admins get read visibility through RLS but do NOT get client write policies on money tables. All admin mutations go through the service-role client, which bypasses RLS, and only after the server action has verified the session.

```ts
// src/lib/admin/session.ts (shape)
export async function requireAdminSession() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser() // never getSession()
  if (!user) redirect('/login')
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (!['admin', 'super_admin', 'support'].includes(profile?.role ?? '')) {
    throw new Error('forbidden')
  }
  return { user, role: profile.role }
}
```

```sql
-- Read-only admin visibility example. Note: no WITH CHECK write path here on money.
create policy payments_admin_read on public.payments
  for select to authenticated
  using (public.current_user_role() in ('admin','super_admin','support'));

-- profiles admin write MUST carry WITH CHECK and MUST NOT allow self-elevation.
-- Role elevation to admin/super_admin is additionally blocked by a trigger.
create policy profiles_admin_write on public.profiles
  for update to authenticated
  using (public.current_user_role() in ('admin','super_admin'))
  with check (public.current_user_role() in ('admin','super_admin'));

create or replace function public.enforce_role_change_privilege()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role then
    -- only a super_admin may grant admin/super_admin, and never to self
    if new.role in ('admin','super_admin')
       and (public.current_user_role() <> 'super_admin' or new.id = auth.uid()) then
      raise exception 'role elevation denied';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_enforce_role_change
  before update on public.profiles
  for each row execute function public.enforce_role_change_privilege();
```

### 1.6 Carts (guest + user)

```sql
-- Authenticated carts: strictly own rows, never a null owner.
create policy carts_owner_rw on public.carts
  for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());
-- Guest carts (profile_id IS NULL) are created and merged only via the
-- service-role client server-side; there is no anon write policy.
```

### 1.7 payment_tokens and wallet: the sensitive-column and definer rules

```sql
-- payment_tokens: owner reads metadata but the cardcom_token column is REVOKEd
-- from every browser role (see section 5). No client write path.
create policy payment_tokens_owner_read on public.payment_tokens
  for select to authenticated
  using (profile_id = auth.uid());

revoke select (cardcom_token) on public.payment_tokens from anon, authenticated;

-- wallet transfers: SECURITY DEFINER, service-role only. This closes SEC-WALLET.
revoke all on function public.fn_wallet_transfer(uuid, uuid, bigint, text, text) from public, anon, authenticated;
grant execute on function public.fn_wallet_transfer(uuid, uuid, bigint, text, text) to service_role;
```

---

## 2. Rate limiting with Upstash (Redis) per route

Target infrastructure: Upstash Redis (serverless, HTTP, edge-friendly) via `@upstash/ratelimit`. This replaces the Postgres-based limiter in `src/lib/utils/rate-limit.ts`, which fails open on money paths.

Core rule: money and coupon endpoints fail CLOSED (if the limiter is unreachable, deny the request). Pure UX endpoints fail OPEN (if the limiter is unreachable, allow, so an Upstash outage does not take the storefront down).

### 2.1 Limits table

| Route / action | Key | Limit | Fail mode |
|----------------|-----|-------|-----------|
| `redeem_coupon` (scan) | supplier id | 60 / min | fail CLOSED |
| `begin_checkout` | user id | 10 / min | fail CLOSED |
| coupon QR scan lookup (pre-redeem) | supplier id | 60 / min | fail CLOSED |
| wallet spend / transfer server action | user id | 10 / min | fail CLOSED |
| login / signup / magic-link / password-reset | IP | 10 / 5 / 5 / 5 per hour | fail CLOSED |
| account deletion request | user id | 3 / 24h | fail CLOSED |
| Cardcom webhook | IP | 300 / min (loose) | fail OPEN (signature + API verify are the real gate) |
| add-to-cart | session/user | 120 / min | fail OPEN |
| analytics ingest | IP | 120 / min | fail OPEN |
| agent chat | user id | 20 / hr | fail OPEN |

### 2.2 Implementation shape

```ts
// src/lib/security/ratelimit.ts
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const redis = Redis.fromEnv() // UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN

export const redeemLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, '1 m'),
  prefix: 'rl:redeem',
})

export const checkoutLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '1 m'),
  prefix: 'rl:checkout',
})

// failClosed: deny on limiter error (money/coupon). failOpen: allow on error (UX).
export async function enforce(
  limiter: Ratelimit,
  key: string,
  mode: 'closed' | 'open',
): Promise<boolean> {
  try {
    const { success } = await limiter.limit(key)
    return success
  } catch (err) {
    console.error('ratelimit error', err)
    return mode === 'open' // closed => deny (false), open => allow (true)
  }
}
```

```ts
// Usage in the coupon redeem server action (fail CLOSED, keyed by supplier).
const supplierId = await currentUserSupplierId()
const ok = await enforce(redeemLimiter, supplierId, 'closed')
if (!ok) return { error: 'rate_limited' }
```

Anti-enumeration on the scan path: `not_found` and `wrong_supplier` both return the same generic `not_found` to the scanner client; the precise reason is logged server-side to `coupon_scan_events` for fraud analysis. This prevents an attacker from mapping the 8-digit code space or another supplier's codes.

---

## 3. CSRF protection for mutations

All mutations run as Next.js Server Actions or route handlers. CSRF defense is layered:

1. Server Actions are POST-only to an opaque, per-render action endpoint and are not addressable by a simple cross-site form or image GET. State-changing logic never lives in a GET handler.
2. Origin / Referer check on every mutation. Reject when the `Origin` (or `Referer` fallback) host is not our own. Enforced centrally in `src/proxy.ts` for POST/PUT/PATCH/DELETE.
3. SameSite cookies. The Supabase session and the guest `ke_session_id` cookies are `httpOnly`, `Secure`, `SameSite=Lax`, so they are not attached to cross-site top-level POSTs from a hostile origin.
4. Identity from `auth.getUser()` server-side, never from a client-supplied id. The acting user is always the verified session user, so a forged cross-site request cannot act as someone else even if it somehow reaches the handler.

```ts
// src/proxy.ts (origin check for mutations)
const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

function assertSameOrigin(req: Request): void {
  if (!MUTATION_METHODS.has(req.method)) return
  const origin = req.headers.get('origin') ?? req.headers.get('referer')
  if (!origin) throw new Response('missing origin', { status: 403 })
  const host = req.headers.get('host')
  if (new URL(origin).host !== host) {
    throw new Response('cross-origin blocked', { status: 403 })
  }
}
```

The Cardcom webhook route is the deliberate exception: it is cross-origin by nature (Cardcom POSTs to us), carries no session cookie, and is authenticated by HMAC signature plus server-to-server API verification instead of by origin. It must be excluded from the origin check and must never trust cookies.

---

## 4. Webhook signature verification (Cardcom)

The webhook is the single writer of `payments` state, and it must use the service-role `adminClient`. There is no client-facing write policy on `payments`. The pattern is verify, log, then act, in that order.

### 4.1 The four-step pattern

1. Verify the HMAC signature of the raw body against `CARDCOM_WEBHOOK_SECRET`. Verified in `src/lib/payments/hmac.ts` via `verifyCardcomSignature`, which computes `HMAC-SHA256(rawBody, secret)` as hex and compares with `timingSafeEqual` (constant-time, length-checked). On failure: log `signature_valid = false`, return 200, change no state.
2. Verify against the Cardcom API. Even with a valid signature, re-fetch the transaction server-to-server with `GetLpResult` (by low-profile / transaction id) and trust ONLY that response for amount and status. A forged "paid 1 agora" on a 500 ILS order fails the amount match.
3. Log before acting. Insert into `payment_webhook_events` first, with `UNIQUE(external_event_id)` as replay protection. If the insert hits the unique conflict, the event was already processed, so return 200 and stop (idempotent no-op).
4. Act via service role only. Update order/payment status through the `adminClient` inside one transaction. All valuable side effects (coupon issuance, wallet credit, stock decrement) happen only on the verified `paid` transition, never on a browser redirect / success URL.

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

```ts
// route handler shape: verify -> log-before-act -> API verify -> service-role write
export async function POST(req: Request) {
  const raw = await req.text()
  const sig = req.headers.get('x-cardcom-signature')

  const signatureValid = verifyCardcomSignature(raw, sig, env.CARDCOM_WEBHOOK_SECRET)

  // 3. log before acting (UNIQUE external_event_id = replay barrier)
  const event = JSON.parse(raw)
  const { error: dupe } = await adminClient
    .from('payment_webhook_events')
    .insert({
      provider: 'cardcom',
      external_event_id: event.LowProfileId,
      signature_valid: signatureValid,
      payload: event,
    })
  if (dupe?.code === '23505') return new Response('ok', { status: 200 }) // replay
  if (!signatureValid) return new Response('ok', { status: 200 })         // drop, no state change

  // 2. verify against Cardcom API; trust only this for amount + status
  const verified = await cardcomGetLpResult(event.LowProfileId)
  if (verified.status !== 'success') return new Response('ok', { status: 200 })

  // 4. act via service role only, on the verified paid transition
  await settlePaidOrder(adminClient, verified)
  return new Response('ok', { status: 200 })
}
```

Replay protection summary: `payment_webhook_events.external_event_id` is `UNIQUE`, and `payments.cardcom_transaction_id` is `UNIQUE`, so one Cardcom transaction settles exactly one payment row, ever.

---

## 5. Card token storage rules (SAQ-A)

Cardholder data (the PAN) is entered only on the Cardcom-hosted Low Profile page, never on any KenyonExpress origin. We never receive, process, transmit, or store a PAN.

Storage rules:

- We store `payment_tokens(cardcom_token, last_4, brand, expiry, is_default, profile_id)`. Never a raw PAN, never a CVV, never a full expiry as a card secret.
- Column-level hardening: `REVOKE SELECT (cardcom_token) ON public.payment_tokens FROM anon, authenticated`. A browser `SELECT *` then fails with `42501`, even for an admin JWT, because admins read via the service client, not the anon key. Only `id, profile_id, last_4, brand, expiry, is_default, created_at` are grantable to browser roles.
- Never log the token. A dedicated audit trigger on `payment_tokens` records only non-secret columns; the generic audit trigger must never be attached to this table.
- The token is not cardholder data, but treat it as sensitive material at rest.

```sql
create policy payment_tokens_owner_read on public.payment_tokens
  for select to authenticated
  using (profile_id = auth.uid());

revoke select (cardcom_token) on public.payment_tokens from anon, authenticated;
-- token writes happen only via the service-role client after a verified Cardcom flow.
```

PCI-DSS scope: because all cardholder data handling is fully outsourced to Cardcom (a PCI-DSS validated provider) and no card field is ever served from our origin, we qualify for SAQ-A. Conditions we must uphold:

1. No card form or card field ever served from our origin (hosted page / redirect only).
2. Pages linking to payment served over TLS; CSP `form-action` / `frame-src` allowing only the Cardcom domain.
3. Token treated as sensitive: REVOKEd from browser roles, never logged, redacted from audit.
4. Confirm Cardcom's PCI-DSS Attestation of Compliance on file annually.

Anything that would pull a PAN onto our origin (a self-hosted card form, a JS tokenizer running in our page context, storing a PAN) would escalate us to SAQ-A-EP or higher and is prohibited.

---

## 6. Coupon QR anti-forgery

### 6.1 Current flaw (SEC-QR, Critical)

`src/lib/checkout/coupon-issue.ts` today builds the QR payload as:

```text
raw    = KE|<code>|<orderItemId>|<expiresUnix>|<userId>
digest = sha256(raw)   // UNKEYED
qr     = raw|digest
```

This is forgeable. The digest is a plain unkeyed hash over a fully public format, so anyone can craft a `raw` string and compute a matching `digest` with no secret. There is no authenticity guarantee at all. This must be replaced before any real coupon flows.

### 6.2 Target design: keyed HMAC (online) + Ed25519 (offline)

Two signing modes cover the two scanning contexts:

- Online (scanner has connectivity): keyed HMAC-SHA256 over the payload using a server-side secret. The scanner posts the code to `redeem_coupon`, which recomputes the HMAC server-side and compares constant-time. The secret never leaves the server.
- Offline (scanner at a business with no connectivity): Ed25519 signature. The private key is server-only (`SUPPLIER_QR_SIGNING_KEY`); the scanner verifies the signature against the embedded public key offline. This proves authenticity without connectivity, but authenticity is NOT single-use: an offline scan shows "valid, confirm online", and no goods are released until the online single-use check runs.

Payload format with a key id for rotation:

```text
KE2.<base64url(payload)>.<base64url(signature)>
payload = { code, orderItemId, supplierId, exp, kid }
kid     = qr_key_id  (selects which HMAC secret / Ed25519 public key to verify with)
```

```ts
// online: keyed HMAC-SHA256 (replaces the unkeyed sha256)
import { createHmac, timingSafeEqual } from 'node:crypto'

export function signCouponHmac(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload, 'utf8').digest('base64url')
}

export function verifyCouponHmac(payload: string, sig: string, secret: string): boolean {
  const expected = Buffer.from(signCouponHmac(payload, secret), 'utf8')
  const provided = Buffer.from(sig, 'utf8')
  if (expected.length !== provided.length) return false
  return timingSafeEqual(expected, provided)
}
```

```ts
// offline: Ed25519 (private key server-only, public key embedded in the scanner keymap)
import { sign, verify } from 'node:crypto'

export function signCouponEd25519(payload: Buffer, privateKey: KeyObject): Buffer {
  return sign(null, payload, privateKey)
}

export function verifyCouponEd25519(payload: Buffer, signature: Buffer, publicKey: KeyObject): boolean {
  return verify(null, payload, publicKey, signature)
}
```

### 6.3 Single-use enforcement

Signature proves authenticity, not that a coupon has not already been used. Single-use is enforced in the database only:

- `UNIQUE(coupon_code_id)` on `coupon_redemptions`: a second redemption of the same coupon violates the unique constraint and is rejected.
- Atomic compare-and-set inside the `redeem_coupon` `SECURITY DEFINER` function: `UPDATE coupon_codes SET status='redeemed' WHERE id = $1 AND status='issued'`. The second concurrent scan updates 0 rows and is diagnosed as `already_used`. The row lock serializes the race.

```sql
-- second barrier: one redemption row per coupon, ever.
alter table public.coupon_redemptions
  add constraint coupon_redemptions_code_uniq unique (coupon_code_id);
```

### 6.4 Key rotation via qr_key_id

- Each coupon embeds `kid` (`qr_key_id`). The verifier selects the HMAC secret / Ed25519 public key from a keymap indexed by `kid`.
- On rotation, generate a new keypair and a new `kid`. New coupons sign with the new key; scanners keep old public keys in the keymap so previously issued coupons still verify. Retire an old `kid` only after all coupons signed with it have expired.
- This makes rotation zero-downtime and lets a suspected key compromise be contained by rotating forward and revoking the compromised `kid`.

---

## 7. Admin 2FA, secrets management, rotation

### 7.1 Admin 2FA (TOTP / WebAuthn)

- All staff accounts (`admin`, `super_admin`, `support`) must have a second factor. Prefer WebAuthn (platform authenticator or security key, phishing-resistant); TOTP (RFC 6238, authenticator app) is the fallback.
- Enrollment uses Supabase Auth MFA. `requireAdminSession()` checks that the session's `aal` (authenticator assurance level) is `aal2` before any admin surface renders or any admin server action runs. A staff role without an enrolled factor is redirected to enrollment and cannot reach admin functions.
- Money-out actions (supplier payout mark-paid) additionally require `super_admin` role plus a recent second-factor step-up (re-verify within the last 15 minutes), so a merely open admin session cannot move money.

```ts
// step-up gate for sensitive admin operations
export async function requireRecentMfa(maxAgeSec = 900) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aal?.currentLevel !== 'aal2') throw new Error('mfa_required')
  // additionally assert the aal2 factor was verified within maxAgeSec
}
```

### 7.2 Secrets classification

Rule: any variable without a `NEXT_PUBLIC_` prefix is a server-only secret and must never appear in a client bundle.

| Secret | Sensitivity | Store | Notes |
|--------|-------------|-------|-------|
| `SUPABASE_SERVICE_ROLE_KEY` | Critical (RLS bypass = full DB) | Vercel env (server), Supabase dashboard | Only in the `adminClient` module; keep the caller count minimal; never imported by a client component. |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Vercel env, client OK | RLS enforces safety. |
| `CARDCOM_TERMINAL` / `CARDCOM_USERNAME` / `CARDCOM_API_NAME` / `CARDCOM_API_PASSWORD` | Critical (money) | Vercel env (server) | Only in `src/server/actions/payments/`. |
| `CARDCOM_WEBHOOK_SECRET` | Critical (webhook auth) | Vercel env (server) | HMAC verification of inbound webhooks. |
| `SUPPLIER_QR_SIGNING_KEY` | Critical (Ed25519 private + HMAC secret, coupon authenticity) | Vercel env (server) | Never leaves server; rotate via `qr_key_id`. |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | High (rate limiter) | Vercel env (server) | Limiter backend. |
| `CRON_SECRET` | High (job auth) | Vercel env (server) | Every cron route checks it. |

### 7.3 Vercel env scoping

- Three scopes: Production, Preview, Development, each with distinct values. Preview shares the dev Supabase project and dev Cardcom terminal, never the production ones.
- No secret is ever committed to git. `.env.local` is gitignored. Add `src/lib/env.ts` with a zod schema that fails fast at boot if a required server secret is missing or if a secret is accidentally prefixed `NEXT_PUBLIC_`.
- CI check: grep the built client bundle and fail the build if `SUPABASE_SERVICE_ROLE_KEY` (or any server secret) appears in it.

### 7.4 Rotation plan

| Secret | Cadence | Procedure | Zero-downtime |
|--------|---------|-----------|---------------|
| Supabase service_role / anon | Quarterly or on suspected leak | Rotate in Supabase dashboard, update Vercel env, redeploy off-peak | Brief |
| `CARDCOM_*` | Per PSP policy or on leak | Rotate with Cardcom, update env | Coordinate with PSP |
| `CARDCOM_WEBHOOK_SECRET` | Quarterly or on leak | Support old + new during cutover if Cardcom allows dual secrets, else rotate at low traffic | Short window |
| `SUPPLIER_QR_SIGNING_KEY` | Yearly or on leak | Generate a new keypair with a new `qr_key_id`; scanners keep the old public key so previously issued coupons still verify | Yes (kid-based) |
| `UPSTASH_REDIS_REST_TOKEN` | Quarterly or on leak | Rotate token in Upstash, update env, redeploy | Yes |
| `CRON_SECRET` | Quarterly | Rotate env, redeploy | Yes |

On any suspected service-role leak: rotate immediately, then audit `payment_webhook_events`, `wallet_entries`, and the audit log for the exposure window.

### 7.5 The wallet-minting lockdown (SEC-WALLET)

The `fn_wallet_transfer` draft was left with the default `PUBLIC EXECUTE` grant, meaning any authenticated user could call it directly and credit their own wallet. Because platform accounts are exempt from the non-negative floor, the debit side never blocked. The control is to remove all browser execute access and keep only service-role:

```sql
revoke all on function public.fn_wallet_transfer(uuid, uuid, bigint, text, text)
  from public, anon, authenticated;
grant execute on function public.fn_wallet_transfer(uuid, uuid, bigint, text, text)
  to service_role;
```

Defense in depth (follow-up code task, requires recreating the function body): add an in-function guard that rejects any transfer whose credit account is a user account when `auth.uid()` is non-null and not an admin, so a future accidental re-grant stays safe.
