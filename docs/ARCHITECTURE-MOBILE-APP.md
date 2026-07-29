# ARCHITECTURE-MOBILE-APP.md

KenyonExpress future mobile **super-app** plan (binding design).

Status: BINDING for `arch/admin-supplier` (2026-07-29)
Worktree: `/Users/ofir/kenyonexpress-web/ke-arch` only. **Documentation only.**
Premise: one **Supabase** project shared with the Next.js web app. No separate mobile database. No Make/Zapier. Approved externals only (Cardcom, Resend, Meilisearch, R2, Sentry, Ntfy for ops).

---

## 0. Goal

Ship an Israeli-market super-app that reuses the same backend contracts as web:

- Catalog browse and PDP (correct on-site prices)
- Guest browse → login at pay
- Coupon purchase, wallet, voucher QR
- Supplier scanner (QR redeem)
- Push for the same notification events as `docs/ARCHITECTURE-NOTIFICATIONS.md`
- Later: physical fulfillment UX; optional first-party delivery (not a third-party network partnership)

Web remains the SEO acquisition channel (`docs/ARCHITECTURE-SEO-PERFORMANCE.md`). The app is retention, push, and scan.

---

## 1. Money model (must match web)

| Type | On-site charge | Platform | Supplier from platform |
|---|---|---|---|
| Coupon | Absolute `coupon_price_ils` (**paid in full on site**) | Keeps prepaid (`platform_settled`); **no Escrow** | 0 from prepaid; till balance collected at merchant on scan |
| Physical | Discounted sticker | Dynamic `platform_percent` (no default) | Residual after T+3 / min payout |

App rules:

1. Never invent commission. Read catalog fields and **order_items / voucher snapshots**.
2. Changing live `platform_percent` must not rewrite past order screens.
3. Internal wallet only; no cash-out.
4. No Escrow wording in UI copy.

---

## 2. Platform choice

**Decision: React Native + Expo in the monorepo (Phase 6). PWA is the bridge until then.**

| Option | Verdict |
|---|---|
| Two pure-native codebases | Rejected (team size) |
| Flutter | Rejected (TS domain mismatch) |
| **Expo + shared Zod/DTOs** | **Chosen** |
| PWA forever | Insufficient for store presence + push; keep as web/PWA channel |

Shared packages (target): `packages/contracts` (Zod), money helpers (agorot), notification event names. Mobile calls the same Route Handlers / RPCs as web; it does not fork business rules.

---

## 3. Same Supabase backend

| Concern | Mechanism |
|---|---|
| Auth | Supabase Auth (same project) |
| Session | Secure device storage; refresh; **never** ship service-role |
| Catalog | RLS read of published `products` / `categories` |
| Search | Meilisearch via backend proxy (same index as web) |
| Media | R2 URLs (same as web `next/image` sources) |
| Checkout | Server-only Cardcom (SAQ-A); app opens Low Profile / awaits webhook state |
| Orders | Read own rows; display snapshotted money |
| Vouchers | Same `vouchers` table; signed QR payload |
| Redeem | Same `redeem_voucher` RPC + `supplier_members` |
| Wallet | Same `wallet_*` tables; transfers only via SECURITY DEFINER / service role on server |
| Notifications | Same `notification_events` / `notification_log`; register push device tokens |

Guest cart may mirror web cookie semantics, but **login is required at pay**.

---

## 4. App surfaces (super-app modules)

| Module | Phase | Notes |
|---|---|---|
| Auth (email OTP / Google) | 6.0 | Same providers as web |
| Home + category + PDP | 6.0 | Prices = on-site charge only |
| Search | 6.0 | Meilisearch |
| Cart + checkout handoff | 6.0 | No Cardcom secrets in app |
| My vouchers + QR | 6.0 | Offline display cache; online status wins |
| Wallet ledger | 6.0 | Read-only offline |
| Push inbox | 6.1 | Maps to notification event types |
| Supplier scan mode | 6.1 | Or separate listing (Q-MOB-1) |
| Physical order tracking | 6.2 | After coupons stable |
| First-party delivery | later | Internal only; not DoorDash-style partner |

---

## 5. Coupon and redeem flows

### Customer

1. Pay via shared checkout → `order.paid` + `coupon.issued` (notifications worker may push).
2. Voucher list: code + QR; show paid online + till remainder + expiry.
3. After merchant scan: status redeemed; push `coupon.redeemed`.
4. Calendar expiry: `coupon.expired` (+ wallet credit UI if credited).

### Supplier scanner

- Membership via `supplier_members` (owner/manager/scanner).
- Same idempotency + rate limit as web PWA.
- Never trust `supplier_id` from QR body.
- Till collection UX is offline cash; unrelated to `platform_percent`.

---

## 6. Push notifications

Compose with `docs/ARCHITECTURE-NOTIFICATIONS.md`.

- Register device → `push_devices` (planned) bound to `user_id`.
- Worker sends `channel=push` from the same fanout as email/in-app.
- Customer kinds: `order.paid`, `coupon.issued`, `coupon.redeemed`, `coupon.expired`, `order.refunded`.
- Supplier kinds: `order.physical_supplier_alert`, `payout.sent`.
- Admin stays on Ntfy / ops tools, not in the consumer app.
- Dedup: same idempotency keys as email layer.

---

## 7. Offline

| Feature | Policy |
|---|---|
| Catalog | Cache last success; mark stale |
| Pay | Online required |
| Customer QR | Cache issued vouchers for display |
| Supplier redeem | Queue intents + idempotency keys; drain when online |
| Wallet | Cached read-only; never offline spend |

Server voucher status always wins over cache.

---

## 8. Deep linking

Universal Links / App Links:

- `https://kenyonexpress.co.il/product/{slug}`
- `https://kenyonexpress.co.il/category/{slug}`
- voucher / account deep links
- fallback scheme `kenyonexpress://…`

Must respect `seo_redirects` after WP cutover. Deep links never mutate money via GET.

---

## 9. Security

- No service-role in the binary
- Biometric lock optional on voucher screen (Q-MOB-4)
- Redact tokens in crash analytics
- Push token bound to authenticated user
- Certificate pinning optional later; TLS to Supabase/Cardcom only through approved SDKs

---

## 10. Rollout (web → PWA → Expo super-app)

1. Stabilize web: coupons, checkout, vouchers, wallet agorot, redeem, admin dynamic money fields.
2. PWA bridge (especially `/supplier/scan`).
3. Publish versioned read DTOs / Zod contracts for mobile.
4. Expo app: auth, catalog, PDP, checkout handoff, vouchers, wallet.
5. Push devices + worker channel.
6. Supplier mode (in-app) or second store listing.
7. Hebrew App Store / Play listings.
8. Physical shipping UX; delivery only if product requires it.

---

## 11. Open questions

| ID | Question |
|---|---|
| Q-MOB-1 | One binary with role switch vs separate supplier app |
| Q-MOB-2 | Wallet expiry copy (cashback vs refund_credit) |
| Q-MOB-3 | First-party delivery timeline |
| Q-MOB-4 | Biometric on voucher screen |
| Q-MOB-5 | Min iOS / Android versions for IL |
| Q-MOB-6 | App Store legal entity |

---

## 12. Acceptance (when Phase 6 starts)

- [ ] Same Supabase project as web; no shadow DB
- [ ] PDP shows coupon paid-in-full / physical discounted price; no Escrow copy
- [ ] Orders screen uses snapshots, not live `platform_percent`
- [ ] Redeem parity with web RPC + offline queue
- [ ] Push events align with notifications architecture idempotency keys
- [ ] SEO web remains canonical for crawl; app links resolve to the same slugs

---

## 13. Related

`docs/ARCHITECTURE-NOTIFICATIONS.md`, `docs/ARCHITECTURE-SEO-PERFORMANCE.md`, `docs/ARCHITECTURE-SUPPLIER-PORTAL.md`, `docs/ADMIN-PRODUCT-PAGE-SPEC.md`, `docs/ARCHITECTURE-SECURITY-COMPLIANCE.md`.
