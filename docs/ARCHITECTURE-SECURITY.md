# ARCHITECTURE-SECURITY.md

KenyonExpress **security architecture** (binding RLS + edge controls).

Status: BINDING · worktree `/Users/ofir/kenyonexpress-web/ke-arch-security` · branch `arch/security` (2026-07-30)
Scope: **docs only.** No application code applied in this change.
Companions: `docs/ARCHITECTURE-SECURITY-COMPLIANCE.md` (ke-arch), `docs/ARCHITECTURE-CART-CHECKOUT.md`, cardcom-payments skill.

Stack: Supabase Postgres RLS, Next.js Server Actions / Route Handlers, Cardcom webhooks, Upstash Redis rate limits (target), Vercel env secrets.

---

## 0. Principles

1. **RLS is the data boundary.** App checks are necessary, not sufficient.
2. **Roles in this matrix:** `anon`, `authenticated` (customer JWT), `supplier` (authenticated + active `supplier_members`), `admin` (staff via service-role after `requireAdminSession`, not a PostgREST write role).
3. **`service_role` only inside server code** (Server Actions, webhooks, crons) after an explicit gate. Never in client bundles, never in RLS policies as a "role the browser can become".
4. **Money tables: zero authenticated INSERT/UPDATE/DELETE policies.** Writes via `SECURITY DEFINER` RPCs or service-role finalize.
5. **PAN never on our origin.** Cardcom Low Profile / tokens only (SAQ-A).
6. **Secrets live in Vercel** (and Supabase vault). Not in git, not in `NEXT_PUBLIC_*` except publishable keys.
7. Inventory below is the **33-table binding set** used across arch docs (catalog + commerce). Live DB may have more tables; same rules apply by group.

### Legend

| Cell | Meaning |
|---|---|
| `-` | no policy / denied |
| `pub` | published / active public read |
| `own` | `auth.uid()` owner |
| `own!` | own update with pinned `role` |
| `own*` | own select **excluding** `cardcom_token` column |
| `mem` | active `supplier_members` scope |
| `svc` | service_role after server gate (no client policy) |
| `def` | `SECURITY DEFINER` RPC only |
| `soft` | soft-delete (`deleted_at`) |

---

## 1. Role model

| Logical role | How it is established | DB identity |
|---|---|---|
| `anon` | no session | PostgREST `anon` |
| `authenticated` / customer | Supabase Google/OTP session | `authenticated` + `profiles.role` typically `customer` |
| `supplier` | same JWT + row in `supplier_members` (`is_active`) | still `authenticated`; scope via helpers |
| `admin` | `profiles.role IN ('admin','super_admin','support',...)` checked in app; **writes use service_role** | helpers `is_admin()` for SELECT policies only |
| `service_role` | server secret | bypasses RLS; must be gated in code |

Helpers (SECURITY DEFINER, `search_path = public`):

```sql
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role::text IN ('admin', 'super_admin', 'support')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_supplier_member(p_supplier_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.supplier_members sm
    WHERE sm.supplier_id = p_supplier_id
      AND sm.user_id = auth.uid()
      AND sm.is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_supplier_owner(p_supplier_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.supplier_members sm
    WHERE sm.supplier_id = p_supplier_id
      AND sm.user_id = auth.uid()
      AND sm.is_active = true
      AND sm.role::text IN ('owner')
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_supplier_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_supplier_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_supplier_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_supplier_owner(uuid) TO authenticated;
```

---

## 2. RLS matrix: 33 tables × SELECT/INSERT/UPDATE/DELETE

Columns: **S / I / U / D** per role.

| # | Table | Group | anon S/I/U/D | authenticated S/I/U/D | supplier S/I/U/D | admin S/I/U/D |
|---|---|---|---|---|---|---|
| 1 | `profiles` | identity | `-`/`-`/`-`/`-` | `own`/`-`/`own!`/`-` | `own`/`-`/`own!`/`-` | `all`/`svc`/`svc`/`svc` |
| 2 | `suppliers` | supplier | `pub-lite`/`-`/`-`/`-` | `pub-lite`/`-`/`-`/`-` | `mem`/`-`/`owner-lim`/`-` | `all`/`svc`/`svc`/`svc` |
| 3 | `vendors` | legacy | `-`/`-`/`-`/`-` | `-`/`-`/`-`/`-` | `-`/`-`/`-`/`-` | `all`/`svc`/`svc`/`svc` |
| 4 | `supplier_members` | supplier | `-`/`-`/`-`/`-` | `self`/`-`/`-`/`-` | `mem`/`owner`/`owner`/`owner` | `all`/`svc`/`svc`/`svc` |
| 5 | `categories` | catalog | `pub`/`-`/`-`/`-` | `pub`/`-`/`-`/`-` | `pub`/`-`/`-`/`-` | `all`/`svc`/`svc`/`svc` |
| 6 | `products` | catalog | `pub`/`-`/`-`/`-` | `pub`/`-`/`-`/`-` | `pub+mem`/`-`/`mem*`/`-` | `all`/`svc`/`svc`/`svc` |
| 7 | `product_variants` | catalog | `pub`/`-`/`-`/`-` | `pub`/`-`/`-`/`-` | `pub+own`/`-`/`own-cat`/`-` | `all`/`svc`/`svc`/`svc` |
| 8 | `product_images` | catalog | `pub`/`-`/`-`/`-` | `pub`/`-`/`-`/`-` | `pub+own`/`-`/`own-cat`/`-` | `all`/`svc`/`svc`/`svc` |
| 9 | `product_categories` | catalog | `pub`/`-`/`-`/`-` | `pub`/`-`/`-`/`-` | `pub`/`-`/`-`/`-` | `all`/`svc`/`svc`/`svc` |
| 10 | `attribute_definitions` | catalog | `pub`/`-`/`-`/`-` | `pub`/`-`/`-`/`-` | `pub`/`-`/`-`/`-` | `all`/`svc`/`svc`/`svc` |
| 11 | `category_attributes` | catalog | `pub`/`-`/`-`/`-` | `pub`/`-`/`-`/`-` | `pub`/`-`/`-`/`-` | `all`/`svc`/`svc`/`svc` |
| 12 | `product_attribute_values` | catalog | `pub`/`-`/`-`/`-` | `pub`/`-`/`-`/`-` | `pub`/`-`/`-`/`-` | `all`/`svc`/`svc`/`svc` |
| 13 | `coupons` | legacy | `-`/`-`/`-`/`-` | `pub`/`-`/`-`/`-` | `-`/`-`/`-`/`-` | `all`/`svc`/`svc`/`svc` |
| 14 | `vouchers` | commerce | `-`/`-`/`-`/`-` | `own`/`-`/`-`/`-` | `redeemed-mem`/`-`/`-`/`-` | `all`/`def`/`def`/`def` |
| 15 | `coupon_deals` | legacy | `pub`/`-`/`-`/`-` | `pub`/`-`/`-`/`-` | `-`/`-`/`-`/`-` | `all`/`svc`/`svc`/`svc` |
| 16 | `orders` | money | `-`/`-`/`-`/`-` | `own`/`-`/`-`/`-` | `ord-mem`/`-`/`-`/`-` | `svc`/`svc`/`svc`/`svc` |
| 17 | `order_items` | money | `-`/`-`/`-`/`-` | `via-order`/`-`/`-`/`-` | `item-mem`/`-`/`-`/`-` | `svc`/`svc`/`svc`/`svc` |
| 18 | `carts` | cart | `-`/`svc-guest`/`svc-guest`/`svc-guest` | `own`/`own`/`own`/`own` | `own`/`own`/`own`/`own` | `svc`/`svc`/`svc`/`svc` |
| 19 | `cart_items` | cart | `-`/`svc-guest`/`svc-guest`/`svc-guest` | `own`/`own`/`own`/`own` | `own`/`own`/`own`/`own` | `svc`/`svc`/`svc`/`svc` |
| 20 | `wallet_accounts` | money | `-`/`-`/`-`/`-` | `own`/`-`/`-`/`-` | `-`/`-`/`-`/`-` | `svc`/`svc`/`svc`/`svc` |
| 21 | `wallet_entries` | money | `-`/`-`/`-`/`-` | `own`/`-`/`-`/`-` | `-`/`-`/`-`/`-` | `svc`/`svc`/`svc`/`svc` |
| 22 | `payments` | money | `-`/`-`/`-`/`-` | `own`/`-`/`-`/`-` | `-`/`-`/`-`/`-` | `svc`/`svc`/`svc`/`svc` |
| 23 | `payment_tokens` | money | `-`/`-`/`-`/`-` | `own*`/`-`/`-`/`own` | `-`/`-`/`-`/`-` | `meta`/`svc`/`svc`/`svc` |
| 24 | `user_addresses` | pii | `-`/`-`/`-`/`-` | `own`/`own`/`own`/`soft` | `own`/`own`/`own`/`soft` | `svc`/`svc`/`svc`/`svc` |
| 25 | `audit_log` | audit | `-`/`-`/`-`/`-` | `-`/`-`/`-`/`-` | `-`/`-`/`-`/`-` | `all`/`def`/`-`/`-` |
| 26 | `admin_audit_log` | audit | `-`/`-`/`-`/`-` | `-`/`-`/`-`/`-` | `-`/`-`/`-`/`-` | `all`/`def`/`-`/`-` |
| 27 | `referrals` | growth | `-`/`-`/`-`/`-` | `own`/`own-lim`/`-`/`-` | `-`/`-`/`-`/`-` | `all`/`svc`/`svc`/`svc` |
| 28 | `affiliates` | growth | `-`/`-`/`-`/`-` | `own`/`own-lim`/`-`/`-` | `-`/`-`/`-`/`-` | `all`/`svc`/`svc`/`svc` |
| 29 | `user_rate_limits` | ops | `-`/`-`/`-`/`-` | `-`/`-`/`-`/`-` | `-`/`-`/`-`/`-` | `svc`/`svc`/`svc`/`svc` |
| 30 | `seo_redirects` | seo | `pub`/`-`/`-`/`-` | `pub`/`-`/`-`/`-` | `pub`/`-`/`-`/`-` | `all`/`svc`/`svc`/`svc` |
| 31 | `notifications_outbox` | notify | `-`/`-`/`-`/`-` | `own`/`-`/`read_at`/`-` | `own`/`-`/`read_at`/`-` | `all`/`svc`/`svc`/`svc` |
| 32 | `notification_log` | notify | `-`/`-`/`-`/`-` | `-`/`-`/`-`/`-` | `-`/`-`/`-`/`-` | `svc`/`svc`/`svc`/`svc` |
| 33 | `payment_webhook_events` | money | `-`/`-`/`-`/`-` | `-`/`-`/`-`/`-` | `-`/`-`/`-`/`-` | `svc`/`svc`/`svc`/`svc` |

Notes:

- `admin` **S=`all`/`svc`** means SELECT may use `is_admin()` policies **or** service-role reads after session gate. Prefer service for money joins.
- Guest cart writes (`anon` `svc-guest`) are Server Actions with service_role keyed by HttpOnly `ke_session_id`, never an open anon INSERT policy.
- `vouchers` writes are redeem/issue RPCs (`def`), never client UPDATE.

---

## 3. service_role usage (binding)

| Allowed | Forbidden |
|---|---|
| Cardcom webhook finalize | Any `createBrowserClient` with service key |
| Guest cart Server Actions | Shipping service key in `NEXT_PUBLIC_*` |
| Admin mutations after `requireAdminSession` | Client components importing `adminClient` |
| Cron / reconcile routes with cron secret | Edge middleware calling money writes without audit |
| Checkout begin/finalize internals | Trusting client-sent totals without re-price |

```typescript
// src/lib/supabase/admin.ts (contract)
import { createClient } from '@supabase/supabase-js'

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing service role env')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

// NEVER:
// export const supabase = createAdminClient() // module scope in a 'use client' file
```

---

## 4. Cardcom webhook: signature verification

Route: `POST /api/payments/cardcom/webhook`

Pipeline:

1. Read raw body (text).
2. Persist raw event to `payment_webhook_events` with UNIQUE `(provider, external_event_id)` (idempotency).
3. Verify signature / shared secret header (Cardcom Low Profile Indicator + server-to-server Deal confirm).
4. On invalid signature: log `signature_valid=false`, return 200/401 per ops choice (**prefer 401** for forgeries; still store event).
5. On valid: `createAdminClient()` finalize payment (paid → issue vouchers) idempotently.

```typescript
// src/server/payments/cardcom-webhook-verify.ts
import { createHmac, timingSafeEqual } from 'node:crypto'

export function verifyCardcomWebhookSignature(input: {
  rawBody: string
  headerSignature: string | null
  secret: string
}): boolean {
  if (!input.headerSignature) return false
  const expected = createHmac('sha256', input.secret).update(input.rawBody, 'utf8').digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(input.headerSignature)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

// src/app/api/payments/cardcom/webhook/route.ts (excerpt)
export async function POST(req: Request) {
  const rawBody = await req.text()
  const signature = req.headers.get('x-cardcom-signature') // adapt to Cardcom's actual header
  const secret = process.env.CARDCOM_WEBHOOK_SECRET
  if (!secret) return new Response('misconfigured', { status: 500 })

  const ok = verifyCardcomWebhookSignature({ rawBody, headerSignature: signature, secret })
  // 1) insert payment_webhook_events (unique)
  // 2) if !ok → audit + return 401
  // 3) server-to-server GetLowProfileIndicator / deal verify
  // 4) finalizePaymentSettled(idempotent)
  return new Response('ok', { status: 200 })
}
```

Binding: **never** mark order paid from Indicator URL alone without webhook or pull-verify.

---

## 5. Rate limiting

| Path | Key | Limit | On RPC/Redis failure |
|---|---|---|---|
| `beginCheckout` / pay | user id | 10 / 10 min | **fail-closed** |
| voucher redeem / scan | user id | 30 / 60 s | **fail-closed** |
| login / OTP | IP + email | 5 / hour | fail-closed |
| autocomplete | IP | 120 / min | fail-open |
| Cardcom webhook | IP | 300 / min | fail-open (still verify sig) |
| account deletion request | user | 3 / day | fail-closed |

Target helper: Upstash Redis. Postgres `check_user_rate_limit` remains acceptable for DB-bound RPCs.

```typescript
// src/lib/security/rate-limit.ts (target)
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const redis = Redis.fromEnv()

export const moneyLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '10 m'),
  prefix: 'rl:money',
})

export async function assertMoneyRateLimit(userId: string): Promise<void> {
  try {
    const { success } = await moneyLimiter.limit(userId)
    if (!success) throw new Error('RATE_LIMITED')
  } catch (e) {
    if (e instanceof Error && e.message === 'RATE_LIMITED') throw e
    // fail-closed for money
    throw new Error('RATE_LIMIT_UNAVAILABLE')
  }
}
```

---

## 6. CSRF

Next.js Server Actions already require same-origin `Origin` / `Host` checks for POST mutations in App Router.

Additional binding rules:

1. Mutations that change money or PII are **Server Actions** or authenticated Route Handlers, not public GET.
2. Cross-site form posts to Server Actions must fail Origin check.
3. Webhooks are server-to-server: **no CSRF token**; auth is signature + secret.
4. Cookie session: `SameSite=Lax` (or `Strict` for admin), `Secure`, `HttpOnly`.
5. For custom POST Route Handlers used by the browser, require:

```typescript
export function assertSameOrigin(req: Request) {
  const origin = req.headers.get('origin')
  const host = req.headers.get('host')
  if (!origin || !host) throw new Error('CSRF')
  const expected = `https://${host}`
  // also allow http://localhost:* in development only
  if (origin !== expected && process.env.NODE_ENV === 'production') {
    throw new Error('CSRF')
  }
}
```

---

## 7. Secrets on Vercel

| Secret | Where | Public? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel | yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel | yes (RLS-bound) |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel server | **no** |
| `CARDCOM_API_NAME` / `CARDCOM_API_PASSWORD` | Vercel server | **no** |
| `CARDCOM_WEBHOOK_SECRET` | Vercel server | **no** |
| `CARDCOM_QR_HMAC_SECRET` | Vercel server | **no** |
| `CRON_SECRET` | Vercel server | **no** |
| `UPSTASH_REDIS_REST_URL` / `TOKEN` | Vercel server | **no** |
| `RESEND_API_KEY` | Vercel server | **no** |

Rotation plan:

1. Rotate Cardcom password + webhook secret quarterly or on staff offboarding.
2. Rotate service role via Supabase dashboard; redeploy Vercel immediately.
3. Never commit `.env.local`. Use Vercel Preview env separation from Production.

---

## 8. Full SQL: missing / hardening policies

Draft migration path:

`supabase/migrations/086_security_rls_33_tables.sql`

```sql
-- 086_security_rls_33_tables.sql
-- Idempotent hardening for the 33-table binding inventory.
-- DROP POLICY IF EXISTS + CREATE POLICY throughout.

-- ========== helpers (safe recreate) ==========
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role::text IN ('admin', 'super_admin', 'support')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_supplier_member(p_supplier_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.supplier_members sm
    WHERE sm.supplier_id = p_supplier_id
      AND sm.user_id = auth.uid()
      AND coalesce(sm.is_active, true) = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_supplier_owner(p_supplier_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.supplier_members sm
    WHERE sm.supplier_id = p_supplier_id
      AND sm.user_id = auth.uid()
      AND coalesce(sm.is_active, true) = true
      AND sm.role::text IN ('owner')
  );
$$;

-- ========== 1 profiles ==========
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_owner_select ON public.profiles;
CREATE POLICY profiles_owner_select ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS profiles_owner_update ON public.profiles;
CREATE POLICY profiles_owner_update ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role IS NOT DISTINCT FROM (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid())
  );

-- ========== 2 suppliers ==========
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS suppliers_public_read ON public.suppliers;
CREATE POLICY suppliers_public_read ON public.suppliers
  FOR SELECT TO anon, authenticated
  USING (deleted_at IS NULL);  -- keep columns minimal in views if needed

DROP POLICY IF EXISTS suppliers_member_read ON public.suppliers;
CREATE POLICY suppliers_member_read ON public.suppliers
  FOR SELECT TO authenticated
  USING (public.is_supplier_member(id) OR public.is_admin());

-- ========== 3 vendors (legacy) ==========
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendors FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vendors_admin_all ON public.vendors;
CREATE POLICY vendors_admin_all ON public.vendors
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ========== 4 supplier_members ==========
ALTER TABLE public.supplier_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_members FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS supplier_members_self_select ON public.supplier_members;
CREATE POLICY supplier_members_self_select ON public.supplier_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_supplier_owner(supplier_id) OR public.is_admin());

DROP POLICY IF EXISTS supplier_members_owner_write ON public.supplier_members;
CREATE POLICY supplier_members_owner_write ON public.supplier_members
  FOR ALL TO authenticated
  USING (public.is_supplier_owner(supplier_id) OR public.is_admin())
  WITH CHECK (public.is_supplier_owner(supplier_id) OR public.is_admin());

-- ========== 5 categories ==========
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS categories_public_read ON public.categories;
CREATE POLICY categories_public_read ON public.categories
  FOR SELECT TO anon, authenticated
  USING (coalesce(is_active, true) = true AND deleted_at IS NULL);

-- ========== 6 products ==========
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS products_public_read ON public.products;
CREATE POLICY products_public_read ON public.products
  FOR SELECT TO anon, authenticated
  USING (status = 'active'::public.product_status AND deleted_at IS NULL);

DROP POLICY IF EXISTS products_supplier_select ON public.products;
CREATE POLICY products_supplier_select ON public.products
  FOR SELECT TO authenticated
  USING (public.is_supplier_member(supplier_id) OR public.is_admin());

-- No authenticated UPDATE of money knobs: supplier catalog edits go through
-- Server Action that strips platform_percent / coupon_price_* or uses service.
DROP POLICY IF EXISTS products_supplier_update_nonmoney ON public.products;
-- Intentionally omitted broad UPDATE. Prefer service_role after supplier session.

-- ========== 7-12 catalog children ==========
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS product_variants_public_read ON public.product_variants;
CREATE POLICY product_variants_public_read ON public.product_variants
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_variants.product_id
      AND p.status = 'active'::public.product_status
      AND p.deleted_at IS NULL
  ));

ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS product_images_public_read ON public.product_images;
CREATE POLICY product_images_public_read ON public.product_images
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_images.product_id
      AND p.status = 'active'::public.product_status
      AND p.deleted_at IS NULL
  ));

ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS product_categories_public_read ON public.product_categories;
CREATE POLICY product_categories_public_read ON public.product_categories
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_categories.product_id
      AND p.status = 'active'::public.product_status
      AND p.deleted_at IS NULL
  ));

ALTER TABLE public.attribute_definitions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS attribute_definitions_public_read ON public.attribute_definitions;
CREATE POLICY attribute_definitions_public_read ON public.attribute_definitions
  FOR SELECT TO anon, authenticated USING (true);

ALTER TABLE public.category_attributes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS category_attributes_public_read ON public.category_attributes;
CREATE POLICY category_attributes_public_read ON public.category_attributes
  FOR SELECT TO anon, authenticated USING (true);

ALTER TABLE public.product_attribute_values ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS product_attribute_values_public_read ON public.product_attribute_values;
CREATE POLICY product_attribute_values_public_read ON public.product_attribute_values
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_attribute_values.product_id
      AND p.status = 'active'::public.product_status
      AND p.deleted_at IS NULL
  ));

-- ========== 13 coupons legacy ==========
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS coupons_admin_only ON public.coupons;
CREATE POLICY coupons_admin_only ON public.coupons
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ========== 14 vouchers ==========
ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vouchers FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vouchers_owner_read ON public.vouchers;
CREATE POLICY vouchers_owner_read ON public.vouchers
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS vouchers_supplier_redeemed_read ON public.vouchers;
CREATE POLICY vouchers_supplier_redeemed_read ON public.vouchers
  FOR SELECT TO authenticated
  USING (
    status::text IN ('used', 'redeemed')
    AND public.is_supplier_member(redeemed_by_supplier_id)
  );
-- no INSERT/UPDATE/DELETE for authenticated

-- ========== 15 coupon_deals ==========
ALTER TABLE public.coupon_deals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS coupon_deals_public_read ON public.coupon_deals;
CREATE POLICY coupon_deals_public_read ON public.coupon_deals
  FOR SELECT TO anon, authenticated
  USING (coalesce(is_active, true) = true);

-- ========== 16-17 orders / order_items ==========
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS orders_owner_read ON public.orders;
CREATE POLICY orders_owner_read ON public.orders
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS orders_supplier_read ON public.orders;
CREATE POLICY orders_supplier_read ON public.orders
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.order_items oi
    WHERE oi.order_id = orders.id
      AND public.is_supplier_member(oi.supplier_id)
  ));
-- no client writes

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS order_items_owner_read ON public.order_items;
CREATE POLICY order_items_owner_read ON public.order_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id AND (o.user_id = auth.uid() OR public.is_admin())
  ));

DROP POLICY IF EXISTS order_items_supplier_read ON public.order_items;
CREATE POLICY order_items_supplier_read ON public.order_items
  FOR SELECT TO authenticated
  USING (public.is_supplier_member(supplier_id));

-- ========== 18-19 carts / cart_items ==========
ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS carts_owner_all ON public.carts;
CREATE POLICY carts_owner_all ON public.carts
  FOR ALL TO authenticated
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());
-- guest carts: service_role only (no anon policy)

ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cart_items_owner_all ON public.cart_items;
CREATE POLICY cart_items_owner_all ON public.cart_items
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.carts c
    WHERE c.id = cart_items.cart_id AND c.profile_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.carts c
    WHERE c.id = cart_items.cart_id AND c.profile_id = auth.uid()
  ));

-- ========== 20-21 wallet ==========
ALTER TABLE public.wallet_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_accounts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wallet_accounts_owner_read ON public.wallet_accounts;
CREATE POLICY wallet_accounts_owner_read ON public.wallet_accounts
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

ALTER TABLE public.wallet_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_entries FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wallet_entries_owner_read ON public.wallet_entries;
CREATE POLICY wallet_entries_owner_read ON public.wallet_entries
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.wallet_accounts a
      WHERE (a.id = wallet_entries.debit_account OR a.id = wallet_entries.credit_account)
        AND a.user_id = auth.uid()
    )
  );
-- REVOKE EXECUTE on fn_wallet_transfer FROM PUBLIC; GRANT TO service_role only

-- ========== 22 payments ==========
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payments_owner_read ON public.payments;
CREATE POLICY payments_owner_read ON public.payments
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = payments.order_id AND o.user_id = auth.uid()
    )
  );

-- ========== 23 payment_tokens ==========
ALTER TABLE public.payment_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_tokens FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payment_tokens_owner_select ON public.payment_tokens;
CREATE POLICY payment_tokens_owner_select ON public.payment_tokens
  FOR SELECT TO authenticated
  USING (profile_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS payment_tokens_owner_delete ON public.payment_tokens;
CREATE POLICY payment_tokens_owner_delete ON public.payment_tokens
  FOR DELETE TO authenticated
  USING (profile_id = auth.uid());

REVOKE ALL ON COLUMN public.payment_tokens.cardcom_token FROM anon, authenticated;
GRANT SELECT (id, profile_id, last_4, card_brand, expiry_month, expiry_year, is_default, created_at)
  ON public.payment_tokens TO authenticated;

-- ========== 24 user_addresses ==========
ALTER TABLE public.user_addresses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_addresses_owner_all ON public.user_addresses;
CREATE POLICY user_addresses_owner_all ON public.user_addresses
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ========== 25-26 audit ==========
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_log_admin_select ON public.audit_log;
CREATE POLICY audit_log_admin_select ON public.audit_log
  FOR SELECT TO authenticated USING (public.is_admin());
-- inserts via definer only

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_audit_log_admin_select ON public.admin_audit_log;
CREATE POLICY admin_audit_log_admin_select ON public.admin_audit_log
  FOR SELECT TO authenticated USING (public.is_admin());

-- ========== 27-28 growth ==========
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS referrals_owner_select ON public.referrals;
CREATE POLICY referrals_owner_select ON public.referrals
  FOR SELECT TO authenticated
  USING (referrer_id = auth.uid() OR referred_id = auth.uid() OR public.is_admin());

ALTER TABLE public.affiliates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS affiliates_owner_select ON public.affiliates;
CREATE POLICY affiliates_owner_select ON public.affiliates
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

-- ========== 29 rate limits ==========
ALTER TABLE public.user_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_rate_limits FORCE ROW LEVEL SECURITY;
-- zero client policies: default deny; definer/service only

-- ========== 30 seo_redirects ==========
ALTER TABLE public.seo_redirects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS seo_redirects_public_read ON public.seo_redirects;
CREATE POLICY seo_redirects_public_read ON public.seo_redirects
  FOR SELECT TO anon, authenticated USING (true);

-- ========== 31 notifications_outbox ==========
ALTER TABLE public.notifications_outbox ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notifications_outbox_owner_select ON public.notifications_outbox;
CREATE POLICY notifications_outbox_owner_select ON public.notifications_outbox
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS notifications_outbox_owner_mark_read ON public.notifications_outbox;
CREATE POLICY notifications_outbox_owner_mark_read ON public.notifications_outbox
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ========== 32 notification_log ==========
ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_log FORCE ROW LEVEL SECURITY;
-- zero client policies

-- ========== 33 payment_webhook_events ==========
ALTER TABLE public.payment_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_webhook_events FORCE ROW LEVEL SECURITY;
-- zero client policies; service_role webhook only

-- Wallet transfer lockdown (SEC-WALLET)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_wallet_transfer'
  ) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.fn_wallet_transfer FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.fn_wallet_transfer TO service_role';
  END IF;
END $$;
```

---

## 9. Acceptance checklist

- [ ] All 33 tables have RLS enabled (FORCE on money/PII)
- [ ] Matrix matches live policies (or 086 applied)
- [ ] `cardcom_token` not selectable by `authenticated`
- [ ] Webhook rejects bad signatures
- [ ] Money rate limits fail-closed
- [ ] `SUPABASE_SERVICE_ROLE_KEY` only on Vercel server env
- [ ] No anon INSERT on guest carts (service path only)
- [ ] CSRF/same-origin on browser POST handlers

---

## 10. Open questions

1. Exact Cardcom signature header name for production Low Profile webhooks?
2. Should `support` role get SELECT-only admin policies without service_role?
3. `cart_items` vs JSONB `carts.items`: which is canonical for RLS?


---

## 11. Threat model (summary)

| Surface | Threat | Control |
|---|---|---|
| Guest cart | forge session | opaque HttpOnly cookie + service-role writes |
| Checkout | amount tamper | server re-price; ignore client totals |
| Webhook | forged paid | HMAC/signature + Deal verify + idempotency |
| Saved card | token theft | column revoke + charge only server-side |
| Supplier scan | double redeem | conditional UPDATE issued→used |
| Admin JWT | PostgREST money write | no client money write policies |
| Autocomplete | scrape / DoS | IP rate limit |
| Secrets | leak in bundle | Vercel server env only |

---

## 12. Proxy / layout guards (TypeScript)

```typescript
// src/proxy.ts (excerpt contract)
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookies) => {
          for (const c of cookies) response.cookies.set(c.name, c.value)
        },
      },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname
  if (path.startsWith('/account') || path.startsWith('/checkout') || path.startsWith('/admin') || path.startsWith('/supplier')) {
    if (!user) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.set('next', path)
      return NextResponse.redirect(url)
    }
  }

  // admin role check is NOT done only here; requireAdminSession still required
  return response
}
```

```typescript
// src/lib/admin/rbac.ts (excerpt)
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function requireAdminSession() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/admin')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  const role = profile?.role
  if (!role || !['admin', 'super_admin', 'support'].includes(role)) {
    redirect('/')
  }
  return { userId: user.id, role }
}
```

---

## 13. Cron route secret

```typescript
// src/app/api/cron/reconcile/route.ts (contract)
export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('unauthorized', { status: 401 })
  }
  // service_role reconcile...
  return Response.json({ ok: true })
}
```

---

## 14. Policy audit queries (ops)

```sql
-- Tables in public without RLS
SELECT c.relname
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND NOT c.relrowsecurity
ORDER BY 1;

-- Policies per table
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- Dangerous: authenticated EXECUTE on money functions
SELECT n.nspname, p.proname
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_proc_acl /* conceptual */ ON false
WHERE n.nspname = 'public'
  AND p.proname ILIKE '%wallet%';
```

---

## 15. Acceptance (expanded)

- [ ] `SELECT` matrix verified for all 33 tables
- [ ] Money tables: zero authenticated write policies confirmed via `pg_policies`
- [ ] Webhook unit test: bad signature rejected
- [ ] Webhook unit test: replay same `external_event_id` does not double-finalize
- [ ] Guest cannot INSERT into `carts` with anon key alone
- [ ] Customer cannot UPDATE `profiles.role` to admin
- [ ] Customer cannot SELECT `payment_tokens.cardcom_token`
- [ ] Supplier cannot UPDATE `products.platform_percent` via PostgREST
- [ ] Vercel production env has no service role in `NEXT_PUBLIC_*`
- [ ] Rate limit fail-closed on checkout + redeem

---

## 16. Related paths

```
supabase/migrations/086_security_rls_33_tables.sql
src/lib/supabase/admin.ts
src/lib/security/rate-limit.ts
src/server/payments/cardcom-webhook-verify.ts
src/app/api/payments/cardcom/webhook/route.ts
src/proxy.ts
src/lib/admin/rbac.ts
```
