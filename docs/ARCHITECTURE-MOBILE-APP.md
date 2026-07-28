# ARCHITECTURE-MOBILE-APP.md

KenyonExpress Israeli-market mobile super-app architecture (future).

Status: BINDING design freeze for `arch/admin-supplier` (2026-07-28)
Worktree: `/Users/ofir/kenyonexpress-web/ke-arch` only. **Documentation only.**
Authority: `MASTER-ARCHITECTURE-v2.md` §1 business model; §6 mobile row (**React Native + Expo monorepo, Phase 6; PWA as bridge**); shared Supabase backend; approved externals only (Cardcom, Resend, Meta, Sentry, Better Stack). No separate app database. No external delivery-network partnership as core design (any delivery is first-party later).

---

## 0. Money model the app must display

Identical to MASTER-ARCHITECTURE-v2 §1 / C1 / C10 / C11:

| Type | On-site charge | Platform keeps | Supplier from platform |
|---|---|---|---|
| Coupon | Absolute `coupon_price` | 100% of prepaid | 0 (balance at merchant on scan) |
| Physical | Full price | Dynamic **`platform_percent`** (admin per product, **no default**, snapshotted) | Residual after T+3 / min 100 ILS |

- App **never** invents a commission. It reads published catalog fields and order/voucher **snapshots**.
- Changing `platform_percent` on a product later must not rewrite past order screens (immutable snapshots).
- **Internal wallet only.** Cashback / `refund_credit` spendable only on KenyonExpress checkout. Never cash-out.
- Expired unredeemed coupon → wallet credit (5 years on `refund_credit`), surfaced in wallet UI.
- No Escrow messaging anywhere in the app.

---

## 1. Native vs cross-platform

**Decision (v2): React Native + Expo in monorepo, Phase 6. PWA is the bridge until then.**

| Option | Verdict |
|---|---|
| Pure native two codebases | Rejected for team size |
| Flutter | Stack mismatch with TS domain |
| **Expo + shared TS types/Zod** | **Chosen** |
| PWA only forever | Insufficient long-term for IL store presence + push; keep as web/PWA channel |

Supplier scan: same app role mode **or** separate listing (**Q-MOB-1**). Until Phase 6, supplier scan remains web PWA `/supplier/scan`.

---

## 2. Shared backend and auth

| Concern | Mechanism |
|---|---|
| Auth | Supabase Auth (same project as web) |
| Session | Secure storage; refresh; never service-role in the binary |
| Catalog | RLS read of published `products` / `categories` |
| Checkout | Backend Route Handlers / Server Actions; Cardcom Low Profile or token charge server-side only (SAQ-A) |
| Orders / items | Read own rows; show snapshotted money |
| Vouchers | `vouchers` / legacy `coupon_codes` as deployed; QR display from signed payload |
| Redeem (supplier) | Same `redeem_*` RPC + JWT membership as web |
| Wallet | `wallet_accounts`, `wallet_entries`, `v_wallet_ledger`; transfer only via service_role definers |
| Notifications | `notifications_outbox` + prefs; register `push_subscriptions` (v2 planned table) |

Guest browse may mirror web (`ke_session_id` semantics) but **login enforced at pay** (v2 §1.6).

---

## 3. Wallet and cashback (end to end)

1. Earn: finalize / rules → debit `platform:cashback_reserve` → credit user (`wallet_earn`).
2. Spend: checkout `apply_wallet` limited to balance and on-site charge (`wallet_spend`).
3. Coupon expiry credit: `refund_credit`, 5-year policy (v2 C6).
4. Benefit expiry: cashback/referral 24 months FIFO per accrual line (v2); **Q-MOB-2** confirm product copy.
5. UI: balance, ledger, no withdraw button, Hebrew empty states.
6. Offline: show stale balance labeled; **never** allow offline spend.

Admin adjust remains web/admin only.

---

## 4. Push notifications

Compose with `docs/ARCHITECTURE-NOTIFICATIONS.md`.

- Customer: Expo push via worker reading `channel=push` outbox + device table (`push_subscriptions` / `push_devices` migration planned in v2).
- Admin: ntfy / Better Stack, not in customer app.
- Kinds: `order.paid`, `voucher.issued`, expiry reminders, `voucher.expired_credited`, refunds.
- Dedup still `notifications_outbox.dedupe_key`.

---

## 5. Offline strategy

| Feature | Policy |
|---|---|
| Catalog | Cache last success; mark stale |
| Pay | Online required |
| Customer QR | Cache issued vouchers for display; refresh status online |
| Supplier redeem | Queue with idempotency keys; drain to redeem API (parity with PWA) |
| Wallet | Cached read-only |

Server voucher status always wins.

---

## 6. Coupon flows on mobile

### Customer

1. Purchase via shared checkout backend → issued voucher/code.
2. List and detail: code + signed QR (`Ed25519` / keyed HMAC per security ADR).
3. Show: paid online (`coupon_price`), balance due at merchant, expiry.
4. After scan: status used/redeemed; push; **no** "money arriving from KenyonExpress" for the prepaid portion.

### Supplier scanner

Membership via `supplier_members`; rate limit 30/min; conditional single-use UPDATE; wrong shop → external not_found; never trust `supplier_id` from QR body.

Dynamic `platform_percent` is irrelevant to till collection UX; till = face − coupon_price from snapshot.

---

## 7. Deep linking

Universal Links / App Links for:

- `/product/{slug}` or `/products/{slug}` (canonicalize with SEO doc)
- voucher deep links / `redeem/{token}`
- custom scheme fallback `kenyonexpress://...`

Must match production host after `seo_redirects` cutover. Web remains SEO acquisition channel (v2 track C); app is retention + scan.

---

## 8. First-party delivery (non-goals for Phase 6)

Any logistics module is **internal** tables/jobs later. Not DoorDash-style external integration. **Q-MOB-3:** year-one scope.

---

## 9. Security

No service role in app; single-use server enforce; redact tokens in crash analytics; authenticated push token bind; deep links do not mutate money via GET; biometric lock optional (**Q-MOB-4**).

---

## 10. Rollout (web → PWA → Expo)

Aligned with v2 Phase 6:

1. Stabilize web: coupons checkout, vouchers, wallet agorot, redeem, dynamic admin `platform_percent` + `coupon_price`.
2. PWA bridge (supplier scan already).
3. Publish versioned read DTOs for mobile.
4. Expo: auth, catalog, PDP (correct prices), checkout handoff, vouchers, wallet.
5. Push devices + worker.
6. Supplier mode or second app.
7. Store listings (Hebrew).
8. Physical shipping UX only after coupons-stable; delivery later if ever.

---

## 11. Open questions

| ID | Question |
|---|---|
| Q-MOB-1 | One binary vs supplier app |
| Q-MOB-2 | Wallet expiry copy for cashback vs refund_credit |
| Q-MOB-3 | First-party delivery timeline |
| Q-MOB-4 | Biometric on voucher screen |
| Q-MOB-5 | Min iOS/Android versions for IL |
| Q-MOB-6 | App Store legal entity |

---

## 12. Related backend objects

`profiles`, `products` (`platform_percent`, `coupon_price_*`), `orders` / `order_items` (snapshots), `vouchers` / `coupon_codes`, `voucher_redemptions` / scan events, `wallet_*`, `supplier_members`, `notifications_outbox`, `payments`, Cardcom webhook finalize path.

`MASTER-ARCHITECTURE-v2.md` §1, §4 flows, §6 mobile; `docs/ARCHITECTURE-NOTIFICATIONS.md`; `docs/ARCHITECTURE-SECURITY-COMPLIANCE.md`.
