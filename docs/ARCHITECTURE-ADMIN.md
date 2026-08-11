# ARCHITECTURE-ADMIN.md

KenyonExpress **Admin Dashboard Core** architecture (implementation goal, Fable 5).

Status: BINDING for worktree `/Users/ofir/kenyonexpress-web/ke-admin` on branch `arch/admin-supplier` (2026-07-28)
Scope: **docs only** in this change. No application code, no installs, no main-directory edits from the docs channel.
Companions (read in order when implementing):

1. `docs/ADMIN-PRODUCT-PAGE-SPEC.md` (money knobs + publish gate)
2. `docs/ARCHITECTURE-ADMIN-DASHBOARD.md` (full control-center depth)
3. `docs/ARCHITECTURE-SUPPLIER-PORTAL.md` (supplier composition)
4. `docs/ARCHITECTURE-NOTIFICATIONS.md` (ops alerts)
5. `docs/ARCHITECTURE-SECURITY-COMPLIANCE.md` (RLS / audit / PCI)
6. Root `ADMIN-ARCHITECTURE.md` (earlier shell matrix; superseded on money conflicts by product page + this file)

Stack: Next.js App Router `src/app/(admin)`, Supabase Postgres + RLS, Cardcom, Server Actions + cron Route Handlers.
Money: integer **agorot** internally; UI shows ₪ with 2 decimals.

---

## 0. Goal definition (Admin Dashboard Core)

**In scope for this goal (ship order):**

1. Admin shell RTL + section nav gated by RBAC
2. Product editor with **dynamic per-product** money fields (admin-only)
3. Approvals queue (draft → live)
4. Orders list/detail with **split ledger** from snapshots
5. Payments stuck queue (reconcile entry points)
6. Suppliers directory bridge (`suppliers`, not legacy-only `vendors`)
7. Users/roles (no silent elevation)
8. Audit log read UI
9. Dashboard home: queues counts (approvals, stuck payments, incomplete pricing)

**Out of scope for Core (later goals):** full analytics BI, affiliates polish, payout mark-paid UX beyond stub, WP bulk import UI, feature-flags settings page.

Storefront goal: **closed** (`phase5/homepage`, STATE commit `40dae12`). This goal opens next.

---

## 1. Business rules the admin must enforce

| Rule | Detail |
|---|---|
| Platform identity | KenyonExpress is a platform, never a supplier |
| `platform_percent` | Dynamic per product, **admin-only**, no fixed rate, no DB default; snapshotted onto `order_items` at purchase |
| `supplier_split_percent` | Complements platform to 100 (070); agreement snapshot; money residual is `base - platformFee` |
| `discount_percent` | Required; physical reduces on-site charge; coupon badge derived from prices |
| `coupon_price_ils` | Absolute online charge for coupons; `0 < coupon_price <= price`; no default |
| Coupon economics | Customer pays full **online** coupon price on site; till balance at merchant on QR scan; voucher expires on scan; no Escrow |
| Physical | Immediate split by snapshotted `platform_percent`; supplier notified and ships |
| PDP | Supplier name/phone/address/logo required to publish |
| Launch catalog | Coupons first; physical remains in schema/UI |

Canonical field rules: `docs/ADMIN-PRODUCT-PAGE-SPEC.md`.

---

## 2. RBAC and section matrix

Enum `user_role`: `customer | content_uploader | vendor | support | admin | super_admin`.

App gates (`src/lib/admin/rbac.ts` / `permissions.ts`):

- `requirePanelSession` → layout
- `requireSection(section, read|write)` → page
- `requireStaffSession` → catalog writers (excludes support)
- `requireAdminSession` / `requireAdminPage` → admin-only
- Sensitive: `requireRecentAuth(15)` for role elevation, wallet adjust, mark payout paid, force refund

| Section | Route | content_uploader | support | admin | super_admin |
|---|---|---|---|---|---|
| Dashboard | `/admin/dashboard` | no | read | full | full |
| Products | `/admin/products` | write drafts | read | full | full |
| Categories | `/admin/categories` | write | read | full | full |
| Approvals | `/admin/approvals` | no | read | approve/reject | full |
| Coupons (legacy bridge) | `/admin/coupons` | no | read | full | full |
| Orders | `/admin/orders` | no | read | full | full |
| Payments | `/admin/payments` | no | read | full | full |
| Suppliers | `/admin/suppliers` | no | read | full | full |
| Users | `/admin/users` | no | read | roles except elevating to super_admin | full |
| Analytics | `/admin/analytics` | no | read no PII export | full | full |
| Audit | `/admin/audit-log` | no | read* | read | read |
| Payouts | `/admin/payouts` | no | no | read/generate | mark-paid + recent auth |

\*Support audit access: align with live `permissions.ts` (may be none today; Core may grant read).

Money visibility: `canSeeMoney(role)` = admin tier only.

---

## 3. Core surfaces (what to build / harden)

### 3.1 Shell

- `src/app/(admin)/layout.tsx`: Hebrew `dir="rtl"`, nav from section matrix, touch targets ≥ 44px
- Design tokens only (no raw hex)
- Empty/error toasts Hebrew

### 3.2 Products (highest priority)

Routes: `/admin/products`, `/new`, `/[id]/edit`.
Actions: `src/server/actions/admin/products.ts`.
Form: `ProductForm` + `assertPublishable` / `completeSplitPair` / `previewProductMoney` from `product-money.ts`.

Must expose admin-only:

- `platform_percent`, `supplier_split_percent` (pair → 100)
- `discount_percent`
- `coupon_price_ils` when type=coupon
- `supplier_id` + live preview of paid online / till / platform keeps / supplier gets

Publish blocked without supplier identity + money gate. Every money change → `audit_log`.

### 3.3 Approvals

`/admin/approvals` + `approvals.ts`: pending_review → published | rejected(reason).

### 3.4 Orders + split ledger

`/admin/orders`, `/admin/orders/[id]`.
Show per `order_items` snapshot: `platform_percent`, `paid_on_site_agorot`, `commission_agorot`, residual, `balance_due_agorot`, supplier identity snapshots. Never recompute from live product.

### 3.5 Payments

`/admin/payments`: stuck initiated/redirected; reconcile calling idempotent finalize. Cardcom webhook remains source of truth for paid.

### 3.6 Suppliers

Move UI off legacy `vendors` toward `suppliers` + applications queue (see supplier portal doc). Suspend blocks redeem via membership.

### 3.7 Users + audit

Role assign with `canAssignRole`; audit `permission_change`.
`/admin/audit-log` reads `public.audit_log` (011).

### 3.8 Dashboard

Counts: products needing pricing (`products_needs_pricing_idx`), pending approvals, stuck payments, open applications.

---

## 4. API / transport rules

1. Browser mutations: Server Actions under `src/server/actions/admin/**`
2. Machine: Route Handlers (`/api/payments/cardcom/webhook`, crons with `CRON_SECRET`)
3. Lists: RSC + service role after `requireSection`
4. Envelope:

```ts
type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; details?: Record<string, unknown> } }
```

No public `/api/admin/*` CRUD.

---

## 5. Security non-negotiables (Core)

- No authenticated write policies on money tables; service role / DEFINER after gate
- Strip money columns from non-admin product payloads
- PAN never on our origin (Cardcom Low Profile / tokens)
- Refund blocked if voucher `redeemed`/`expired` for that value
- Secrets only in server env

Details: `docs/ARCHITECTURE-SECURITY-COMPLIANCE.md`.

---

## 6. Implementation sequence (Fable 5)

1. Freeze this file + product page spec as money source of truth
2. RBAC matrix test coverage (`permissions.ts` / nav)
3. Product form: four knobs + supplier gate + preview + audit
4. Approvals wired to publish gate
5. Order detail split ledger (read snapshots)
6. Payments stuck + reconcile
7. Suppliers list on `suppliers`
8. Dashboard queues
9. Hardening: recent auth on sensitive actions, empty states, RTL pass

Acceptance (Core):

- [ ] Cannot publish coupon without `coupon_price_ils`, split pair, discount, supplier identity
- [ ] Non-admin cannot persist `platform_percent`
- [ ] Order detail shows snapshotted split, not live product percent
- [ ] Support cannot see money columns / exports
- [ ] Every publish/role/refund attempt audited

---

## 7. Open questions

| ID | Question |
|---|---|
| Q-ADMIN-CORE-1 | Force coupon UI to 100/0 or allow other split of prepaid without payout lines? |
| Q-ADMIN-CORE-2 | Content edit after publish: silent vs re-approval? |
| Q-ADMIN-CORE-3 | Support read on `audit_log`? |
| Q-ADMIN-CORE-4 | Cutover date to drop `/admin/coupons` legacy `coupon_deals` UI |

---

## 8. Relationship to other admin docs

| Doc | Role vs this file |
|---|---|
| `ARCHITECTURE-ADMIN.md` (this) | **Core goal** entry: what Fable 5 ships first |
| `ARCHITECTURE-ADMIN-DASHBOARD.md` | Exhaustive control-center (finance, exports, flags, rollout) |
| `ADMIN-ARCHITECTURE.md` | Legacy root ADR; use for route tables, defer money to product spec |
| `ADMIN-PRODUCT-PAGE-SPEC.md` | Field-level money + snapshot + validation |

When money rules conflict, **product page spec + §1 of this file** win.
