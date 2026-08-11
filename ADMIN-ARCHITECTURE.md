# ADMIN-ARCHITECTURE.md

KenyonExpress production admin dashboard architecture.

Status: BINDING for `arch/admin-supplier` (2026-07-27)
Stack: Next.js App Router (`src/app/(admin)`), Supabase Postgres + RLS, Cardcom, Server Actions + Route Handlers
Money: agorot integers internally; ILS with 2 decimals on the wire (`*_ils`)

This document decides. Where it conflicts with older drafts that mention fixed 10%/5% commission or external Escrow, the final business rules below win.

---

## 0. Final business rules (admin must enforce)

| Rule | Detail |
|---|---|
| Coupon online charge | Absolute `products.coupon_price_ils` set by admin. Not a percent. No default. |
| Coupon at business | Customer pays `price_ils - coupon_price_ils` at redemption. |
| Coupon platform take | 100% of the online coupon charge stays with the platform. Supplier gets 0 from the platform for coupons. |
| Physical online charge | Full `price_ils` at checkout. |
| Physical split | `order_items.platform_percent` snapshot at purchase (required, no default). Platform keeps that percent; supplier payout is the remainder after T+3 business days and min 100 ILS. |
| Escrow | None. Held is an internal ledger flag only. |
| Supplier on PDP | Every product page shows supplier identity / location fields. Admin form must require them for publish. |
| Catalog scope (launch) | Coupons first. Physical product type remains in schema and admin UI. |

---

## 1. Roles and section matrix

Postgres enum `user_role`: `customer`, `content_uploader`, `vendor`, `support`, `admin`, `super_admin`.

Admin UI gate: `requireAdminSession` / `requireSection` in `src/lib/admin/rbac.ts`. JWT role is a coarse gate only. Money writes never go through client RLS; they use the service-role client after the gate, or `SECURITY DEFINER` RPCs.

| Section | Route prefix | content_uploader | support | admin | super_admin |
|---|---|---|---|---|---|
| Dashboard / queues | `/admin/dashboard` | no | read | full | full |
| Products (coupon + physical) | `/admin/products` | draft catalog | read | full | full |
| Approvals | `/admin/approvals` | no | read | approve/reject | full |
| Coupons / codes / vouchers | `/admin/coupons` | no | read | full | full |
| Orders | `/admin/orders` | no | read | full | full |
| Payments / stuck | `/admin/payments` | no | read | full | full |
| Suppliers / applications | `/admin/suppliers` | no | read | full | full |
| Users / roles | `/admin/users` | no | read | role changes except elevating to super_admin | full |
| Affiliates | `/admin/affiliates` | no | read | full | full |
| Analytics | `/admin/analytics` | no | read (no PII export) | full | full |
| Audit log | `/admin/audit-log` | no | read | read | read |
| Payouts mark-paid | `/admin/payouts` | no | no | no | yes + recent auth |

Sensitive mutations require `requireRecentAuth(15)` (re-auth within 15 minutes): role elevation, wallet adjust, mark payout paid, force refund.

---

## 2. Product management (coupon + physical)

### 2.1 Shared fields (both types)

- Identity: `name_he`, `slug`, `short_description`, `description`, gallery
- Taxonomy: `category_id`, tags, geo (`city`, `area` / supplier location)
- Supplier: `supplier_id` (required for publish)
- Pricing surface: `price_ils` (face / list)
- Publish: `status` (`draft` / `pending_review` / `published` / `archived`), `offer_valid_until`
- Legal disclosure block (consumer protection): cancellation terms, business identity, expiry rules
- SEO: title, meta description, OG image

### 2.2 Coupon-only fields

| Field | Rule |
|---|---|
| `product_type = 'coupon'` | Discriminator |
| `coupon_price_ils` | Absolute online charge. `0 < coupon_price_ils <= price_ils`. Required to publish. |
| `coupon_expiry_days` | Canonical expiry name. Floor 120 days unless legal exception documented. |
| `platform_percent` | Must be stored as 100 for coupons (platform keeps online charge). UI hides percent splitter; DB CHECK enforces. |
| Redemption instructions | Shown on PDP and voucher PDF / wallet |

Admin UI labels (match live storefront language until copy is rewritten):

- מחיר רגיל → `price_ils`
- מחיר בקניון / לתשלום באתר → `coupon_price_ils`
- יתרה בבית העסק → computed `price_ils - coupon_price_ils` (display only)

### 2.3 Physical-only fields

| Field | Rule |
|---|---|
| `product_type = 'physical'` | Discriminator |
| `platform_percent` | Required, no default, 0 exclusive to 100 inclusive (admin-chosen). |
| Stock / variants | Inventory rows; out-of-stock blocks add-to-cart |
| Shipping class | Weight / dimensions / shipping profile |

### 2.4 Approval flow

```
draft -> pending_review -> published
                       \-> rejected (reason required) -> draft
published -> archived
```

Only `admin` / `super_admin` move `pending_review` → `published`. Content uploaders may create drafts and submit for review.

Every status transition writes `audit_log`.

---

## 3. Orders, payments, vouchers (admin views)

| Screen | Source of truth | Admin actions |
|---|---|---|
| Orders list / detail | `orders`, `order_items` | filter, note, force-cancel (pre-fulfillment), initiate refund |
| Payments / stuck | `payments`, webhook events | reconcile, retry finalize (idempotent) |
| Voucher codes | `vouchers` (canonical) | read-only status, expire sweep status, dispute open |
| Payout statements | `payout_statements` | super_admin mark paid after T+3 + min balance |

Refund rule: if any voucher on the order is `redeemed` or `expired`, card refund of that value is blocked. Admin UI must surface the blocker explicitly.

---

## 4. Supplier administration

- Applications queue: approve creates `suppliers` + `supplier_members(owner)` + syncs `profiles.role='vendor'`
- Reject requires reason; applicant may re-apply after cooldown
- Supplier detail: bank details (owner-only fields masked), team, products, redemptions, payout history
- Suspend supplier: sets `suppliers.status='suspended'`, unpublishes products, blocks redeem membership checks

---

## 5. UI / UX constraints

- Hebrew RTL admin shell (`dir="rtl"`)
- Server-rendered tables with cursor or keyset pagination (limit 1..50)
- No raw hex in components: design tokens only
- Touch targets >= 44px on mobile admin
- Empty states and error toasts in Hebrew
- Money columns always show ₪ with 2 decimals; never mix agorot into the UI

---

## 6. API endpoints (complete route table)

Transport rules:

1. Browser mutations and authenticated admin reads that are not pure RSC: **Server Actions** under `src/server/actions/admin/**`
2. Machine traffic (cron, webhooks): **Route Handlers** under `src/app/api/**`
3. Catalog / list pages: RSC direct queries with service-role after `requireSection`

Envelope for all new actions:

```ts
type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; details?: Record<string, unknown> } }
```

### 6.1 Server Actions (admin)

| Action | Path (module) | Auth | Input (Zod summary) | Output | Idempotency | Status |
|---|---|---|---|---|---|---|
| `listProducts` | `admin/products` | staff section `products` | `{ cursor?, limit?, status?, type?, q? }` | `{ items, next_cursor }` | n/a (read) | EXISTS / extend |
| `upsertProduct` | `admin/products` | admin | product form incl. `product_type`, prices, `supplier_id` | `{ id, slug }` | natural key `slug` | EXISTS |
| `archiveProduct` | `admin/products` | admin | `{ id }` | `{ id, status }` | by id | PLANNED |
| `approveProduct` | `admin/approvals` | admin | `{ id }` | `{ id, status }` | by id | EXISTS |
| `rejectProduct` | `admin/approvals` | admin | `{ id, reason }` | `{ id, status }` | by id | EXISTS |
| `upsertCouponDeal` | `admin/coupon-deals` | admin | deal form | `{ id }` | by id | EXISTS (legacy bridge) |
| `listOrders` | `admin/orders` | support+ | filters + cursor | page | n/a | EXISTS |
| `getOrder` | `admin/orders` | support+ | `{ id }` | detail DTO | n/a | EXISTS |
| `adminCancelOrder` | `admin/orders` | admin + recent auth | `{ id, reason }` | `{ id, status }` | `admin_cancel:{id}` | PLANNED |
| `adminRefundOrder` | `admin/orders` | admin + recent auth | `{ id, reason }` | refund result / blocker | `admin_refund:{id}:{attempt}` | PLANNED |
| `listVouchers` | `admin/vouchers` | support+ | filters | page | n/a | PLANNED |
| `listPayments` | `admin/payments` | support+ | filters | page | n/a | PARTIAL |
| `reconcilePayment` | `admin/payments` | admin | `{ order_id }` | finalize result | server key from order | PARTIAL |
| `listSuppliers` | `admin/vendors` | support+ | filters | page | n/a | EXISTS |
| `approveSupplierApplication` | `admin/vendors` | admin | `{ application_id }` | `{ supplier_id }` | by application id | PARTIAL |
| `rejectSupplierApplication` | `admin/vendors` | admin | `{ application_id, reason }` | `{ id }` | by application id | PARTIAL |
| `suspendSupplier` | `admin/vendors` | admin + recent auth | `{ supplier_id, reason }` | `{ id, status }` | by supplier id | PLANNED |
| `updateUserRole` | `admin/users` | admin (super_admin for elevating admins) + recent auth | `{ user_id, role }` | `{ user_id, role }` | by pair | EXISTS |
| `adminAdjustWallet` | `admin/users` | super_admin + recent auth | `{ user_id, delta_agorot, reason }` | ledger entry | client_ref UUID | PLANNED |
| `markPayoutStatementPaid` | `admin/payouts` | super_admin + recent auth | `{ statement_id }` | `{ id, status }` | by statement id | PLANNED |
| `processAndUploadImage` | `admin/images` | staff | file + product id | `{ url }` | content hash | EXISTS |

### 6.2 Route Handlers

| Method | Route | Auth | Purpose | Rate limit | Status |
|---|---|---|---|---|---|
| `POST` | `/api/payments/cardcom/webhook` | Cardcom signature | finalize paid orders, issue vouchers | fail-closed | EXISTS |
| `POST` | `/api/cron/expire-vouchers` | `Authorization: Bearer CRON_SECRET` | `expire_vouchers()` sweep | cron only | EXISTS |
| `POST` | `/api/cron/payout-statements` | `CRON_SECRET` | generate T+3 statements | cron only | PLANNED |
| `GET` | `/api/health` | none | liveness | open | PLANNED |
| `POST` | `/api/admin/revalidate` | admin session or deploy secret | on-demand ISR | 10/min | PLANNED |

Admin list pages themselves are RSC and do not expose public REST. Do not add a general `/api/admin/*` CRUD surface.

### 6.3 Error codes (admin subset)

`UNAUTHENTICATED`, `FORBIDDEN`, `VALIDATION`, `NOT_FOUND`, `CONFLICT`, `STATE_INVALID`, `EXPIRED`, `RATE_LIMITED`, `IDEMPOTENT_REPLAY`, `INTERNAL`.

Refund blocked by redeemed voucher → `STATE_INVALID` with `details.blocker = 'voucher_consumed'`.

---

## 7. Security and RLS (exact SQL)

### 7.1 Principles

1. Enable + force RLS on every public table.
2. Admin money writes: **no** permissive INSERT/UPDATE/DELETE policies for `authenticated`. Use service-role after `requireAdminSession()`.
3. Staff read of money tables: either service-role in RSC, or narrow `SELECT` policies keyed on `public.is_admin()` / `public.has_role('support')`.
4. Privilege pinning: users cannot UPDATE their own `profiles.role` or `profiles.supplier_id`.
5. Audit log: INSERT only via `SECURITY DEFINER` trigger / function; no client UPDATE/DELETE.

### 7.2 Helper functions

```sql
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('admin'::public.user_role, 'super_admin'::public.user_role)
  );
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'super_admin'::public.user_role
  );
$$;

CREATE OR REPLACE FUNCTION public.has_role(p_min public.user_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND CASE p_min
        WHEN 'support'::public.user_role THEN p.role IN (
          'support'::public.user_role,
          'admin'::public.user_role,
          'super_admin'::public.user_role
        )
        WHEN 'content_uploader'::public.user_role THEN p.role IN (
          'content_uploader'::public.user_role,
          'admin'::public.user_role,
          'super_admin'::public.user_role
        )
        WHEN 'admin'::public.user_role THEN p.role IN (
          'admin'::public.user_role,
          'super_admin'::public.user_role
        )
        WHEN 'super_admin'::public.user_role THEN
          p.role = 'super_admin'::public.user_role
        ELSE false
      END
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_role(public.user_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(public.user_role) TO authenticated;
```

### 7.3 Products (staff read; writes via service role in admin actions)

```sql
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS products_public_read_published ON public.products;
CREATE POLICY products_public_read_published
  ON public.products
  FOR SELECT
  TO anon, authenticated
  USING (status = 'published');

DROP POLICY IF EXISTS products_staff_read_all ON public.products;
CREATE POLICY products_staff_read_all
  ON public.products
  FOR SELECT
  TO authenticated
  USING (public.has_role('support'::public.user_role)
      OR public.has_role('content_uploader'::public.user_role));

-- No INSERT/UPDATE/DELETE policies for authenticated.
-- Admin Server Actions use service_role after requireAdminSession().
```

### 7.4 Orders / order_items / payments (staff read only)

```sql
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS orders_customer_read_own ON public.orders;
CREATE POLICY orders_customer_read_own
  ON public.orders
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS orders_staff_read_all ON public.orders;
CREATE POLICY orders_staff_read_all
  ON public.orders
  FOR SELECT
  TO authenticated
  USING (public.has_role('support'::public.user_role));

-- order_items
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS order_items_customer_read_own ON public.order_items;
CREATE POLICY order_items_customer_read_own
  ON public.order_items
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS order_items_staff_read_all ON public.order_items;
CREATE POLICY order_items_staff_read_all
  ON public.order_items
  FOR SELECT
  TO authenticated
  USING (public.has_role('support'::public.user_role));

-- payments
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payments_customer_read_own ON public.payments;
CREATE POLICY payments_customer_read_own
  ON public.payments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = payments.order_id
        AND o.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS payments_staff_read_all ON public.payments;
CREATE POLICY payments_staff_read_all
  ON public.payments
  FOR SELECT
  TO authenticated
  USING (public.has_role('support'::public.user_role));
```

### 7.5 Vouchers (staff read; redeem only via RPC)

```sql
ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vouchers FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vouchers_customer_read_own ON public.vouchers;
CREATE POLICY vouchers_customer_read_own
  ON public.vouchers
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS vouchers_supplier_read_own ON public.vouchers;
CREATE POLICY vouchers_supplier_read_own
  ON public.vouchers
  FOR SELECT
  TO authenticated
  USING (
    supplier_id IN (
      SELECT sm.supplier_id
      FROM public.supplier_members sm
      WHERE sm.user_id = auth.uid()
        AND sm.is_active
    )
  );

DROP POLICY IF EXISTS vouchers_staff_read_all ON public.vouchers;
CREATE POLICY vouchers_staff_read_all
  ON public.vouchers
  FOR SELECT
  TO authenticated
  USING (public.has_role('support'::public.user_role));

-- Redemption writes: ONLY public.redeem_voucher() (SECURITY DEFINER).
-- No direct client UPDATE policy.
```

### 7.6 Suppliers / members / applications

```sql
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS suppliers_public_read_active ON public.suppliers;
CREATE POLICY suppliers_public_read_active
  ON public.suppliers
  FOR SELECT
  TO anon, authenticated
  USING (status = 'active');

DROP POLICY IF EXISTS suppliers_member_read_own ON public.suppliers;
CREATE POLICY suppliers_member_read_own
  ON public.suppliers
  FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT sm.supplier_id
      FROM public.supplier_members sm
      WHERE sm.user_id = auth.uid()
        AND sm.is_active
    )
  );

DROP POLICY IF EXISTS suppliers_staff_read_all ON public.suppliers;
CREATE POLICY suppliers_staff_read_all
  ON public.suppliers
  FOR SELECT
  TO authenticated
  USING (public.has_role('support'::public.user_role));

ALTER TABLE public.supplier_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_members FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS supplier_members_read_own_team ON public.supplier_members;
CREATE POLICY supplier_members_read_own_team
  ON public.supplier_members
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR supplier_id IN (
      SELECT sm.supplier_id
      FROM public.supplier_members sm
      WHERE sm.user_id = auth.uid()
        AND sm.is_active
    )
    OR public.has_role('support'::public.user_role)
  );
```

### 7.7 Profiles privilege pin + audit log

```sql
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_read_own ON public.profiles;
CREATE POLICY profiles_read_own
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid() OR public.has_role('support'::public.user_role));

DROP POLICY IF EXISTS profiles_update_own_pinned ON public.profiles;
CREATE POLICY profiles_update_own_pinned
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid())
    AND supplier_id IS NOT DISTINCT FROM (
      SELECT p.supplier_id FROM public.profiles p WHERE p.id = auth.uid()
    )
  );

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_log_staff_read ON public.audit_log;
CREATE POLICY audit_log_staff_read
  ON public.audit_log
  FOR SELECT
  TO authenticated
  USING (public.has_role('support'::public.user_role));

-- No INSERT/UPDATE/DELETE for authenticated on audit_log.
```

### 7.8 Admin action hardening (application layer)

| Control | Requirement |
|---|---|
| Session | `supabase.auth.getUser()` only (never `getSession()` alone) |
| CSRF | Server Actions origin checks; no cookie-auth on public route handlers |
| Rate limit | Money admin mutations fail-closed (Upstash or Postgres limiter) |
| Secrets | service role, Cardcom, cron secret only on server / Vercel env |
| 2FA | Required for `super_admin` before money-out actions (target) |
| Audit | Every approve/reject/role/refund/payout writes `audit_log` |

---

## 8. Implementation map

| Area | Code home |
|---|---|
| Admin pages | `src/app/(admin)/admin/**` |
| RBAC | `src/lib/admin/rbac.ts`, `src/lib/admin/permissions.ts` |
| Actions | `src/server/actions/admin/**` |
| Tokens | `src/styles/tokens.ts` |
| Migrations | `supabase/migrations/05x_*` (products, vouchers, payouts) |
| Companion doc | `SUPPLIER-PORTAL-ARCHITECTURE.md` |

---

## 9. Acceptance checklist

- [ ] Coupon product cannot publish without `coupon_price_ils` and `supplier_id`
- [ ] Physical product cannot publish without `platform_percent`
- [ ] Admin JWT alone cannot UPDATE `orders` / `vouchers` / `payments` via PostgREST
- [ ] Role elevation audited and blocked without recent auth
- [ ] Refund UI blocks when any voucher is redeemed/expired
- [ ] Dashboard queues link to real filtered list pages
- [ ] All new actions use `ActionResult<T>` envelope
