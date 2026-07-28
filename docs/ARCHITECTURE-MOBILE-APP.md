# ARCHITECTURE-MOBILE-APP.md

KenyonExpress future Israeli-market super-app architecture.

Status: BINDING design for later implementation (`arch/admin-supplier` docs freeze 2026-07-28)
Worktree: `/Users/ofir/kenyonexpress-web/ke-arch` only (docs). No application code.
Companions: `docs/ARCHITECTURE-SUPPLIER-PORTAL.md`, `docs/ARCHITECTURE-NOTIFICATIONS.md`, `docs/ARCHITECTURE-ADMIN-DASHBOARD.md`.

Backend of record: existing Supabase project (Auth, Postgres, RLS, Storage/R2 URLs). The app does **not** get a separate database.

Platform rules (fixed): KenyonExpress is a platform, never a supplier. Coupon prepaid stays with the platform; till balance at merchant on scan; physical split by snapshotted `platform_percent`; no Escrow; money in **agorot**; coupons-first.

---

## 0. Product intent

A single mobile app for Israeli customers (and later supplier scan tooling) that:

1. Browses and buys coupons (then physical).
2. Holds an **internal-only** digital wallet (cashback spendable only inside KenyonExpress).
3. Shows vouchers / QR for redemption at merchants.
4. Receives push for order/voucher events.
5. May later include **first-party** delivery / logistics modules built in-house. **No** external delivery-network partnership as the architecture centerpiece.

---

## 1. Native vs cross-platform (decision)

**Decision: React Native (Expo) as the customer app shell.**

| Option | Verdict |
|---|---|
| Fully native Swift + Kotlin | Highest cost; two voucher/wallet UIs; rejected for v1 team size |
| Flutter | Viable, but stack mismatch with existing TypeScript/Next domain types |
| **Expo (React Native) + shared TS types** | **Chosen**: one language with web, reuse Zod/domain packages, OTA updates, camera for QR display/scan |
| PWA only | Insufficient for reliable push + camera + store presence in IL market long-term; remains a parallel web channel |

Supplier scan may ship as:

- the same app with a "מצב ספק" gated by `supplier_members`, or
- a thin second Expo scheme / flavor.

**Open Q-MOB-1:** one binary with role switch vs separate `KenyonExpress Supplier` listing.

Web (`Next.js` App Router) remains the SEO and desktop channel. App is not a rewrite of the backend.

---

## 2. Shared backend and auth

| Concern | Mechanism |
|---|---|
| Auth | Supabase Auth (email OTP / Google as web today). App uses `@supabase/supabase-js` with secure storage for session |
| API | PostgREST via RLS + existing Server Actions only where secrets required (prefer Edge Functions / Route Handlers with user JWT) |
| Identity | `profiles.id` = `auth.users.id`; `user_role` coarse; supplier fine-grained via `supplier_members` |
| Catalog | Read `products`, `categories` (published only) |
| Checkout | Reuse Cardcom flows via backend Route Handlers; **do not** embed Cardcom secrets in the app |
| Vouchers | `vouchers`, `voucher_redemptions` |
| Wallet | `wallet_accounts`, `wallet_entries`, `v_wallet_ledger` |
| Notifications prefs | `user_notification_preferences` |

App never uses the service-role key. Redeem for suppliers still goes through `redeem_voucher` with user JWT (same as `POST /api/supplier/vouchers/redeem`).

---

## 3. Wallet and cashback (end to end)

### 3.1 Rules (binding)

1. Wallet is **internal only**. No cash-out, no bank withdraw, no card payout of wallet balance.
2. Balance can only be applied to KenyonExpress checkout (`cashback_applied_agorot` / wallet apply on `orders`).
3. Credits originate from cashback rules / order finalize (`order_cashback` reasons) and admin adjust (`adminAdjustWallet`).
4. Double-entry: `wallet_entries` with `idempotency_key`; post-059/089 amounts in **agorot**.
5. User balance cannot go negative (`wallet_accounts_user_nonneg_agorot`).

### 3.2 Tables

| Table | App use |
|---|---|
| `wallet_accounts` | show balance for `user_id` |
| `wallet_entries` / `v_wallet_ledger` | ledger UI |
| `cashback_rules` | server-side only; app displays resulting entries |
| `orders.cashback_applied_agorot` | applied at purchase |

### 3.3 UX

- Account → Wallet: balance, ledger, expiry if rules add expiry (**Q-MOB-2**: do cashback entries expire?).
- Checkout: toggle "השתמש ביתרה" calling existing checkout apply path.
- Empty states in Hebrew; amounts formatted as ₪.

Platform accounts (`platform:revenue`, `platform:cashback_reserve`, `platform:adjustments`) are never exposed to the app.

---

## 4. Push notifications

Compose with `docs/ARCHITECTURE-NOTIFICATIONS.md`.

| Channel | Customer app | Admin |
|---|---|---|
| Transactional push | FCM / APNs via Expo Notifications; worker writes `channel=push` outbox | ntfy.sh (separate) |
| Email | Resend (unchanged) | ops email |

Device registration table (**migration needed**):

```sql
CREATE TABLE public.push_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expo_push_token text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('ios','android')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, expo_push_token)
);
```

Worker maps outbox `push` rows → Expo push API. Dedupe still via `notifications_outbox.dedupe_key`.

Kinds relevant to app: `order.paid`, `voucher.issued`, `voucher.expiry_*`, `voucher.redeemed`, `order.refunded`.

---

## 5. Offline strategy

| Feature | Offline behavior |
|---|---|
| Catalog browse | Last-success cache (React Query / SQLite); mark stale |
| Checkout / pay | **Online required** |
| Customer voucher QR | Cache issued vouchers encrypted on device for display; status refresh when online |
| Supplier redeem | Queue intents with stable `idempotency_key` (same as web PWA IndexedDB design in supplier portal doc); drain via redeem API |
| Wallet balance | Show cached with "לא מעודכן" until refresh; never allow offline spend |

Conflict rule: server voucher status always wins.

---

## 6. Coupon flows on mobile

### 6.1 Customer

1. Purchase → finalize issues `vouchers` rows (web path today).
2. App lists `/account/vouchers` equivalent from `vouchers` where `user_id = me`.
3. Detail shows QR from `qr_payload` / signed `KEV1...` and code text.
4. After merchant scan, status → `redeemed`; push + list refresh.
5. Show that till balance was due at merchant; platform kept online prepaid.

### 6.2 Supplier scanner (in-app)

Reuse portal rules:

- Membership via `supplier_members`
- `POST /api/supplier/vouchers/redeem` with JWT
- Camera permission; manual entry fallback
- Collapse `wrong_supplier` to not_found
- Single-use via conditional UPDATE in `redeem_voucher`

Do not implement a second money path in the client.

---

## 7. Deep linking

| Link | Opens |
|---|---|
| `https://kenyonexpress.co.il/product/{slug}` | App PDP if installed (Universal Links / App Links), else web |
| `https://kenyonexpress.co.il/account/vouchers/{id}` | Voucher detail |
| `https://kenyonexpress.co.il/redeem/{token}` | Existing web redeem route; app handles if scheme claimed |
| `kenyonexpress://voucher/{id}` | Custom scheme fallback |

Associated domains must match production host after SEO cutover (**Q-SEO-5**).
Preserve `seo_redirects` on web; app should resolve final path.

---

## 8. First-party delivery (future)

Any delivery feature is an **internal** module (own drivers / own scheduling tables), not a DoorDash-style external integration as the core design.

Sketch only (not coupons-first scope):

- `delivery_jobs` referencing `order_items` physical lines
- Supplier or platform fleet accounts as `profiles` + membership
- Tracking events in-house

**Open Q-MOB-3:** whether delivery is ever in-scope for IL launch year.

---

## 9. Security

| Threat | Control |
|---|---|
| Extract service role from app | Never ship it |
| Screenshot voucher theft | Short session; optional blur in switcher; server single-use still decisive |
| Replay redeem offline | Idempotency keys + server conditional UPDATE |
| Jailbreak wallet tampering | Server balance authoritative |
| Push token hijack | Bind token to `user_id` via authenticated register endpoint |
| Deep link takeover | Auto Verify / assetlinks; no sensitive actions via GET without session |

---

## 10. Rollout path (web → app)

1. Stabilize web coupons checkout, vouchers, wallet ledger (agorot), supplier redeem.
2. Publish public API contracts (read DTOs) versioned for mobile.
3. Expo app: auth, catalog, PDP, checkout handoff, vouchers, wallet read.
4. Push devices + worker push channel.
5. Supplier scan mode in app (or second listing).
6. Offline redeem queue parity with PWA.
7. Store listings (Hebrew metadata, IL pricing display).
8. Only then consider physical shipping UX and first-party delivery.

Web SEO channel stays primary for acquisition; app for retention and scan.

---

## 11. Open questions

| ID | Question |
|---|---|
| Q-MOB-1 | One app vs separate supplier app |
| Q-MOB-2 | Cashback expiry policy |
| Q-MOB-3 | Delivery in-house timeline |
| Q-MOB-4 | Biometric lock for voucher screen? |
| Q-MOB-5 | Minimum iOS / Android versions for IL market share |
| Q-MOB-6 | App Store entity / DUNS for Israeli company |

---

## 12. Related backend objects

| Object | Role |
|---|---|
| `profiles`, `user_role` | identity |
| `products`, `categories` | catalog |
| `orders`, `order_items` | purchases + snapshots |
| `vouchers`, `voucher_redemptions` | coupon lifecycle |
| `wallet_accounts`, `wallet_entries`, `v_wallet_ledger` | internal wallet |
| `cashback_rules` | accrual rules |
| `supplier_members`, `redeem_voucher` | scan |
| `notifications_outbox`, prefs | messaging |
| `payments` + Cardcom webhook | capture |
