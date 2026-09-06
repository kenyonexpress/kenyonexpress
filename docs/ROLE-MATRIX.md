# Role matrix

Allow or deny for every storefront, partner, and admin **route and action**, mapped to production RLS. Product brief names four roles. Production mapping:

| Brief | Production |
|---|---|
| customer | `profiles.role = customer` (default). Guest is `anon` until login |
| content-uploader | `profiles.role = content_uploader` |
| coupon-partner | **not** a `user_role`. Active `supplier_members` row, usually `member_role = scanner`. Owners/managers may scan too |
| admin | `profiles.role IN (admin, super_admin)` via `is_admin()` |

Also on `user_role`, not in the brief: `support` (read, no money writes), `vendor` (legacy hint, membership is the real gate).

Layers (all required):

1. Session (cookie / bearer)
2. Route guard (`lib/admin/rbac.ts`, `lib/supplier/rbac.ts`)
3. RLS (Postgres)
4. SECURITY DEFINER for spends (`redeem_voucher`, `fn_wallet_transfer`, checkout)

`anon` DML: **`carts` only**. Logged-in table GRANTs are wide; **RLS is the real gate**. `service_role` bypasses RLS and must not be in the browser.

Legend: **allow** = intended. **deny** = must 404 / redirect / RLS miss, no leak. **own** = caller’s rows only. **pub** = published catalogue. **\*** = never in customer DOM even if a staff session can read the column.

Money: integer agorot. `platform_percent` is never shown to customer or coupon-partner. Snapshot lives on `order_items` at purchase and is frozen.

Companions: `docs/DB-SECURITY-MODEL.md` §4, `docs/AUTH-MODEL.md`, `docs/DATA-CONTRACTS.md` §0, `docs/ROLE-JOURNEYS.md`, `docs/STOREFRONT-ROUTES.md`.

---

## 1. Public storefront (no session required to **view**)

| Route / action | customer (anon or auth) | content-uploader | coupon-partner | admin |
|---|---|---|---|---|
| `GET /` | allow | allow (as customer chrome) | allow (as customer chrome) | allow |
| `GET /products` | allow pub | allow | allow | allow |
| `GET /category/[slug]` | allow pub | allow | allow | allow |
| `GET /product/[slug]` | allow if `status=active` else deny 404 | allow (may also use admin form) | allow pub | allow |
| Add to cart | allow (anon writes `carts`) | allow as customer | allow as customer | allow as customer |
| `GET /cart` | allow | allow | allow | allow |
| Update / remove cart line | own cart | own | own | own |
| `GET /search` | allow, **noindex**; no header field | same | same | same |
| `GET /s/[id]` | allow if supplier public | allow | allow (including own storefront) | allow |
| `GET /city/[slug]` | allow | allow | allow | allow |
| `GET /legal/*` `/about` `/contact` `/faq` `/blog` | allow | allow | allow | allow |
| `POST` contact / supplier lead / newsletter | allow (rate limited) | allow | allow | allow |
| `GET /offline` | allow (PWA cache) | allow | allow | allow |
| Wishlist toggle while guest | allow localStorage only | same | same | same |
| Read `products.platform_percent` in DOM | **deny** | **deny** on storefront | **deny** | allow on **admin** form only |
| Read other users’ orders / QR | deny | deny | deny | allow via admin |

RLS: catalogue SELECT for `anon`+`authenticated` on `products` / `categories` (separate policies). INSERT/UPDATE/DELETE on catalogue require `is_admin()` or `is_supplier_member()` **inside** the policy even when the role column says `authenticated`.

---

## 2. Checkout and payments

| Route / action | customer | content-uploader | coupon-partner | admin |
|---|---|---|---|---|
| `GET /checkout` | allow if cart non-empty; bounce to `/cart` if empty | same (no extra rights) | same | same |
| Pay (Cardcom) | allow after auth (Google / OTP) + `mergeGuestCart` | deny extra; they pay as customer | deny extra | deny extra (use admin refunds, not this form) |
| Snapshot `order_items.platform_percent` | server only | no | no | no (must not rewrite history later) |
| Wallet clamp at pay | own positive balance | own if they have a customer wallet | own | own |
| `GET /checkout/return` | own order | own | own | own |
| `GET /checkout/failed` | allow (cart kept) | allow | allow | allow |
| `GET /checkout/confirmation` | redirect to return | same | same | same |
| Webhook finalize | **deny** all four (Cardcom + `service_role` only) | deny | deny | deny |
| Issue vouchers | side effect of successful pay, own | no staff issue button here | no | admin tools only if a documented action exists |
| Read `payments` | own SELECT | own | own | admin |
| Write `payments` | deny (no INSERT policy) | deny | deny | deny (server) |
| Read PAN / `cardcom_token` | deny (last4 only on `/account/tokens`) | deny | deny | deny in UI; logs scrubbed |

Failed pay copy: `החיוב לא בוצע. אפשר לנסות שוב, העגלה שלך נשמרה.` Do not empty the cart.

---

## 3. Customer account

Session required. Signed out → `/login?next=…`. Robots: noindex.

| Route / action | customer | content-uploader | coupon-partner | admin |
|---|---|---|---|---|
| `GET /account` | own | own (same shell; not the admin console) | own if they also have a customer profile | own |
| `GET /account/orders` | own | own | own | own; plus `/admin/orders` for all |
| `GET /account/orders/[id]` | own else 404 | own | own | own; admin sees all in admin |
| Invoice download | own, session re-check, never raw provider URL | own | own | admin |
| `GET /account/coupons` | own vouchers | own | own customer vouchers (not the shop’s book) | own + admin voucher tools |
| `GET /coupon/[id]` | owner else 404 (signed out: login, not 404) | owner | owner | owner / admin |
| WhatsApp to **business** including `{code}` | **deny** | deny | deny | deny |
| `GET /account/wallet` | own SELECT ledger | own | own | own; no client write |
| Credit / debit wallet | deny (transfer fn only) | deny | deny | admin path / `fn_wallet_transfer` |
| Withdraw wallet to bank | **deny** all | deny | deny | deny |
| `GET /account/wishlist` | own | own | own | own |
| `GET /account/details` | own; cannot UPDATE `profiles.role` | own; cannot self-escalate | own | can change **other** users’ role |
| Delete account | own, typed confirm | own | own | own |
| `GET /account/security` | own | own | own | own |
| `GET /account/addresses` | own `user_addresses` | own | own | own |
| `GET /account/tokens` | own last4 | own | own | own |
| `GET /account/referrals` | own; no referee PII | own | own | program settings in admin |
| `GET /account/subscriptions` | own | own | own | own |
| `GET /account/vouchers` | **redirect** to coupons | same | same | same |

Wallet RLS: SELECT owner. INSERT/UPDATE/DELETE on `wallet_entries` / `wallet_accounts` for the client: **deny**. Draft 168 made the ledger client-read-only.

Voucher redeem by the **holder** is not a customer click on this site. Cashier scan is §4.

---

## 4. Gift, redeem, scan (coupon-partner)

| Route / action | customer | content-uploader | coupon-partner | admin |
|---|---|---|---|---|
| `GET /gift/[token]` | recipient (token is the credential) | deny extra | deny extra | deny extra |
| POST claim gift | allow if token valid; then `/account/coupons` | no | no | no |
| `GET /redeem/[token]` | deny (not a customer page) | deny | **allow** if member of **that** supplier | allow if staff path says so; prefer supplier session |
| Confirm `redeem_voucher` | deny | deny | allow own supplier, idempotent | admin override only if documented |
| `GET /scan` `/supplier/scan` | deny | deny | allow | deny (use supplier login, not admin skin) |
| `GET /supplier/login` | allow (public form) | allow | allow | allow |
| `GET /supplier/access-denied` | allow (no membership) | allow | allow | allow |
| `GET /supplier/**` other | deny | deny | allow by `member_role` | deny |
| History `/supplier/redemptions` | deny | deny | own supplier, including failed scans | admin |
| Outstanding unredeemed book | deny | deny | **deny** (policy hides live liability until `redeemed_by_supplier_id`) | admin |
| Split % / `platform_percent` | deny | deny | **deny** | allow |
| Treat coupon prepaid as supplier payout | deny | deny | **deny** | deny (remainder is cash at the till) |
| Camera / manual code | n/a | n/a | allow (always offer manual) | n/a |
| Forged HMAC | logged even logged-out; spend deny | same | same | same |

Scan outcomes (visible to cashier only): success / already_redeemed / expired / not_found / unauthorized / rate_limited. `wrong_supplier` presents as `not_found` to this user.

`coupon_codes` table: authenticated SELECT in the map; **UI must not** dump the table. Customer sees **their** `vouchers.code` after purchase.

---

## 5. Content-uploader (catalogue)

Uploader uses the **admin catalogue forms**, not a public CMS. No money, no role picker, no historical percent rewrite.

| Route / action | customer | content-uploader | coupon-partner | admin |
|---|---|---|---|---|
| `GET /admin` shell | deny | **allow** (catalogue subset) | deny | allow |
| Create / edit product | deny | **allow** | deny | allow |
| Publish `status=active` | deny | allow if approval gate says so; may not self-approve when admin must | deny | allow |
| Set `platform_percent` on product | deny | **allow** on the form (not in customer preview) | deny | allow |
| Apply percent to **past** `order_items` | deny | **deny** | deny | **deny** |
| Orders / refunds / users | deny | **deny** | deny | allow |
| Audit log | deny | **deny** | deny | SELECT only (writes via trigger) |
| `profiles.role` change | deny | **deny** (cannot change anyone, including self) | deny | allow except last super_admin without a plan |
| Read `order_items.platform_percent` as finance | deny | **deny** | deny | allow |

RLS: catalogue writes check `is_admin()` **or** membership inside the policy. Uploader is `is_admin()` false. Their write path is the **application guard** + SECURITY DEFINER / service client used by admin actions. If a future policy grants `content_uploader` table writes, it must still freeze `platform_percent` on existing orders.

---

## 6. Admin

| Route / action | customer | content-uploader | coupon-partner | admin |
|---|---|---|---|---|
| `/admin/**` | deny | catalogue only | deny | allow |
| Refund unredeemed coupon | deny | deny | deny | allow |
| Refund **redeemed** coupon | deny | deny | deny | **deny** (deal consumed; goodwill wallet is a separate path) |
| Cancel / capture gaps | deny | deny | deny | allow (Indicator / cron, not a customer button) |
| Users table | deny | deny | deny | allow |
| Escrow tab as live money | deny | deny | deny | **deny** (writers keep `escrow_held_agorot = 0`) |
| `audit_log` INSERT from client | deny | deny | deny | **deny** (`no_insert` policy) |
| `payment_webhook_events` | deny | deny | deny | deny (no policies; service only) |

---

## 7. RLS cheat sheet (tables the four roles actually touch)

From `docs/DB-SECURITY-MODEL.md` §4 (live `pg_policies` 31.08). **פ** still filters inside the policy.

| Table | customer | content-uploader | coupon-partner | admin |
|---|---|---|---|---|
| `products` SELECT | pub | pub + admin form | pub | all |
| `products` write | deny | via admin actions | deny | allow |
| `carts` | own ALL (anon too) | own | own | own |
| `orders` / `order_items` | own | own as buyer | own as buyer | all |
| `vouchers` | own SELECT; redeem fn | own | scan updates via `redeem_voucher` | all |
| `voucher_redemptions` | own SELECT | own | own supplier | all |
| `wallet_accounts` | own SELECT | own | own | all |
| `wallet_entries` | own SELECT | own | own | all |
| `payments` | own SELECT | own | own | all |
| `payment_tokens` | own SELECT; update/delete own | own | own | all |
| `user_addresses` | own CRUD | own | own | all |
| `supplier_members` | deny others | deny | own membership | all |
| `coupon_codes` | deny in UI | deny | deny book | allow |
| `audit_log` | deny | deny | deny | SELECT |
| deny-all tables (`payment_webhook_events`, `rate_limits`, …) | deny | deny | deny | deny (service) |

`wishlists` / `wishlist_items`: own CRUD when those policies exist (`docs/ARCHITECTURE-WISHLIST.md`). Guest has no DB row.

---

## 8. Auth routes

| Route | customer | content-uploader | coupon-partner | admin |
|---|---|---|---|---|
| `/login` `/signup` `/forgot-password` `/reset-password` `/mfa` | allow | allow | allow | allow |
| `/supplier/login` | allow | allow | allow | allow |

Do not bounce `access-denied` and login in a loop (both public).

---

## 9. What every role never does (checklist)

| Actor | Never |
|---|---|
| customer | see `platform_percent`, cost, escrow, someone else’s QR, raw Cardcom token, wallet cash-out |
| coupon-partner | other shops’ live voucher book, split %, payout-as-if-coupon-prepaid, customer address unless a separate fulfilment role |
| content-uploader | ledger writes, role escalation, rewrite historical percent, refunds |
| admin | silent percent default, apply-to-history, PAN in logs, un-redeem a scanned voucher |

## Revision

| Date | Change |
|---|---|
| 2026-09-07 | Matrix for four brief roles vs production RLS: storefront, checkout, account siblings, scan, uploader, admin |
