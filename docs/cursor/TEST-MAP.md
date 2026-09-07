# Test map

Companion:
`docs/cursor/MONEY-INVARIANTS.md`,
`docs/cursor/RLS-CATALOG.md`,
`docs/cursor/API-SURFACE.md`.

This file is an inventory of **this worktree**. It does not run tests. This pack never runs
`pnpm`.

CI has **no Postgres**. RLS tests that talk to production skip unless
`SUPABASE_URL`
+ anon key are present. What CI always enforces is source scans, branded money math, and the committed
`supabase/rls-manifest.json`
snapshot (measured 2026-08-19, 53 tables).

---

## 0. How to read a row

| Column | Meaning |
|---|---|
| File | Path from repo root |
| Protects | The rule a reviewer should remember |
| If deleted | What could ship next |

Pixel / RTL / a11y tests protect the 11% gate and Hebrew UI, not money. They are listed in §7 so the inventory is complete.

---

## 1. Money (delete these and the till lies)

| File | Protects | If deleted |
|---|---|---|
| `src/lib/money.test.ts` | Branded `Agorot` / `Bp`, `divRoundHalfUp`, `applyBp`, VAT extract by subtraction | Float rounding and split disagreement by 1 agora |
| `src/lib/commerce/money.test.ts` | Constructors throw on non-safe-integer | Silent precision loss |
| `src/__tests__/money-no-float.test.ts` | Source scan: no `parseFloat` / `Math.round(x*100)` / `* 0.9` on the money path except allowlist | The next `round2(price * factor)` in admin lives for months (already happened) |
| `src/lib/commerce/commission.test.ts` | Coupon 100/0 split, physical `fee` then `face - fee`, wallet cannot exceed `customerPaysNow` | Global 10% coupon quote vs charge split |
| `src/lib/commerce/coupon-offer.test.ts` | Missing `coupon_price_ils` → `sellable: false`, never invent a percent | PDP shows 10% while checkout charges an absolute (the original bug) |
| `src/lib/commerce/platform-percent-snapshot.test.ts` | Snapshot copies percent; settlement must not re-read `products` | Historical orders paid at today's rate |
| `src/lib/commerce/product-money.test.ts` | Line snapshot includes supplier identity by value | Rename supplier, rewrite history |
| `src/lib/commerce/order-money-columns.test.ts` | `ils` vs `agorot` generation probe | First payment `42703` dead-letter (R7) |
| `src/lib/payments/payment-money-columns.test.ts` | Same generation on `payments` | Webhook finalize selects a missing column |
| `src/lib/commerce/implausible-discount.test.ts` | 95% ceiling vs `full_price` only; ₪1/₪400 master row blocked from **sale** | Buy the test SKU if someone bypasses the cart (row still visible until 172) |
| `src/lib/admin/bulk-price.test.ts` | Bulk adjust stays integer via `applyBp` | Float in catalogue prices |
| `src/lib/commerce/admin-money-agreement.test.ts` | Admin form money matches engine | Staff UI quotes a different take |
| `src/lib/cart/pricing.test.ts` | Cart view agorot, no client prices trusted | Charge ≠ badge |
| `src/lib/checkout/split.test.ts` | Checkout split identities | Coupon residual treated as platform debt |
| `src/lib/checkout/wallet-input.test.ts` | Wallet is a payment source only | Wallet mutates commission |
| `src/lib/cashback/engine.test.ts` | Cashback bp schedule is integer | Float percent cashback |
| `src/lib/ledger.test.ts` | Ledger identities | Double-entry drift |
| `src/lib/invoices/document.test.ts` | `net + vat = gross`, VAT 18% from `VAT_RATE_BP` | Invoice disagrees with `money.ts` (once was 17 vs 18) |
| `src/lib/money-format.test.ts` | Display only. Must not be used for arithmetic | Format helper leaking into settlement |
| `src/lib/supplier/no-escrow-in-supplier-due.test.ts` | Coupon supplier due is 0. No escrow | Revive J5 / hold language in due calc |
| `src/lib/supplier/settlement-balance.test.ts` | Partner balance is accounting, not a payout table | Call dead `admin/payouts.ts` as if it worked |
| `src/server/domain/orders/settlement.test.ts` | Settlement states; `escrow_held` refused as destination | Write dead escrow status |
| `src/server/payments/settlement-events.test.ts` | Append-only settlement journal | Rewrite a ledger row |
| `src/server/payments/invoices.test.ts` | Invoice enqueue after pay | VAT on supplier cash |
| `src/lib/commerce/stock-reservation-contract.test.ts` | 15 min TTL shorter than order expiry | Stock held after pending order dies, or vice versa |

---

## 2. Payments, vouchers, refunds

| File | Protects | If deleted |
|---|---|---|
| `src/server/actions/payments/checkout.test.ts` | Server re-prices; client ids only | Shopper-set prices |
| `src/server/domain/orders/checkout-flow.test.ts` | Pending → iframe / token | Skip stock reserve |
| `src/server/payments/finalize-reads-fail-loudly.test.ts` | Missing columns throw, do not skip finalize | Silent unpaid after charge |
| `src/server/payments/payment-events.test.ts` | Append-only `payment_events` | Update a journal row |
| `src/server/payments/webhook-dlq.test.ts` | Dead-letter shape | Drop a charged-not-finalized event |
| `src/app/api/payments/cardcom/webhook/route.test.ts` | `?s=` + GetLpResult; body is not money | Trust Cardcom POST amount |
| `src/app/api/payments/cardcom/webhook/resilience.test.ts` | Replay / timeout | Double voucher |
| `src/lib/payments/cardcom.test.ts` | Legacy Interface client | HMAC fantasy (Cardcom does not sign) |
| `src/lib/payments/env.test.ts` | Sandbox/mock must not be Production | Fake success charges |
| `src/lib/security/constant-time.test.ts` | Webhook secret compare, no short-circuit | Timing oracle on which secret matched |
| `src/lib/payments/terminal-reconciliation.test.ts` | Cardcom vs `payments` | Reconcile from POST body |
| `src/lib/admin/payment-reconciliation.test.ts` | Operator view of the same | |
| `src/server/domain/vouchers/issue.test.ts` | One voucher per unit, cap on `order_item_id` | Qty 3 → 1 code |
| `src/server/domain/vouchers/code.test.ts` | Code alphabet / length | Guessable codes |
| `src/server/domain/vouchers/qr.test.ts` | Signed QR with current/previous secret | Rotate QR secret, every pass dies |
| `src/lib/vouchers/qr-image.test.ts` | Image bytes | |
| `src/server/domain/vouchers/redeem-contract.test.ts` | Eleven `voucher_scan_outcome` values | New outcome the till cannot render |
| `src/server/domain/vouchers/redemption.test.ts` | `WHERE status = 'issued'` wins | Double scan |
| `src/server/domain/vouchers/state-machine.test.ts` | Application mirror of RPC | App allows `refunded → issued` |
| `src/server/domain/vouchers/mark-order-item-redeemed.test.ts` | Line follows last unit | Order fulfilled while a unit is still issued |
| `src/server/domain/vouchers/scan-context.test.ts` | Supplier id from session, never body | `wrong_supplier` bypass |
| `src/lib/vouchers/scan-input.test.ts` | Normalise pasted codes | |
| `src/lib/vouchers/offline-scan.test.ts` | Batch drain | Partial batch abort losing later codes |
| `src/lib/vouchers/coupon-view.test.ts` | Customer voucher UI | |
| `src/app/api/supplier/vouchers/redeem/route.test.ts` | HTTP redeem auth + rate limit | Unauthenticated consume |
| `src/app/api/supplier/vouchers/redeem-batch/route.test.ts` | Per-code outcomes | |
| `src/app/api/supplier/vouchers/lookup/route.test.ts` | Lookup does not consume | Lookup that redeems |
| `src/app/api/supplier/app/pin/route.test.ts` | PIN is not a login; 15/hour | Lock the whole till on a bad PIN |
| `src/server/actions/payments/refund.test.ts` | Card path illegal after any unit left `issued` | Cardcom refund of a scanned meal |
| `src/server/domain/orders/refund.test.ts` | Domain refund rules | |
| `src/server/payments/refund-record.test.ts` | `refund_state` enum | Brief aliases stored as 22P02 |
| `src/server/payments/refund-wallet.test.ts` | Wallet refund transitions; fee CHECK vocabulary | Float 5% fee vs integer CHECK |
| `src/server/domain/orders/state-machine.test.ts` | Order status graph | `paid → pending` |
| `src/server/domain/orders/status-transitions.test.ts` | Same, including 137 guards | Catch-and-set past `23514` |
| `src/lib/shipping/transitions.test.ts` | Physical ship arrows | Coupon marked shipped |
| `src/server/payments/gift-vouchers.test.ts` | Gift issue at finalize | Second purchase on claim |
| `src/lib/gifts/claim-token.test.ts` | Token is capability; no existence oracle | |
| `src/server/payments/subscription-create.test.ts` | `period_key` idempotency; split CHECK exact | Double monthly charge |
| `src/lib/commerce/recurring.test.ts` / `recurring-offer.test.ts` / `recurring-schema-error.test.ts` | Recurring product shape | Silent 42703 on subscription columns |
| `src/server/payments/voucher-email.test.ts` | Outbox kind after issue | Email claimed sent without a row |
| `src/lib/email/voucher-email.test.ts` | Copy | |
| `src/app/api/cron/stranded-payments/route.test.ts` | Retry finalize, not POST body | |
| `src/app/api/cron/expire-vouchers/route.test.ts` | `issued → expired` lock | Cron refunds via Cardcom |
| `src/app/api/cron/subscriptions/route.test.ts` | Token charge cadence | |
| `src/app/api/cron/invoices/route.test.ts` | Issue documents | |
| `src/app/api/cron/stock/route.test.ts` | Release expired reservations | |
| `src/app/api/cron/reconcile/route.test.ts` | Terminal vs rows | |
| `src/app/api/cron/notifications/route.test.ts` | **Only voucher email sender** | Paid, no mail, thought "finalize sends" |
| `src/lib/idempotency.test.ts` | Replay returns first answer | |

---

## 3. RLS and authz

| File | Protects | If deleted |
|---|---|---|
| `src/lib/auth/rls-manifest.test.ts` | RLS on every listed table; zero-policy tables must be in `service_role_only`; project `ixvwfbuvfxxsjiywhbbb` | New table with RLS off, or drop the deny-all set |
| `src/lib/auth/rls-write-policies.test.ts` | No unconditioned `true` write; vouchers/payments have no client write | `USING (true)` on `order_items` |
| `src/__tests__/rls-zero-policy-migration.test.ts` | Zero-policy is deny, not a TODO to "add a policy" | Loosen deny-all to satisfy an advisor INFO |
| `src/db/__tests__/anon-catalog.test.ts` | Anon can read active catalogue; cannot write money | Migration 165-class revoke 42501 on home |
| `src/db/__tests__/wallet-rls.test.ts` | Anon cannot INSERT/SELECT fossil `wallet_balances` / `wallet_transactions` | See **gap G1** |
| `src/lib/admin/permissions.test.ts` | `requireSection` money vs catalogue | content_uploader refunds |
| `src/lib/admin/uploader-policy.test.ts` | Uploader cannot money | |
| `src/server/actions/admin/uploader-prohibitions.test.ts` | Same at action layer | |
| `src/lib/admin/role-change.test.ts` | `updateUserRole` audited; trigger still exists | Self-promotion if trigger dropped |
| `src/lib/admin/audit.test.ts` / `audit-coverage.test.ts` / `audit-diff.test.ts` | Staff mutations leave `audit_log` | Silent role change |
| `src/server/actions/admin/audit-required.test.ts` | Actions call `writeAuditLog` | |
| `src/server/actions/audit-actor.test.ts` | Actor is the staff user, not service_role uuid | |
| `src/lib/supplier/rbac.test.ts` / `roles.test.ts` | Membership not `profiles.role` | Gate till on `vendor` only, lock restaurants |
| `src/server/queries/supplier-tenant-scope.test.ts` | Partner sees own rows | Cross-shop order dump |
| `src/server/queries/supplier-redemptions.test.ts` | Redemptions after scan only | Issued inventory dump |
| `src/__tests__/security/mutating-route-guards.test.ts` | POST routes require auth/secret | Open webhook |
| `src/lib/auth/cron-auth.test.ts` | Bearer `CRON_SECRET`, no default | Cron 200 without secret |
| `src/lib/auth/route-guards.test.ts` | Proxy gates; checkout root ungated; frame-return ungated | Login form inside Cardcom iframe |
| `src/lib/auth/safe-next.test.ts` | Open-redirect | `?next=https://evil` |
| `src/lib/supabase/admin-key.test.ts` | Service key never `NEXT_PUBLIC_` | BYPASSRLS in the bundle |
| `src/lib/compromised-keys.test.ts` | SHA-256 denylist | Ship a leaked service_role |
| `src/lib/env-probe.test.ts` / `env-example-is-complete.test.ts` | Boot contract | Missing Cardcom at first charge |
| `src/__tests__/revoked-functions-have-no-callers.test.ts` | Dead RPCs not called | 42883 at pay |

---

## 4. Referral, wallet spend, analytics money

| File | Protects | If deleted |
|---|---|---|
| `src/server/actions/referrals.test.ts` | Ensure code; no self-ref | |
| `src/server/referrals/claim.test.ts` / `complete.test.ts` / `program.test.ts` / `wired.test.ts` | Complete on **paid**; wallet via transfer | Credit on pending order |
| `src/lib/referrals/code.test.ts` | 8-char alphabet | Cookie injection |
| `src/lib/referrals/cookie.test.ts` | Last-click; proxy sets cookie | |
| `src/lib/analytics/aggregate.test.ts` | Dashboard numbers are safe integers | Float GMV |
| `src/lib/analytics/ecommerce.test.ts` / `pipeline.test.ts` / `server-events.test.ts` | Money events must ingest (`/api/a` must not 200-swallow) | Silent `purchase` = 0 |
| `src/lib/analytics/registry-matches-migration.test.ts` | Event names match 169-class schema | Four funnel events 0 rows |

---

## 5. Gaps (money or RLS with no honest test)

| Id | Missing protection | Evidence | What would catch it |
|---|---|---|---|
| **G1** | Live wallet pair RLS | `wallet-rls.test.ts` only inserts into fossil `wallet_balances` / `wallet_transactions` | Same anon INSERT/SELECT against `wallet_accounts` and `wallet_entries` |
| **G2** | `order_items` conservation CHECK | DB would accept `face ≠ paid + balance`. Only `commission.ts` + unit tests hold it | A migration CHECK test, or a source scan that the CHECK SQL exists |
| **G3** | Negative `order_items.*_agorot` | No `>= 0` CHECK on handwritten agorot columns | Constraint test once a human adds the CHECK |
| **G4** | `refunds` / `payment_events` RLS | Not in the 53-table 2026-08-19 manifest | Re-measure `check-rls.mjs` and commit the snapshot |
| **G5** | `redeemAdminVoucher` vs `redeem_voucher` | Admin path is a raw UPDATE. No test that both write the same redemption shape / settlement_status | Contract test: admin redeem must not skip `voucher_redemptions` or the `issued` predicate |
| **G6** | Cashback timing | Engine tests the **rate**. Finalize credits immediately. Nothing fails if someone moves credit to scan | Assert `fn_wallet_transfer` idempotency `order:<id>:cashback` is called from finalize, not from redeem |
| **G7** | `lookupAdminVoucher` catalog-read | Uploader can inspect any code through the admin client | Uploader prohibition test on voucher lookup, or accept and document (current API-SURFACE choice) |
| **G8** | `/scan` unproxied | Proxy only prefixes `/supplier` | Route-guard test that `/scan` still requires a session (page-level) |
| **G9** | Fossil wallet **admin** DML | Write policies are `is_admin()`, not owner. No test that a customer JWT cannot insert fossil rows (only anon) | Authenticated-customer INSERT into `wallet_transactions` must fail |
| **G10** | Manifest drift | CI cannot see tables added after 2026-08-19 | Human re-measure. Offline test cannot invent live policies |

Pixel / i18n / wishlist / reviews tests do not close G1–G10.

---

## 6. Cron, search, cart, health (complete enough to grep)

| File | Protects | If deleted |
|---|---|---|
| `src/__tests__/cron-schedule-inventory.test.ts` | Cron list vs `cron.yml` / not `vercel.json` | Hobby silently runs two of ten |
| `src/app/api/cron/health/route.test.ts` | 401 without secret is pass | |
| `src/app/api/cron/abandoned-cart/route.test.ts` | Nudge eligibility | Email a paid cart |
| `src/app/api/cron/reap-carts/route.test.ts` | `fn_reap_expired_carts` | |
| `src/app/api/cron/retention/route.test.ts` / `weekly-digest/route.test.ts` | Extra jobs exist | Forget them in H5 |
| `src/app/api/health/route.test.ts` | Body is `{ ok, database }` only | Leak commit SHA |
| `src/lib/health/checks.test.ts` / `ready.test.ts` | Ready vs health | Confuse 503 with liveness |
| `src/__tests__/search.indexer.test.ts` / `search.qstash.test.ts` / `search.pipeline-contracts.test.ts` / `search.routes.test.ts` | Payload is notification; Meili unset = no-op success | Trust webhook body as product |
| `src/lib/search-server.test.ts` | Engine tag `meilisearch` \| `database` | |
| `src/lib/search/outbox-drain.test.ts` / `drift.test.ts` / `golden-queries.test.ts` / `hebrew-synonyms.test.ts` / `meili-settings.test.ts` | Index floor + Hebrew | |
| `src/app/api/search/rate-limit.test.ts` | 429 | Unbounded ILIKE |
| `src/components/layout/no-search-ui.test.ts` | No facet product; header field allowed (ADR 0010) | Re-delete the header and fail pixel refs |
| `src/server/actions/cart-merge-never-duplicates.test.ts` | Auth callback merge | Duplicate lines, double charge |
| `src/lib/cart/guest-session-cookie.test.ts` | Cookie options include Secure | Guest cart fixation |
| `src/lib/cart/read-failure-never-empties-the-cart.test.ts` | Read error ≠ empty cart | Wipe cart on a 500 |
| `src/lib/cart/price-error-line.test.ts` / `unavailable-message.test.ts` / `store.test.ts` / `snapshot.test.ts` / `coupon.test.ts` / `format.test.ts` / `product-page-quantity-ceiling.test.ts` | Cart honesty | |
| `src/components/cart/add-to-cart-refusal.test.tsx` / `unavailable-blocks-every-checkout.test.tsx` / `cart-checkout-button.test.tsx` | Unsellable cannot pay | Master row checkout |
| `src/app/(store)/checkout/failed/cart-survives-failure.test.ts` | Failed pay keeps cart | Empty cart after decline |
| `src/app/(store)/checkout/checkout-form-contract.test.tsx` / `saved-address-step-gate.test.tsx` / `return/auto-refresh-gives-up.test.tsx` | Checkout UX contract | Infinite poll |
| `src/lib/checkout/state-machine.test.ts` / `steps.test.ts` / `electro-content.test.ts` / `israeli-postal-code.test.ts` | | |
| `src/app/auth/callback/route.test.ts` | Merge guest cart | Drop cart on Google login |
| `src/lib/rate-limit/*.test.ts` (`headers`, `limiter`, `policies`, `sliding-window`, `upstash`) plus `src/lib/utils/rate-limit.test.ts` | 30/min scan, 15/hour PIN | Raise limits to "make tills work" |
| `src/app/api/wallet/apple/[id]/route.test.ts` | RLS not capability token; missing creds **404** | 500 looks like outage; id oracle |
| `src/app/api/admin/reports/[report]/route.test.ts` | 403 **plain text** | HTML login saved as `.csv` |
| `src/app/api/supplier/payouts/csv/route.test.ts` | Dead payout surface | Pretend a ledger exists |
| `src/lib/admin/payouts.test.ts` | Same | |
| `src/lib/wallet/*.test.ts` (`config`, `google-wallet`, `notify`, `pass-images`, `pass-model`, `pkpass`, `zip`) | Pass kit | Leak other people's voucher |
| `src/lib/security/frame-policy.test.ts` | Frame-return ungated | |

---

## 7. The rest of the inventory (not money, still in the tree)

Deleting these does not by itself break agorot or RLS. They are listed so "every test file" is true.

**E2E** (`e2e/*.spec.ts`):
`a11y`,
`admin-refund`,
`auth`,
`cart`,
`category`,
`checkout`,
`coupon-scan`,
`coupons`,
`full-purchase-redeem`,
`home`,
`layout-stability`,
`physical-purchase`,
`price-bidi`,
`product`,
`production-smoke`,
`purchase-flow`,
`region-menu`,
`render-mode`,
`rtl-mobile`,
`rtl-three-widths`,
`search`,
`smoke-all-routes`,
`touch-targets`.
Helpers:
`e2e/helpers.ts`,
`e2e/auth-session.ts`
(not tests).

`full-purchase-redeem`
and
`admin-refund`
are the e2e closest to money. They are not a substitute for G1–G10.

**App / content / SEO:**
`src/app/(account)/account/coupons/reachable.test.ts`,
`src/app/(legal)/legal-pages.test.ts`,
`src/app/content-pages.test.ts`,
`src/app/hebrew-copy.test.ts`,
`src/app/latin-field-direction.test.ts`,
`src/app/manifest.test.ts`,
`src/app/og-fonts.test.ts`,
`src/app/robots.test.ts`,
`src/app/sitemap.test.ts`,
`src/content/blog/blog.test.ts`,
`src/content/legal/legal-content.test.ts`,
`src/content/legal/legal-duplication.test.ts`,
`src/content/legal/legal-routes.test.ts`.

**Components / styles / a11y:**
`src/components/a11y/SkipLink.test.tsx`,
`src/components/admin/StatusBadge.test.ts`,
`src/components/analytics/ThirdPartyTags.test.tsx`,
`src/components/home/BenefitBar.test.tsx`,
`src/components/home/hero-animation-swap.test.tsx`,
`src/components/home/hero-dot-target.test.ts`,
`src/components/home/hero-still-frames.test.ts`,
`src/components/layout/TopBar.test.tsx`,
`src/components/layout/header-icons.test.ts`,
`src/components/pwa/install-prompt.test.tsx`,
`src/components/shared/share-buttons.test.tsx`,
`src/components/storefront/SupplierInfo.test.tsx`,
`src/components/storefront/product-variant-quantity.test.tsx`,
`src/components/ui/brand-placeholder.test.tsx`,
`src/lib/a11y/brand-contrast.test.ts`,
`src/lib/a11y/contrast.test.ts`,
`src/lib/a11y/image-alt.test.ts`,
`src/styles/checkout-tokens.test.ts`,
`src/styles/spacing-token-collision.test.ts`,
`src/styles/tokens.test.ts`.

**Admin forms / catalogue (not till):**
`src/lib/admin/feature-flags.test.ts`,
`src/lib/admin/import/parseProductsCsv.test.ts`,
`src/lib/admin/nav.test.ts`,
`src/lib/admin/product-fields.test.ts`,
`src/lib/admin/product-form-schema.test.ts`,
`src/lib/admin/product-variants.test.ts`,
`src/lib/admin/supplier-form.test.ts`,
`src/lib/admin/supplier-onboarding.test.ts`,
`src/lib/admin/vendor-form.test.ts`,
`src/lib/admin/voucher-view.test.ts`,
`src/lib/commerce/product-type.test.ts`,
`src/lib/commerce/stock-scarcity.test.ts`,
`src/lib/commerce/whatsapp-schema-error.test.ts`,
`src/__tests__/admin-or-filters-are-sanitised.test.ts`.

**Account / auth UX:**
`src/lib/account/delete-account.test.ts`,
`src/lib/account/format.test.ts`,
`src/lib/account/saved-cards.test.ts`,
`src/lib/auth/login-redirect.test.ts`,
`src/lib/auth/mfa.test.ts`,
`src/lib/auth/password-reset.test.ts`,
`src/lib/auth/phone-merge.test.ts`,
`src/lib/auth/phone-otp.test.ts`,
`src/__tests__/auth.validations.test.ts`,
`src/server/actions/auth-coverage.test.ts`,
`src/server/actions/auth-error-map.test.ts`,
`src/server/actions/auth-redirect.test.ts`,
`src/server/queries/account-labels.test.ts`.

**Misc lib:**
`src/__tests__/cart.validations.test.ts`,
`src/__tests__/ci-gate-scope.test.ts`,
`src/__tests__/example.test.ts`,
`src/__tests__/pending-migrations-inventory.test.ts`,
`src/lib/api/api-contract.test.ts`,
`src/lib/app/deep-links.test.ts`,
`src/lib/cached-reads-fail-loudly.test.ts`,
`src/lib/catalogue-cache.test.ts`,
`src/lib/catalogue-render-path.test.ts`,
`src/lib/category-page-read-failure.test.ts`,
`src/lib/category-page.test.ts`,
`src/lib/coupons/generator.test.ts`,
`src/lib/db/enum-declarations.test.ts`,
`src/lib/deployed-runtime.test.ts`,
`src/lib/discarded-read-inventory.test.ts`,
`src/lib/email/admin-alerts.test.ts`,
`src/lib/email/brand-colour.test.ts`,
`src/lib/email/notifications.test.ts`,
`src/lib/email/outbox-kinds.test.ts`,
`src/lib/feeds/merchant.test.ts`,
`src/lib/feeds/rss.test.ts`,
`src/lib/feeds/xml.test.ts`,
`src/lib/geo/cities.test.ts`,
`src/lib/geo/distance.test.ts`,
`src/lib/growth/cart-units.test.ts`,
`src/lib/growth/discount.test.ts`,
`src/lib/growth/resend.test.ts`,
`src/lib/homepage/cms.test.ts`,
`src/lib/images/alt-text.test.ts`,
`src/lib/images/dimensions.test.ts`,
`src/lib/images/process.test.ts`,
`src/lib/images/remote-hosts.test.ts`,
`src/lib/ke-live-categories.test.ts`,
`src/lib/ke-live-deals.test.ts`,
`src/lib/live-home-sections.test.ts`,
`src/lib/observability/action-context.test.ts`,
`src/lib/observability/alert.test.ts`,
`src/lib/observability/axiom.test.ts`,
`src/lib/observability/log-coverage.test.ts`,
`src/lib/observability/log.test.ts`,
`src/lib/observability/payment-alarm-push.test.ts`,
`src/lib/observability/request-id.test.ts`,
`src/lib/observability/sentry.test.ts`,
`src/lib/observability/with-request-log.test.ts`,
`src/lib/og/product-card.test.ts`,
`src/lib/payments/accounts.test.ts`,
`src/lib/payments/token-expiry.test.ts`,
`src/lib/push/dispatch.test.ts`,
`src/lib/push/expo.test.ts`,
`src/lib/push/templates.test.ts`,
`src/lib/regions.test.ts`,
`src/lib/reports/csv.test.ts`,
`src/lib/resilience/chaos.test.ts`,
`src/lib/reviews/reviews.test.ts`,
`src/lib/seo/json-ld.test.ts`,
`src/lib/seo/lastmod.test.ts`,
`src/lib/seo/normalize-path.test.ts`,
`src/lib/share/message.test.ts`,
`src/lib/site-url.test.ts`,
`src/lib/soft-delete.test.ts`,
`src/lib/supabase/anon.test.ts`,
`src/lib/supabase/bearer.test.ts`,
`src/lib/supabase/optional-columns.test.ts`,
`src/lib/supabase/request-id-fetch.test.ts`,
`src/lib/supabase/timeout-fetch.test.ts`,
`src/lib/supplier-contact.test.ts`,
`src/lib/supplier-storefront.test.ts`,
`src/lib/supplier/dashboard.test.ts`,
`src/lib/supplier/orders.test.ts`,
`src/lib/supplier/products.test.ts`,
`src/lib/template-assets.test.ts`,
`src/lib/utils/search-escape.test.ts`,
`src/lib/waze.test.ts`,
`src/lib/whatsapp.test.ts`,
`src/lib/whatsapp/outbox.test.ts`,
`src/lib/whatsapp/twilio.test.ts`,
`src/lib/wp/wxr.test.ts`,
`src/server/actions/admin/reports.test.ts`,
`src/server/actions/contact.test.ts`,
`src/server/ai/client.test.ts`,
`src/server/domain/reports/report-exports.test.ts`,
`src/server/domain/reports/settlement-report.test.ts`,
`src/server/queries/admin-reports-migration.test.ts`,
`src/server/queries/admin-reports.test.ts`,
`src/server/queries/order-reads-fail-loudly.test.ts`,
`src/server/queries/voucher-reads-fail-loudly.test.ts`.

**Seeds:**
`scripts/seed/catalogue-data.test.ts`,
`scripts/seed/demo-data.test.ts`,
`scripts/seed/generated-sql.test.ts`,
`scripts/seed/launch-bar.test.ts`.

---

## 8. What this map is not

It is not coverage %. It is not permission to delete a "misc" test because this pack called it not-money. `legal-duplication` and `hebrew-copy` stop escrow language on
`/legal/returns`
(R19). That is launch-adjacent even though it never touches agorot.

---

## 9. Second-pass gaps

| Id | Missing protection | If someone "fixes" without a test |
|---|---|---|
| **G11** | Stock consume failure must not un-pay | A later patch throws from `consume_order_stock` and leaves a charged customer without a voucher |
| **G12** | `payment_tokens` has a single insert site (finalize) | A checkout client insert of tokens bypasses Cardcom |
| **G13** | Mobile queue must not settle locally | Offline "success" then drain double-consumes or lies |
| **G14** | `reportPurchase` dedupe on order id | Thank-you page + finalize = two purchases in ad spend |

`src/lib/account/saved-cards.test.ts`
already pins G12. G11/G13/G14 are still holes.

---

## 10. Third-pass gaps (from the rest of this pack)

| Id | Missing protection | Evidence | What would catch it |
|---|---|---|---|
| **G15** | Pending SQL numbers must be unique | Four numbers (169, 170, 171, 172) each have **two** files in `migrations/pending/` | Extend `pending-migrations-inventory.test.ts` to fail on duplicate `\d{3}_` prefixes. Today it only checks README ↔ directory names |
| **G16** | `percentageOf` ≡ `applyBp` on non-negative integers | `commission.ts` calls commerce `percentageOf`. Settlement docs tell people to use `applyBp`. No test that they match on a table of `(amount, bp)` | Shared fixture: both functions on the same vectors, including `bp=5000` half-up |
| **G17** | Guest cookie rename | `anon.test.ts` pins `Cookie: session_id=`. Nothing fails if RLS is edited to `ke_session_id` or if the client starts forwarding the browser jar | Contract test: policy SQL contains `->>'session_id'` **and** guest client sends that name **and** does not forward `Cookie` from the request |
| **G18** | Admin webhooks tab vs zero-policy | 172_rls comments the bug. No test that `/admin/payments` webhooks uses `createAdminClient` | Source scan: webhooks tab must not call `createClient()` (user-scoped) for `payment_webhook_events` |
| **G19** | Payout types-ahead | `database.ts` has `payout_statements`. Actions still 42P01 against historical production | Test that `admin/payouts.ts` is treated as dead, **or** a live probe (not this pack) that the tables exist before UI calls them |
| **G20** | 169 whitelist vs `SERVER_EVENT_NAMES` | `registry-matches-migration.test.ts` exists. Confirm it fails if 169 is not applied **or** only if the SQL file drifts. Silent skip of `purchase` is R24 | If the test only diffs the pending file, CI is green while production still drops the four names |

`pending-migrations-inventory.test.ts`
protects README ↔ files, **not** uniqueness of the numeric prefix, **not** "has this been applied". Deleting it lets the README lie again (already happened three times per its own header).

`src/lib/supabase/anon.test.ts`
is the closest pin for G17. It is not enough if someone edits only the SQL policy.

`src/__tests__/money-no-float.test.ts`
allowlists
`percentToBp`
and
`ilsToAgorot`.
It does **not** allowlist a new
`parseFloat`
in
`commission.ts`.
G16 is the remaining money-math fork.

Pixel
`e2e/price-bidi.spec.ts`
protects the shekel glyph side. It does **not** replace 171_category (datum vs render). Deleting the e2e ships a category name with the sign on the wrong side **in Chromium**; the read-path repair in
`getAllCategories`
is the other pin.

---

## 11. Tests this pass adds to the inventory (already on disk, previously folded into "misc")

| File | Protects | If deleted |
|---|---|---|
| `src/lib/supabase/anon.test.ts` | Guest client sends `session_id` cookie, not the browser jar | G17 becomes a comment |
| `src/__tests__/pending-migrations-inventory.test.ts` | README names every pending/applied/cancelled SQL file | Ghost migrations in the launch README |
| `src/lib/analytics/registry-matches-migration.test.ts` | Event names vs 169 SQL list | Four funnel events 0 rows and nobody notices |
| `e2e/price-bidi.spec.ts` | Shekel bidi at 380/768/1440 | Category `under-99` paints ₪ on the wrong side |
| `src/lib/money-format.test.ts` | Display isolates. Not arithmetic | (already in §1 as display-only) |

Closing G1–G20 is a **code** branch. This pack still does not run
`pnpm`
and still does not edit
`.ts`.

