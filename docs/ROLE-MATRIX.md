# ROLE-MATRIX.md

Every role, every route, every action: allow or deny, and where the database
agrees with the application.

Status: reference. Docs only. Derived by reading the guards, not by assuming
them. Pass 1.

---

## 0. The four roles in the brief are not the four roles in the system

This document was asked for `customer`, `content-uploader`, `coupon-partner`
and `admin`. The system does not have those four. It has **two independent
authorization dimensions**, and conflating them is the single easiest way to
write a wrong permission check here.

### 0.1 Dimension one: `profiles.role`, the `user_role` enum

Six values, in `src/lib/admin/roles.ts` and `ROLE_ORDER`:

| Enum value | Hebrew label | Brief's name |
|---|---|---|
| `customer` | לקוח | `customer` |
| `vendor` | ספק | (the brief's `coupon-partner`, but see 0.2) |
| `content_uploader` | עורך תוכן | `content-uploader` |
| `support` | שירות לקוחות | **not named in the brief** |
| `admin` | מנהל | `admin` |
| `super_admin` | מנהל על | **not named in the brief** |

`support` and `super_admin` are missing from the brief and are load-bearing:
`support` has its own access row that is neither customer nor admin, and
`super_admin` is the only role that can assign `admin`.

### 0.2 Dimension two: supplier membership, which is not a `profiles.role`

**The brief's `coupon-partner` is not a value of `user_role`.** A business that
redeems coupons is authorized by a row in `supplier_members`, not by its
profile role. `src/lib/supplier/rbac.ts` states the rule outright:

> Membership in an active `supplier_members` row is the only authorization
> signal. `profiles.role` is a routing hint only.

So `profiles.role = 'vendor'` grants **nothing** on its own. The supplier
portal reads `supplier_members` where `user_id = auth.uid()` and
`is_active = true`, and that row carries its own three-level rank
(`src/lib/supplier/roles.ts`):

| Member role | Hebrew | Rank | Includes |
|---|---|---|---|
| `scanner` | סורק | 1 | redeem at the till |
| `manager` | מנהל | 2 | scanner + catalogue and orders |
| `owner` | בעלים | 3 | manager + money |

`normalizeMemberRole` maps any unknown or legacy value to `scanner`, which is
least privilege. `hasMinRole` is a rank comparison, so higher includes lower.

A user can staff **more than one** supplier. `getSupplierSession()` returns the
earliest membership and answers "which portal am I in"; `getSupplierMemberships()`
returns all of them and is the one that must be used when deciding whether a
voucher belongs to this scanner. Using the former for that question refuses a
two-supplier member their own second supplier's vouchers.

### 0.3 The two dimensions are orthogonal

A person can be `customer` in `profiles.role` and `owner` in
`supplier_members`. Nothing in the code couples them. Any matrix that has one
column per "role" and expects them to be mutually exclusive is wrong about this
system.

---

## 1. The four guard layers

A request to `/admin/*` passes four independent checks. Each one re-decides;
none trusts the one before it.

| # | Layer | File | What it decides |
|---|---|---|---|
| 1 | Middleware | `src/proxy.ts` | Signed in, and role is one of the four panel roles. **Optimistic only.** |
| 2 | Layout | `requirePanelSession()` in `src/lib/admin/rbac.ts` | Panel entry, plus MFA |
| 3 | Page | `requireSection(section, access)` | The section matrix |
| 4 | Server action | its own `requireX` call | Re-checks, independently of any page |

Layer 1 reads the role from **`profiles`, not `app_metadata`**, because
`app_metadata` can be stale. Its own comment calls it an optimistic check.

### 1.1 MFA is part of every staff guard

`requireStaffMfa()` runs inside `requireAdminSession`, `requireStaffSession`,
`requireAdminPage` and `requirePanelSession`. A staff account that has a
verified TOTP factor must have proven it in this session (`aal2`); a session
that has not is sent to `/auth/mfa`, **not** to `/login`, because the password
half already passed.

**Unreadable MFA levels gate CLOSED** (`if (!levels) redirect('/login')`). This
only ever runs on staff paths, where failing open is the wrong direction.

### 1.2 The three role predicates, and the trap in them

```
isAdminRole(r)    r === 'admin' || r === 'super_admin'
isStaffRole(r)    isAdminRole(r) || r === 'content_uploader'      <- NO support
isPanelRole(r)    isStaffRole(r) || r === 'support'
isSupportRole(r)  isAdminRole(r) || r === 'support'               <- NO content_uploader
```

`isStaffRole` means **catalogue writer** and deliberately excludes `support`.
`isSupportRole` means **operational reader** and deliberately excludes
`content_uploader`. They are not a hierarchy and neither contains the other.
`support` sits outside the `has_role()` chain entirely.

---

## 2. The admin section matrix

From `src/lib/admin/permissions.ts`. `admin` and `super_admin` are `write` on
every section, so they are one column.

| Section | customer | vendor | content_uploader | support | admin / super_admin |
|---|---|---|---|---|---|
| `dashboard` | none | none | **none** | read | write |
| `catalog` | none | none | **write** | none | write |
| `orders` | none | none | none | read | write |
| `users` | none | none | none | read | write |
| `payments` | none | none | none | **none** | write |
| `affiliates` | none | none | none | read | write |
| `analytics` | none | none | none | **none** | write |
| `audit-log` | none | none | none | **none** | write |
| `suppliers` | none | none | none | read | write |
| `discounts` | none | none | **none** | read | write |

Two rows carry a stated reason and should not be "tidied":

- **`discounts` is `none` for `content_uploader`.** A campaign spends the
  platform's commission. That is money, and money is not part of the catalogue
  role, however much a discount code looks like content.
- **`discounts` is `read` for `support`.** Support answers "why did my code not
  work", so it must see the campaign. It may not create or edit one: that is
  spending.

`canSeeMoney(role)` is `isAdminRole` only. Support sees the dashboard without
the money numbers.

### 2.1 Role assignment

`assignableRoles(caller)`:

| Caller | May assign |
|---|---|
| `super_admin` | all six, including `admin` and `super_admin` |
| `admin` | `customer`, `vendor`, `content_uploader`, `support` only |
| anything else | nothing |

An `admin` cannot create another `admin`. Enforced three times: here, again
inside `src/server/actions/admin/users.ts`, and again by a DB trigger from
migration 035.

---

## 3. Route matrix: `/admin/*`

Read off every `page.tsx` under `src/app/(admin)`. `A` = allowed, `-` = denied
and redirected.

| Route | Guard in source | content_uploader | support | admin |
|---|---|---|---|---|
| `/admin` | `requireStaffSession()` | A | **-** | A |
| `/admin/dashboard` | `requireSection('dashboard')` | - | A | A |
| `/admin/status` | `requireSection('dashboard')` | - | A | A |
| `/admin/products` | `requireSection('catalog','read')` | A | - | A |
| `/admin/products/new` | `requireSection('catalog','write')` | A | - | A |
| `/admin/products/[id]/edit` | `requireSection('catalog','write')` | A | - | A |
| `/admin/categories` | `requireSection('catalog','read')` | A | - | A |
| `/admin/categories/new` | `requireSection('catalog','write')` | A | - | A |
| `/admin/categories/[id]` | `requireSection('catalog','write')` | A | - | A |
| `/admin/reviews` | `requireSection('catalog','write')` | A | - | A |
| `/admin/coupons` | `requireAdminPage()` | **-** | - | A |
| `/admin/coupons/new` | `requireAdminPage()` | **-** | - | A |
| `/admin/coupons/[id]` | `requireAdminPage()` | **-** | - | A |
| `/admin/coupons/codes` | `requireSection('catalog')` | **A** | - | A |
| `/admin/coupons/codes/[id]` | `requireSection('catalog')` | **A** | - | A |
| `/admin/coupons/lookup` | `requireSection('catalog','read')` | **A** | - | A |
| `/admin/orders` | `requireSection('orders')` | - | A | A |
| `/admin/orders/[id]` | `requireSection('orders','read')` | - | A | A |
| `/admin/users` | `requireSection('users')` | - | A | A |
| `/admin/users/[id]` | `requireSection('users')` | - | A | A |
| `/admin/payments` | `requireSection('payments')` | - | - | A |
| `/admin/payouts` | `requireSection('payments')` | - | - | A |
| `/admin/reports` | `requireSection('payments')` | - | - | A |
| `/admin/affiliates` | `requireSection('affiliates')` | - | A | A |
| `/admin/discounts` | `requireSection('discounts','read')` | - | A | A |
| `/admin/discounts/new` | `requireSection('discounts','write')` | - | **-** | A |
| `/admin/discounts/[id]` | `requireSection('discounts','write')` | - | **-** | A |
| `/admin/growth` | `requireSection('discounts','read')` | - | **A** | A |
| `/admin/referrals` | `requireSection('discounts','read')` | - | **A** | A |
| `/admin/analytics` | `requireAdminPage()` | - | - | A |
| `/admin/feature-flags` | `requireSection('analytics')` | - | - | A |
| `/admin/queues` | `requireSection('analytics')` | - | - | A |
| `/admin/search` | `requireSection('analytics')` | - | - | A |
| `/admin/audit-log` | `requireSection('audit-log')` | - | - | A |
| `/admin/suppliers` | `requireSection('suppliers','read')` | - | A | A |
| `/admin/suppliers/new` | `requireSection('suppliers','write')` | - | **-** | A |
| `/admin/suppliers/[id]` | `requireSection('suppliers','read')` | - | A | A |
| `/admin/vendors` | `requireAdminPage()` | - | - | A |
| `/admin/vendors/new` | `requireAdminPage()` | - | - | A |
| `/admin/vendors/[id]` | `requireAdminPage()` | - | - | A |
| `/admin/approvals` | `requireAdminSession()` | **-** | - | A |

Redirect targets differ by guard and are a UX decision, not an access one:

- `requireAdminSession` / `requireStaffSession` / `requirePanelSession` send a
  failing caller to `/login`.
- `requireAdminPage` sends a **non-admin staff member** to `/admin/products`,
  the one section they can use, rather than bouncing them out of the panel.
- `requireSection` sends a failing caller to `/admin`, so a support user
  deep-linking to `/admin/payments` lands somewhere useful.

### 3.1 Five inconsistencies found in this pass

Recorded, not silently resolved.

| # | Finding | Evidence |
|---|---|---|
| 1 | **The coupon parent is admin-only but its children are not.** `/admin/coupons` is `requireAdminPage()`, while `/admin/coupons/codes`, `/admin/coupons/codes/[id]` and `/admin/coupons/lookup` are `requireSection('catalog')`, which `content_uploader` holds as `write`. A content uploader cannot open the coupon list but can open the codes table under it. | the guard column above |
| 2 | **`permissions.ts` documents a section that does not exist.** Its header says `content_uploader` covers "products, categories, coupons, approvals". `approvals` is not a member of `AdminSection`, and `/admin/approvals` is `requireAdminSession()`, so approvals are admin-only. The comment describes an intent the matrix does not implement. | `src/lib/admin/permissions.ts:10` against `/admin/approvals/page.tsx` |
| 3 | **Support can read growth and referrals.** Both gate on `discounts:read`, which the matrix grants support. Whether that was intended for these two pages specifically is not stated anywhere. | `/admin/growth`, `/admin/referrals` |
| 4 | **Three pages are admin-only by arithmetic, not by intent.** `/admin/feature-flags`, `/admin/queues` and `/admin/search` gate on `analytics`, which happens to be `none` for both non-admin roles. If `analytics` is ever opened to `support`, all three open with it silently. `/admin/analytics` itself uses `requireAdminPage()` and would not. | four routes, two mechanisms, same intent |
| 5 | **`/admin` root excludes support.** It uses `requireStaffSession()`, which is catalogue-writers only. A support user who lands on `/admin` (which is exactly where `requireSection` redirects them on denial) is sent to `/login`. That is a redirect loop for support on any denied deep link. | `/admin/page.tsx` against `requireSection`'s redirect target |

Finding 5 is the one worth acting on first: it is reachable by a support user
doing something ordinary.

---

## 4. Route matrix: `/supplier/*` and `/scan`

Authorized by `supplier_members`, never by `profiles.role`.

| Route | Guard | scanner | manager | owner | Not a member |
|---|---|---|---|---|---|
| `/supplier` | `requireSupplierMember('/supplier')` | A | A | A | `/supplier/access-denied` |
| `/scan` | `requireSupplierMember('/scan')` | A | A | A | `/supplier/access-denied` |
| `/supplier/redemptions` | `requireSupplierMember('/supplier/redemptions')` | A | A | A | `/supplier/access-denied` |
| `/supplier/orders` | `requireSupplierRole('manager', ...)` | **-** | A | A | `/supplier/access-denied` |
| `/supplier/products` | `requireSupplierRole('manager', ...)` | **-** | A | A | `/supplier/access-denied` |
| `/supplier/payouts` | `requireSupplierRole('owner', ...)` | **-** | **-** | A | `/supplier/access-denied` |
| `/supplier/scan` | none: `redirect('/scan')` | n/a | n/a | n/a | n/a |
| `/supplier/login` | `getSupplierSession()` | public | public | public | public |
| `/supplier/access-denied` | none | public | public | public | public |

`/supplier/scan` carries no guard and needs none: it is a bare redirect to
`/scan`, kept so every printed card, bookmark and older QR that names the long
path keeps working.

A role-denied member goes to `/supplier?denied=role`, not to access-denied:
they are a member, just not a senior enough one.

### 4.1 Signed out is a different answer from signed in without a membership

`requireSupplierMember` distinguishes the two:

- no `user` -> `/login?next=<target>`
- a `user` with no active membership -> `/supplier/access-denied`

`next` is passed through `safeNextPath` first, because a scanned QR puts that
value in a URL a stranger controls and `//evil.example` is a protocol-relative
URL a browser will follow off-site.

### 4.2 An unreadable membership must not read as "no membership"

`membershipReadOrFail` throws on a read error rather than returning `[]`. The
comment records why in full, and it is the sharpest access-control reasoning in
the codebase: a discarded read error made
`getVoucherForRedemption(code, [])` return early, so the till told a paying
customer `הקוד אינו משויך לבית העסק שלכם` about a voucher they had paid for,
and wrote a refusal row saying the code did not exist into the log that exists
so a disputed scan can be reconstructed. From a lookup that never happened.

`PGRST116` is exempt: on `.maybeSingle()` it is the "no row" answer, and "this
user staffs nobody" is a real answer the guards already handle by denying.

---

## 5. Route matrix: customer surfaces

| Route group | Guard | Signed out |
|---|---|---|
| `/account/**` | `src/app/(account)/layout.tsx`, `supabase.auth.getUser()` | `/login?next=/account` |
| `/checkout` | page-level; empty cart also redirects | `/cart` on empty cart |
| `/cart`, `/product/*`, `/category/*`, `/products`, `/search`, `/`, `/coupons` | none | public |
| `/redeem/[token]` | signed token in the URL | public, token-gated |
| `/gift/[token]` | signed token in the URL | public, token-gated |

The `(account)` layout redirects at the **layout** level rather than per page.
Its comment records the reason: it moves the redirect for a signed-out visitor
earlier, and the data underneath is separately scoped by RLS on `auth.uid()`,
so the shell is not the security boundary. The layout is convenience; RLS is
the control.

---

## 6. Action matrix: server actions

Every file under `src/server/actions/admin/` carries a guard. There are no
unguarded admin actions.

| Action file | Guard | Effective minimum role |
|---|---|---|
| `affiliates.ts` | `requireAdminSession` | admin |
| `approvals.ts` | `requireAdminSession` | admin |
| `coupon-deals.ts` | `requireAdminSession` | admin |
| `orders.ts` | `requireAdminSession` | admin |
| `users.ts` | `requireAdminSession` | admin |
| `vendors.ts` | `requireAdminSession` | admin |
| `images.ts` | `requireStaffSession` | content_uploader |
| `upload.ts` | `requireStaffSession` | content_uploader |
| `categories.ts` | `requireSection('catalog','write')` | content_uploader |
| `products.ts` | `requireSection('catalog','write')` | content_uploader |
| `reviews.ts` | `requireSection('catalog','write')` | content_uploader |
| `discounts.ts` | `requireSection('discounts','write')` | admin |
| `payments.ts` | `requireSection('payments','write')` | admin |
| `payouts.ts` | `requireSection('payments','write')` | admin |
| `referrals.ts` | `requireSection('discounts','write')` | admin |
| `suppliers.ts` | `requireSection('suppliers','write')` | admin |
| `dead-letters.ts` | `requireSection('analytics','write')` | admin |
| `popular-searches.ts` | `requireSection('analytics','write')` | admin |
| `shipping.ts` | `requireSection('orders','write')` | admin |
| `quick-search.ts` | `requireSection('orders','read')` | support |
| `vouchers.ts` | `requireSection('catalog','read')` **and** `requireSection('orders','write')` | mixed: see below |

**`vouchers.ts` carries two different guards in one file.** Lookup is
`catalog:read` (so `content_uploader` and `admin`); the write path is
`orders:write` (so `admin` only, since support is `orders:read`). That is
coherent, but it means the file's access answer depends on which export is
called, and a reader who checks the first guard they find will get it wrong.

**A flat grep for guards under-reports.** Some guards sit behind
`withActionContext` in `src/lib/observability/action-context.ts`, so a naive
`grep requireAdmin` per file misses them and reports actions as unguarded when
they are not. Any audit of this must resolve the wrapper.

---

## 7. Where the database agrees, and where it is the real control

The application guards are four deep, and none of them is the boundary that
matters for data. RLS is.

### 7.1 The money block is client-read-only

Per `DB-SECURITY-MODEL` section 4.3 and migration 168: `payments`,
`escrow_holds`, `split_executions`, `wallet_accounts`, `wallet_entries`,
`wallet_balances` and `wallet_transactions` are **SELECT-only for client
roles**. Every write arrives through the server (`service_role` bypasses RLS)
or through an audited `SECURITY DEFINER` function.

Migration 168 dropped six write policies on `wallet_balances` and
`wallet_transactions` that were gated on `is_admin()`. The reasoning is worth
carrying into any future policy:

> That gate is real, but it is the **wrong door**: it lets an admin's browser
> session write ledger rows directly, off the audited server path, a money
> movement with no `audit_log` row, no actor, no before/after.

So `is_admin()` in a **write** policy is a smell here, not a pattern. The two
SELECT policies (admin OR support OR owner, `deleted_at`-aware) were untouched,
and that three-way SELECT is the DB-side expression of the same matrix in
section 2: admin and support read, the owner reads their own.

With RLS enabled and no permissive policy for a command, that command is denied
for client roles. There is no need for an explicit deny.

### 7.2 The alignment table

| Surface | App guard | RLS | Agree? |
|---|---|---|---|
| `/account/**` data | layout redirect only | `auth.uid()` scoping | Yes. The layout is convenience; RLS is the control. |
| Wallet read | `users:read` (support+) | admin OR support OR owner | Yes |
| Wallet write | admin action, audited | **no client policy at all** | Yes, and the DB is stricter |
| Supplier portal | `supplier_members` membership | `supplier_members` on `auth.uid()` | Yes, same table |
| Voucher redemption | full membership set | `redeem_voucher()` matches the full set (085) | Yes, and the app must not narrow it |
| Catalogue write | `catalog:write` | service_role via server action | App-side only |

### 7.3 A standing caution on `SECURITY DEFINER`

A definer function runs with the definer's rights, so **any uid it takes as an
argument is caller-controlled** unless the body pins it to `auth.uid()`. A
definer function that accepts a user id and reads rows for it hands an
authenticated user other people's rows past RLS. This has been found in this
codebase before. Any new definer function must either take no identity argument
or assert it equals `auth.uid()`.

This section names a class of bug, not a current one: it is not a claim that a
specific function is vulnerable today. Verify against the live schema before
acting on it.

---

## 8. How to re-derive this document

```bash
# the role model
cat src/lib/admin/roles.ts src/lib/admin/permissions.ts
cat src/lib/supplier/roles.ts src/lib/supplier/rbac.ts

# every admin route and its guard
for f in $(find "src/app/(admin)" -name 'page.tsx' | sort); do
  g=$(grep -oE "requireSection\('[a-z-]+',?\s*'?[a-z]*'?\)|requireAdminPage\(\)|requireAdminSession\(\)|requireStaffSession\(\)|requirePanelSession\(\)" "$f" | head -1)
  echo "${f#src/app/} :: ${g:-NONE}"
done

# every supplier route and its guard
for f in $(find "src/app/(supplier)" "src/app/(supplier-public)" -name 'page.tsx' | sort); do
  g=$(grep -oE "requireSupplierRole\('[a-z]+'[^)]*\)|requireSupplierMember\([^)]*\)" "$f" | head -1)
  echo "${f#src/app/} :: ${g:-NONE}"
done

# every admin action and its guard
for f in $(ls src/server/actions/admin/*.ts | grep -v test); do
  echo "${f##*/} :: $(grep -ohE "requireAdminSession|requireStaffSession|requireSection\('[a-z-]+'[^)]*\)" "$f" | sort -u | tr '\n' ',')"
done
```

Quote the `--include` globs when grepping: an unquoted `*.ts` is expanded by
zsh before grep sees it, and on no match zsh aborts the whole command.

---

## 9. Related documents

```
docs/DESIGN-SYSTEM.md         the token layer
docs/COMPONENT-INVENTORY.md   components, props, states
docs/QA-SCRIPTS.md            the manual pass per flow, including per role
docs/MIGRATION-REVIEW.md      pending migrations, read as text
ARCHITECTURE-ADMIN.md         section 3.2, the matrix this implements
ARCHITECTURE-SUPPLIER-PORTAL.md  section 1, the membership rule
```

---

## 10. Storefront allow/deny (customer surfaces, deepened)

Section 5 lists guards. This table is the product brief's four columns against those surfaces. Dimensions stay orthogonal (§0.3): a scanner is still a `customer` on `/account/wallet`.

| Route / action | customer (anon or auth) | content-uploader | coupon-partner (membership) | admin |
|---|---|---|---|---|
| `GET /s/[id]` active | allow pub | allow | allow (own shop is still public chrome) | allow |
| `GET /s/[id]` inactive or missing | deny 404, noindex | same | same | same |
| JSON-LD LocalBusiness | allow only if address+city are real | same | same | same |
| JSON-LD `@id` on `/supplier/{uuid}` | **deny** (portal) | deny | deny | deny |
| `GET /account/wallet` | own SELECT; no client write | own as buyer | own as buyer | own as buyer |
| `GET /account/coupons` | own vouchers; no QR in the list | own | own customer vouchers, not the shop book | own |
| `GET /account/wishlist` | own | own | own | own |
| Header heart (live YITH) | **deny** (standing chrome rule) | deny | deny | deny |
| Read `platform_percent` in customer DOM | **deny** | deny on storefront | deny | allow on admin form only |
| Wallet cash-out | **deny** | deny | deny | deny |
| `GET /city/[slug]` known region | allow (empty is allow) | allow | allow | allow |
| `GET /city/[slug]` unknown | deny 404 | same | same | same |
| Invent extra city URLs | **deny** | deny | deny | deny |

Inactive supplier must not paint the old H1 on an empty grid. That leak is a 404, matching `docs/ERROR-COPY.md`.

## 11. Revision

| Date | Change |
|---|---|
| 2026-09-07 | Guard-derived matrix (parallel pass) |
| 2026-09-07 | Storefront `/s/[id]` active-only, LocalBusiness, account siblings |
| 2026-09-07 | `/city/[slug]` seventeen regions; unknown 404; no extra URLs |
