# MASTER ARCHITECTURE: Checkout, Commission, Coupon Redemption, Personal Area, Supplier Dashboard

Status: **REFRESHED 2026-08-06** (was STALE). Originally written 2026-07-23 against live DB `ixvwfbuvfxxsjiywhbbb`.
Money rule: agorot integers only, zero floats past the ILS/agorot boundary.
Scope: reconciles the authoritative business rules with the applied live schema (007 + 044 + 045 + 046 + 047) and the unapplied drafts (026, 027, 042).

> **מה תוקן בריענון הזה, ולמה המסמך היה STALE.**
>
> הנוסחה בסעיף 1 הייתה נכונה כל הזמן: הכנסת הפלטפורמה היא `platform_percent`
> של ערך הנקוב, **בשני סוגי המוצרים**. מה שהפך את המסמך למטעה היו ההערות
> שלצידה, שכינו את אותו ערך "the 10%" ואת יתרת הספק "the 90%", כאילו קיימת
> ברירת מחדל. **אין ברירת מחדל כלל** (הכרעת `docs/CONTRADICTIONS.md` C1/C2,
> 2026-07-24): `products.platform_percent` הוא שדה חובה פר מוצר, `NOT NULL`
> בלי `DEFAULT`, ומיגרציה 050 הסירה כל default והוציאה את `commission_percent`
> מתפקיד מפתח הפיצול. קורא שלקח את "10%" כמספר אמיתי היה בונה חישוב כסף שגוי
> על מסמך שנוסחתו נכונה.
>
> **סעיף 14 (שער ההכרעה) היה החצי השני של הבעיה:** שש שאלות פתוחות שכולן
> הוכרעו מאז, כולל אחת שהוכרעה **הפוך** ממה שהיא ניסחה. שאלה שנענתה ונשארה
> כתובה כשאלה היא הדרך המהירה ביותר שמסמך הופך לשקר. הסעיף נכתב מחדש כיומן
> הכרעות.
>
> **מודל הכסף המחייב:** אין Escrow חיצוני ואין J5; `platform_percent` דינמי
> פר מוצר עם snapshot ל-`order_items`; ארנק פנימי בלי משיכה החוצה; מיגרציות
> פרודקשן דרך MCP בלבד. ראה `docs/MASTER-INDEX.md`.

---

## 0. Authoritative rules and the conflicts they create with live code

The business rules below are authoritative. Where the live code disagrees, the code changes, not the rules.
`docs/CONTRADICTIONS.md` (RESOLVED 2026-07-24) outranks this table wherever the two differ.

| # | Authoritative rule | Live code today | Action |
|---|---|---|---|
| R1 | Coupon: customer pays a per-product `coupon_price` on site (a free field, **not** a percentage of the deal - C4), the remainder is collected in-store on scan, then the coupon expires. **No EXTERNAL escrow and no J5** (C3): the on-site charge is a `held` row in our own ledger until redemption. | `047` creates `escrow_holds`; redeem route releases escrow on scan. | **Remove the external-escrow framing and the `escrow_holds` table.** Keep the internal `held` state in `commission_ledger` / `wallet_entries` only. |
| R2 | Physical: customer pays 100%; platform keeps `platform_percent` (per product, admin-set, **mandatory with no default** - C1). Remainder to supplier. | `047` added a second column `products.commission_percent` (default 5) as the physical cut; `platform_percent` used only for coupons. Three overlapping percent columns. | **Unify on `platform_percent`.** Retire `commission_percent` as the split knob. Done in `050` (defaults dropped, `NOT NULL`). |
| R3 | `platform_percent` is dynamic per product and MUST be snapshotted into `order_items` at purchase. | Snapshotted as `order_items.platform_percent` (046) plus `commission_percent_snapshot` (047). | Keep the snapshot; collapse to one column. |
| R4 | Money is agorot integers, zero floats. | `orders`/`order_items`/`payments`/`coupon_codes` headers are ILS `numeric`; only settlement columns are agorot. | Migrate money columns to agorot integers (matches the unapplied 042 direction). |
| R5 | QR must be signed, tamper-proof, single-use, offline-verifiable. | `coupon-issue.ts` uses an **unkeyed SHA-256 hash** (forgeable, no secret). | **Replace with keyed HMAC-SHA256 now, Ed25519 for offline verify.** |
| R6 | Merchant scan: validate, atomic redeem (one scan wins), then coupon expires. | ~~`coupon_redemptions`, `coupon_scan_events`, `supplier_members` do not exist on remote~~ **נסגר, אך לא בשמות האלה** (נמדד 07.08). קיימים בפרודקשן: `voucher_redemptions` ו-`supplier_members`. **אין** `coupon_redemptions` ואין `coupon_scan_events`; טבלת המימוש היחידה סופגת גם את תפקיד ה-audit דרך עמודת `outcome`, ולכן גם סריקה שנכשלה נשמרת בה. | **בוצע.** ראה 2.5 המתוקן |

These six were the decision gate. All six have since been decided; section 14 carries the answers, including D1 and D2, which were decided differently from how they are worded above.

---

## 1. Money model

- All money crosses into the system as ILS strings and is converted once to `Agorot` (branded integer) at the boundary: `src/lib/commerce/money.ts` (`ilsToAgorot`, `agorot`, `percentageOf`). No float arithmetic after that point.
- Percent stored as `numeric(5,2)` for human readability (admin sets `10.00`), converted to basis points for math: `10.00% -> 1000 bps`.
- Rounding: `percentageOf` rounds half-up to the nearest agora. Multi-unit lines split per unit with `Math.floor` and the first unit absorbs the remainder, so the per-unit sum equals the line total exactly (already implemented in `settlement.ts`).
- Cardcom boundary: agorot -> ILS 2dp string only inside `cardcom.ts` (`ilsFromAgorot`), never earlier.

### Unified split formula (both product types)

Platform revenue is always `platform_percent` of face value. The only difference is who collects the supplier share and when.

```
faceValue        = unitPriceAgorot * quantity
platformCut      = percentageOf(faceValue, platform_percent_bps)   -- platform revenue, both types
supplierShare    = faceValue - platformCut

COUPON  (no escrow):
  paidOnSite       = platformCut          -- per-product platform_percent; platform terminal, platform keeps it all
  collectInStore   = supplierShare        -- the remainder; merchant collects in person, never touches platform
  platform->supplier payout = 0

PHYSICAL:
  paidOnSite       = faceValue            -- customer pays 100% to platform terminal
  supplierPayout   = supplierShare        -- platform owes supplier this, settled via multi-account split or payout batch

cardCharge = paidOnSite - walletApplied   -- wallet credit reduces only the card charge, capped at paidOnSite
```

Invariants (enforce as DB CHECKs): `faceValue = platformCut + supplierShare`; coupon `paidOnSite = platformCut`; physical `paidOnSite = faceValue`.

---

## 2. Data model (target DDL, agorot)

Naming note: the applied DB calls the coupon-instance table `coupon_codes` (046) and the wallet ledger `wallet_accounts`/`wallet_entries` (046). The DDL below keeps the applied names and adds the missing tables. Deltas from live are marked.

### 2.1 orders

```sql
-- MIGRATE money columns from numeric(ILS) to agorot integers.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS subtotal_agorot        integer,
  ADD COLUMN IF NOT EXISTS discount_agorot        integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wallet_applied_agorot  integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS card_charge_agorot     integer,   -- what Cardcom actually charges
  ADD COLUMN IF NOT EXISTS platform_revenue_agorot integer,  -- sum of line platformCut
  ADD COLUMN IF NOT EXISTS supplier_due_agorot    integer;   -- sum of physical supplierShare owed
-- Backfill from *_ils * 100, then drop the numeric columns in a later migration once code is cut over.
-- Keep: id, user_id, status (order_status), address_id, cardcom_payment_id, invoice_number,
--       affiliate_code, referral_code_used, accepted_terms_at, paid_at, expires_at, timestamps.
```

### 2.2 order_items (the snapshot of truth)

```sql
-- Applied columns already present (007+046+047): supplier_id, product_id, product_type,
--   quantity, unit_price_ils, total_price_ils, platform_percent, commission_percent,
--   commission_percent_snapshot, settlement_status, item_status, face_value_agorot,
--   paid_on_site_agorot, commission_agorot, supplier_immediate_agorot, balance_due_agorot,
--   cashback_percent, cashback_amount_agorot, (escrow_held_agorot, escrow_release_agorot -> DROP per R1).

ALTER TABLE public.order_items
  -- one canonical rate snapshot (R2/R3). platform_percent stays; retire commission_* as the knob.
  ALTER COLUMN platform_percent SET NOT NULL,
  ADD COLUMN IF NOT EXISTS unit_price_agorot     integer,   -- replace numeric unit/total
  ADD COLUMN IF NOT EXISTS total_price_agorot    integer,
  ADD COLUMN IF NOT EXISTS platform_cut_agorot   integer,   -- = percentageOf(face, platform_percent)
  ADD COLUMN IF NOT EXISTS supplier_share_agorot integer,   -- = face - platform_cut
  ADD COLUMN IF NOT EXISTS collect_in_store_agorot integer NOT NULL DEFAULT 0; -- coupon 90%, physical 0

-- Backfill supplier_id for existing rows (044 linked products, NOT order_items):
UPDATE public.order_items oi SET supplier_id = p.supplier_id
  FROM public.products p WHERE oi.product_id = p.id AND oi.supplier_id IS NULL;
ALTER TABLE public.order_items ALTER COLUMN supplier_id SET NOT NULL; -- after backfill

ALTER TABLE public.order_items
  DROP COLUMN IF EXISTS escrow_held_agorot,      -- R1
  DROP COLUMN IF EXISTS escrow_release_agorot;   -- R1
```

### 2.3 payments (single writer of order paid-state)

```sql
-- Applied (046). Migrate amount to agorot, keep the rest.
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS amount_agorot        integer,
  ADD COLUMN IF NOT EXISTS wallet_applied_agorot integer NOT NULL DEFAULT 0;
-- Keep: order_id, kind(payment_kind: charge|refund), status(payment_status: initiated|redirected|
--   succeeded|failed|refunded), currency, idempotency_key, cardcom_low_profile_id,
--   cardcom_transaction_id, raw_response jsonb, failure_code, failure_message, succeeded_at, failed_at.
-- idempotency_key is UNIQUE. One order has at most one non-failed charge payment.
```

### 2.4 coupons (definition) vs coupon_codes (issued instance)

The live model already separates them. `coupon_deals` / product config is the definition; `coupon_codes` is the per-purchase instance. Keep `coupon_codes` as the redemption unit.

```sql
-- Applied (046): id, code, product_id, order_item_id, user_id, supplier_id,
--   status(coupon_status: issued|used|expired|refunded), expires_at, qr_token,
--   platform_percent, face_value_ils, platform_paid_ils, collect_amount_ils, redeemed_at.
ALTER TABLE public.coupon_codes
  ADD COLUMN IF NOT EXISTS face_value_agorot   integer,
  ADD COLUMN IF NOT EXISTS platform_paid_agorot integer,   -- the platform cut paid on site
  ADD COLUMN IF NOT EXISTS collect_amount_agorot integer,  -- the remainder collected in-store
  ADD COLUMN IF NOT EXISTS qr_key_id           text,       -- which signing key signed qr_token (rotation)
  ADD COLUMN IF NOT EXISTS used_at             timestamptz, -- route writes this; column is missing on remote
  ADD COLUMN IF NOT EXISTS used_by_supplier_user_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS used_scan_method    text;
-- code is UNIQUE. qr_token is the signed payload (see section 6). No escrow columns.
```

### 2.5 coupon_redemptions (single-use arbiter) - **הוחלף בפועל ב-`voucher_redemptions`**

> **QA 07.08, נמדד מול הפרודקשן.** ה-DDL שלמטה מעולם לא רץ בשם הזה. הטבלה
> החיה היא **`voucher_redemptions`**, המפתח הוא `voucher_id`, הסכום הוא
> `amount_collected_agorot` (אגורות integer), ויש בה עמודת `outcome`.
>
> **מחסום ה-replay שונה ממה שנכתב כאן, ולטובה:**
>
> ```sql
> CREATE UNIQUE INDEX voucher_redemptions_one_success_per_voucher
>   ON public.voucher_redemptions (voucher_id)
>   WHERE outcome = 'success' AND voucher_id IS NOT NULL;
> ```
>
> אינדקס חלקי. מימוש מוצלח אחד לשובר, וכמה סריקות כושלות שרוצים, כולן נשמרות.
> ה-`UNIQUE (coupon_code_id)` הלא-מותנה שלמטה היה **דוחה את הסריקה הכושלת
> השנייה**, ובכך מוחק בדיוק את השורה שמראה שמישהו מנסה קוד שוב ושוב. זו גם
> הסיבה שאין `coupon_scan_events` נפרדת: תפקיד ה-audit נבלע באותה טבלה.
>
> ה-DDL שלמטה נשמר כטיוטה היסטורית בלבד.

```sql
CREATE TABLE IF NOT EXISTS public.coupon_redemptions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_code_id       uuid NOT NULL REFERENCES public.coupon_codes(id),
  order_item_id        uuid REFERENCES public.order_items(id),
  supplier_id          uuid NOT NULL REFERENCES public.suppliers(id),
  scanned_by           uuid NOT NULL REFERENCES auth.users(id),
  method               text NOT NULL CHECK (method IN ('camera','manual')),
  amount_collected_agorot integer NOT NULL,   -- the remainder the merchant collected
  redeemed_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coupon_redemptions_once UNIQUE (coupon_code_id)   -- the race arbiter: one scan wins
);
```

### 2.6 coupon_scan_events (append-only audit) - MISSING ON REMOTE, create in 048

```sql
CREATE TABLE IF NOT EXISTS public.coupon_scan_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_code_id uuid REFERENCES public.coupon_codes(id),
  supplier_id    uuid NOT NULL REFERENCES public.suppliers(id),
  scanned_by     uuid NOT NULL REFERENCES auth.users(id),
  scan_result    text NOT NULL,   -- success|not_found|already_used|expired|refunded|wrong_supplier
  method         text NOT NULL,
  payload        jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);
```

### 2.7 wallet (internal credit, never withdrawable)

```sql
-- Applied (046): wallet_accounts(id,user_id,code,balance_ils,...),
--   wallet_entries(id,debit_account,credit_account,amount_ils,reason,idempotency_key,order_id,...).
-- Double-entry: every move is one row (debit one account, credit another). System accounts:
--   platform:revenue, platform:cashback_reserve. fn_wallet_transfer is the only writer (service-only).
ALTER TABLE public.wallet_accounts ADD COLUMN IF NOT EXISTS balance_agorot integer NOT NULL DEFAULT 0;
ALTER TABLE public.wallet_entries  ADD COLUMN IF NOT EXISTS amount_agorot  integer;
-- Cashback: every 5th purchase -> 5% of paidOnSite credited platform:cashback_reserve -> user.
-- Wallet spend books user -> platform:revenue. Applied at checkout as a discount, never auto, never cashed out.
```

### 2.8 supplier_payouts (physical settlement ledger) - create in 048

Used only when physical products are NOT split at transaction time (see section 4 decision). If Cardcom multi-account split is adopted, this becomes a reconciliation record rather than a payout instruction.

```sql
CREATE TABLE IF NOT EXISTS public.supplier_payouts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id    uuid NOT NULL REFERENCES public.suppliers(id),
  period_start   date NOT NULL,
  period_end     date NOT NULL,
  gross_agorot   integer NOT NULL,   -- sum of physical supplier_share for the period
  status         text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','paid','reconciled')),
  bank_snapshot  jsonb,              -- frozen bank details at pay time
  cardcom_ref    text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  paid_at        timestamptz
);
```

### 2.9 suppliers (canonical merchant entity; `vendors` is legacy)

```sql
-- Applied live: minimal (id,name,contact_email,contact_phone,notes,commission_percent default 0).
-- 044 mirrored the 6 vendors into suppliers with the SAME uuids. vendors is legacy.
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS default_platform_percent numeric(5,2) NOT NULL DEFAULT 10.00
    CHECK (default_platform_percent >= 0 AND default_platform_percent <= 100),
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS legal_name text,
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS about_he text;   -- shown on product page (every product shows supplier)
```

Rate resolution at purchase time (mirror `product_platform_percent()` from 027):
```
products.platform_percent  (per-product override)
  -> suppliers.default_platform_percent  (per-supplier default)
    -> 10.00  (global default constant)
```

### 2.10 supplier_members (portal access) - MISSING ON REMOTE, create in 048

```sql
CREATE TABLE IF NOT EXISTS public.supplier_members (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id  uuid NOT NULL REFERENCES public.suppliers(id),
  user_id      uuid NOT NULL REFERENCES auth.users(id),
  member_role  text NOT NULL DEFAULT 'owner' CHECK (member_role IN ('owner','manager','scanner')),
  is_active    boolean NOT NULL DEFAULT true,
  UNIQUE (supplier_id, user_id)
);
-- is_supplier_member(uid, sid) and current_user_supplier_id() drive RLS + the scan route.
-- 046 stubs is_supplier_member -> false; 048 replaces it with the real lookup.
```

---

## 3. Commission split (implementation points)

- Calculator: `src/server/domain/orders/settlement.ts` (`calculateSettlement` / `calculateLine`). Rewrite to the unified formula (section 1): drop the escrow branch, drop `commission_percent`, use `platform_percent` for both types.
- Persisted at `beginCheckout` (`src/server/actions/payments/checkout.ts`) into the pending order + `order_items` snapshot.
- Finalized by `src/server/payments/finalize.ts` (single writer, on verified payment): physical -> record `supplier_share` obligation (split or payout); coupon -> issue `coupon_codes` rows (one per unit) with `platform_paid`/`collect_amount`, no escrow.

---

## 4. Cardcom integration

### 4.1 Current payload (single terminal, verified in `src/lib/payments/cardcom.ts`)

`POST /Interface/LowProfile.aspx`: `TerminalNumber, ApiName, Amount (ILS 2dp), CoinId=1, Language=he, ProductName, SuccessRedirectUrl, ErrorRedirectUrl, IndicatorUrl (webhook), ReturnValue=paymentId, Operation=ChargeAndCreateToken|ChargeOnly, Codepage=65001`. Token charge via `/Interface/ChargeToken.aspx`; verify via `/Interface/GetLpResult.aspx`. No split fields anywhere.

### 4.2 Target: multi-account split for PHYSICAL only

Physical products split the supplier share to the supplier at transaction time (no manual payout). The share is `faceValue - percentageOf(faceValue, platform_percent)` for THAT product; there is no fixed 90/10. Coupons never split: the platform charges only its own cut on site, and the supplier collects the rest at the counter.

```
LowProfile physical payload adds a per-account allocation (Cardcom "Multi-Account" / פיצול חשבונות):
  Amount = faceValue (100%)
  Accounts[0] = { AccountId: <platform terminal/account>, Amount: platformCut }
  Accounts[1] = { AccountId: <supplier cardcom account>, Amount: supplierShare }
Requires: each supplier onboarded with a Cardcom sub-account id (store on suppliers.cardcom_account_id).
```

VERIFY exact field names against the Cardcom Multi-Account API before coding; the current single-terminal integration does not exercise them. If suppliers are not onboarded to Cardcom sub-accounts, fall back to single-terminal charge + `supplier_payouts` batch (section 2.8). This is decision D6 in section 14.

### 4.3 Webhook handler (`src/app/api/payments/cardcom/webhook/route.ts`)

Order of operations (fail-closed for money):
1. Read raw body. Verify HMAC-SHA256 signature (`src/lib/payments/hmac.ts`, `verifyCardcomSignature`).
2. Insert into `payment_webhook_events` (provider, external_event_id, signature_valid, payload) BEFORE acting. `external_event_id` is UNIQUE -> replay is a no-op (idempotency).
3. If signature invalid -> store, mark `signature_valid=false`, return 200 (do not act), alert.
4. Re-verify against Cardcom API (`GetLpResult` / `verifyLowProfile`) -> set `verified_against_api=true`. Never trust the webhook amount alone.
5. Only with a verified, amount-matching success: call `finalizeOrder` via `adminClient` (service role). finalize is idempotent per order.
6. Set `payment_webhook_events.processed_at`.

Idempotency keys: `payments.idempotency_key` (UNIQUE), `payment_webhook_events.external_event_id` (UNIQUE), wallet moves keyed `order:<id>:cashback` / `order:<id>:spend`, escrow removed.

Retry + failure states: Cardcom retries the IndicatorUrl on non-200. The handler is idempotent so retries are safe. `payments.status`: `initiated -> redirected -> succeeded|failed`. On `failed`, order stays `pending` until `expires_at`, then a sweep cancels it. Network failure mid-finalize: the next webhook retry or a reconciliation cron (`GetLpResult` by `low_profile_id`) closes the gap.

---

## 5. Coupon lifecycle state machine

Live enum `coupon_status = issued | used | expired | refunded`. The requested `issued -> active -> scanned -> redeemed -> expired` maps on: `active = issued` (payment confirmed), `scanned` is the in-transaction validation step, `redeemed = used`.

```
[created pending]
   | payment verified (finalize)
   v
 issued  --------- expires_at reached, never scanned --------->  expired  (terminal)
   |  merchant scans QR in-store
   v
 (scanned: validate, guards below)
   |  all guards pass + UNIQUE(coupon_code_id) insert wins
   v
  used  (terminal; merchant collected the remainder)

 refunded (terminal): order refunded before scan -> status=refunded, no in-store collection.
```

Transition guards (enforced in `validateRedemption` + DB):
- `issued -> used`: coupon exists AND `status='issued'` AND `now < expires_at` AND `coupon.supplier_id = scanning_supplier_id` AND QR signature valid AND `coupon_redemptions` insert succeeds (UNIQUE arbiter). Any failure -> outcome `not_found|already_used|expired|wrong_supplier` and a `coupon_scan_events` audit row.
- `issued -> expired`: cron sweep sets `status='expired'` where `now >= expires_at AND status='issued'`.
- `* -> refunded`: only from `issued`, driven by order refund; never after `used`.
- No transition out of `used`, `expired`, `refunded`.

---

## 6. QR generation spec (fix R5)

Current `coupon-issue.ts` payload `KE|code|orderItemId|expiresUnix|userId|<unkeyed sha256[:32]>` is FORGEABLE (no secret). Replace:

- Online (primary): **HMAC-SHA256** over `KE|v1|<code>|<couponId>|<expiresUnix>` using `COUPON_QR_SECRET`. Payload = `base64url(body) + "." + base64url(hmac)`. Verify with `timingSafeEqual` (same pattern as `verifyCardcomSignature`). Single-use enforced by `coupon_redemptions` UNIQUE, not by the token.
- Offline fallback (merchant app, no connectivity): **Ed25519** signature over the same body with a rotating key pair; `qr_key_id` on `coupon_codes` selects the public key. The scanner verifies the signature offline to accept-provisionally, then MUST reconcile online (the UNIQUE arbiter is the only authority that prevents double redemption). Offline acceptance is advisory; final redemption is always online.
- Token carries no PII and no money amount (amounts are read server-side from `coupon_codes`). Rotation: sign with the current `qr_key_id`; keep prior public keys for verification.
- Short code (8 digits) remains the manual-entry fallback; it is a lookup key only, never proof, so manual entry still runs full server validation.

---

## 7. Merchant scan flow

Existing route `src/app/api/supplier/redeem/route.ts` is already race-safe; wire the DDL (048) and the QR fix (section 6). Flow:

```
Merchant opens /supplier/scan (mobile web, camera) 
  -> getUserMedia camera -> decode QR (client) 
  -> POST /api/supplier/redeem { qr_payload | code, method }
     1. auth.getUser (must be signed-in supplier)
     2. resolveSupplierId: supplier_members(is_active) or profiles.supplier_id
     3. rate limit 60/min per supplier
     4. verifyQrPayload (HMAC) or isValidShortCode -> short code
     5. read coupon_codes by code
     6. validateRedemption(coupon, requestingSupplierId, now) -> outcome
     7. INSERT coupon_redemptions (UNIQUE arbiter; concurrent double-scan loses -> already_used)
     8. UPDATE coupon_codes SET status='used', used_at, used_by_supplier_user_id WHERE status='issued'
     9. INSERT coupon_scan_events (always, success or not)
    10. respond { outcome, coupon: { code, collect_amount, product_name } }
```

The merchant UI shows the balance to collect (`collect_amount`), which is the largest number on the success screen, success/failure in Hebrew, and a manual-code entry fallback. No escrow release step (R1).

---

## 8. Personal area (`/account/*`) - to build; `(account)` is empty today

Route group `src/app/(account)/account/`. RTL, Heebo, tokens only (no hardcoded colors). All reads RLS-scoped to `auth.uid()`.

| Route | Purpose | Reads |
|---|---|---|
| `/account` | Overview: recent orders, wallet balance, active coupons count | orders, wallet_accounts, coupon_codes |
| `/account/orders` | Order history + status | orders + order_items (RLS: user_id = uid) |
| `/account/orders/[id]` | Order detail, line items, invoice | orders join order_items |
| `/account/coupons` | Active coupons with QR (render `qr_token` client-side), status, expiry | coupon_codes (RLS: user_id = uid) |
| `/account/wallet` | Balance + cashback history | wallet_accounts + wallet_entries |
| `/account/details` | Saved addresses, profile | user_addresses, profiles |
| `/account/cards` | Saved card token (last4/brand only, never PAN) | payment_tokens (RLS: profile_id = uid) |

Components: `AccountShell` (sidebar nav), `OrderCard`, `CouponCard` (renders QR from `qr_token` via a client QR lib), `WalletLedger`, `SavedCardRow`. Existing `(main)/coupons` pages migrate under `/account/coupons`.

---

## 9. Supplier dashboard (`/supplier/*`) - to build; only `api/supplier/redeem` exists

Route group `src/app/(supplier)/supplier/`. Every query RLS-scoped by `current_user_supplier_id()`.

| Route | Purpose | Reads (all filtered supplier_id = my supplier) |
|---|---|---|
| `/supplier` | KPIs: sales, pending payout, redemptions today | order_items, supplier_payouts, coupon_redemptions |
| `/supplier/products` | My products, status, edit platform_percent override | products (supplier_id = mine) |
| `/supplier/orders` | Orders containing my items | order_items join orders |
| `/supplier/payouts` | Payout statements + status | supplier_payouts |
| `/supplier/scan` | Camera redeem page (wraps the redeem route) | - |
| `/supplier/redemptions` | Redemption log | coupon_redemptions, coupon_scan_events |

RLS: `order_items`, `coupon_codes`, `coupon_redemptions`, `supplier_payouts`, `products` get a policy `supplier_id = current_user_supplier_id()` for `authenticated` where the user is an active `supplier_members` row (or `profiles.supplier_id`). `is_supplier_member` (real, from 048) gates it.

---

## 10. Auth matrix

Live `user_role = customer | content_uploader | vendor | admin | super_admin | support`. The supplier-facing role is `vendor` (legacy name; UI says "ספק"). Enforcement is two-layer: middleware (coarse route-group gate) + RLS (row-level, the real boundary).

| Route group | customer | content_uploader | vendor (supplier) | admin / super_admin | support |
|---|---|---|---|---|---|
| `/` `(store)` `(marketing)` | yes | yes | yes | yes | yes |
| `/account/*` | own rows (RLS uid) | own | own | own | own |
| `/supplier/*` | no | no | yes (own supplier, RLS) | yes (all) | read-only |
| `/admin/*` | no | products/catalog only | no | yes | read-only |
| `POST /api/supplier/redeem` | no | no | yes (own supplier) | yes | no |

- Middleware (`src/middleware.ts` or proxy): redirect unauthenticated `/account|/supplier|/admin` to login; block `/admin` and `/supplier` for `customer`. Middleware is a UX gate only.
- RLS is authoritative: even if middleware is bypassed, `supplier_id = current_user_supplier_id()` and `user_id = auth.uid()` policies prevent cross-tenant reads. Admin reads use the service client after `requireAdminSession()`.
- `content_uploader` gets catalog write on `/admin/products` only (product approval workflow already live: `products.approval_status`).

---

## 11. Checkout flow diagram

```
Guest browses -> adds to cart (carts jsonb, no login)            [R: guest cart open]
      |
   clicks "Pay"
      v
 Google OAuth (PKCE)  --- first login: merge guest cart (fn_merge_guest_cart, advisory lock)
      |
      v
 Address step (user_addresses; required for physical)
      |
      v
 beginCheckout (server): read products server-side, snapshot platform_percent,
   calculateSettlement (agorot), INSERT order(pending) + order_items, INSERT payment(initiated),
   apply wallet credit (capped), compute cardCharge
      |
      v
 Cardcom LowProfile (hosted page / iframe redirect)
   physical: multi-account split payload | coupon: charge the platform cut only
   Operation=ChargeAndCreateToken (save card token first time)
      |
      v
 Customer pays on Cardcom hosted page  --> SuccessRedirectUrl -> /checkout/return (poll)
      |                                                              
      |  (authoritative path)                                       
      v                                                             
 Cardcom -> IndicatorUrl webhook -> verify HMAC -> log event -> re-verify via GetLpResult
      |
      v
 finalizeOrder (adminClient, idempotent):
   payment.succeeded, order.paid, paid_at
   coupon: issue coupon_codes (one/unit) with signed qr_token, status issued  (NO escrow)
   physical: record supplier_share (split executed or payout accrued)
   cashback: every 5th purchase -> 5% to wallet
      |
      v
 Order confirmed (return page shows QR for coupons)
      |
      v
 Supplier notified (notifications_outbox: new order / coupon issued)
```

---

## 12. Migration plan

- Live baseline (KEEP): 001-025, 032 (isolated staging), 044 (vendor->supplier unification), 045 (carts restore), 046 (checkout runtime), 047 (settlement).
- DEAD / do not apply: 026 (`cart_items`, 026-wallet, old `supplier_payouts`), 043 (superseded by 044), 042 as-a-whole (never applied; overlaps 046/047; the Drizzle schema mirrors it but the tables `commission_ledger`/`cashback_reversal_debts` do not exist on remote).
- Parked drafts (out of scope now): 028, 030, 031, 033, 034, 035. 027 supplies the supplier-portal shapes we cherry-pick into 048.
- NEXT = migration **048** (single, idempotent, via MCP `apply_migration` only, never `db push`). 048 must:
  1. Create `coupon_redemptions`, `coupon_scan_events`, `supplier_members`; real `is_supplier_member` / `current_user_supplier_id`.
  2. Add missing `coupon_codes` columns (`used_at`, `used_by_supplier_user_id`, `used_scan_method`, `qr_key_id`) so the redeem route runs.
  3. Add agorot money columns to orders/order_items/payments/coupon_codes/wallet, backfill from `*_ils * 100`.
  4. Backfill `order_items.supplier_id` from products, then `SET NOT NULL`.
  5. Drop escrow from the coupon path (`escrow_holds` + order_items escrow columns) per R1.
  6. `suppliers`: add `default_platform_percent`, `status`, profile fields, `cardcom_account_id` (if multi-account).
  7. `supplier_payouts` (for the payout-batch path).
  8. Realign `src/db/schema/commerce.ts` + `commerce-managed.ts` to the applied reality (or mark clearly as read-only projections).
- Risks: destructive-drop history is why remote drifted (005/006/007 dropped tables; 001 stopped early -> 045). 048 is purely additive + guarded backfills, fully `IF NOT EXISTS`, enum changes via `ADD VALUE IF NOT EXISTS` in a separate statement.

---

## 13. Design tokens (reconcile to live, `src/app/globals.css` @theme)

Fix drift and tokenize value-correct literals (measured from `MEASURED-LIVE.md`). Highest impact:

| Token | Current | Correct (measured) | Status |
|---|---|---|---|
| `--color-price` | `#e4002b` | `#dc3545` | FIX (drift; unify `#c93636`, `#e00` onto it) |
| `--color-price-strike` | `#9ca3af` | `#848484` (product), `#768b9e` (category) | FIX |
| `--color-success` / sale badge | `#5cb85c` | add `--color-sale-badge: #44b81b` | ADD (distinct green) |
| `--color-brand-accent/-light/accent` | `#eaf4f6` (sky-blue) | real yellow-slate tint | WRONG-REF (Electro leftover) |
| `--color-border` | (none) | `#ddd` (22 uses) | ADD |
| `--container-page` | `1320px` | verify vs live `1200px` | VERIFY |
| `--header-height` | `70px` (unused) | code hardcodes `h-[54px]` | RECONCILE |

Tokenize (no visual change, drift prevention): `#333e48` (72 uses) -> `text-heading`; `#fed700` (47) -> `bg-brand`; `#fedd26` (21) -> hover; `#0062bd` -> `text-link`. Add `--color-muted #768b9e`, `--color-icon #515151`, `--radius-pill 22px`, `--shadow-card`, `--shadow-drawer`. The sky-blue Electro `refs/*DESIGN.md` palette is NOT the brand; the brand is yellow `#fed700` + slate `#333e48`.

---

## 14. Decision log (was: decision gate)

כל שש השאלות של 23.07 הוכרעו. הן נשמרות כאן עם התשובה, ולא נמחקות: מסמך
שמוחק את השאלה משאיר את מי שקורא אותו בלי הדרך להבין למה המודל נראה כך.

| # | מה נשאל ב-23.07 | ההכרעה | מתי, ואיפה היא חיה |
|---|---|---|---|
| D1 | להוציא Escrow ממסלול הקופון, ולאשר "10% באתר / 90% בעסק" | **הוצא**, אבל **לא** כפי שנוסח. אין Escrow חיצוני ואין J5; `escrow_holds` נשארת כרשומת ledger פנימית בלבד עד מימוש. **ה-10/90 נדחה במפורש** | C3 + C1/C2, 24.07 |
| D2 | לאחד על `platform_percent` ולאשר ברירת מחדל 10% | אוחד. **ברירת המחדל בוטלה ולא הוחלפה:** `NOT NULL` בלי `DEFAULT`, ערך חובה פר מוצר | מיגרציה 050 |
| D3 | להעביר את עמודות הכסף לאגורות integer | **מאושר כיעד, לא הורץ.** יושב כ-`PENDING-money-integer-fix.sql` וממתין לאישור מפורש; 52 קבצי אפליקציה עדיין קוראים את השמות הישנים כשקלים, ולכן שינוי צד-קוד לפני הסכימה מכפיל כל מחיר פי 100 | פתוח |
| D4 | להחליף QR של SHA-256 בלי מפתח ב-HMAC עם מפתח | **בוצע.** `VOUCHER_QR_SECRET` הוא חוסם deploy פתוח בדיוק בגלל זה | GO-LIVE |
| D5 | לשלוח 048 כדי שמסלול המימוש יפסיק לשגות | **בוצע** | 048 |
| D6 | פיצול Multi-Account בזמן העסקה מול payout batch | פיצול בזמן העסקה לפיזי. **הערה מדודה 06.08:** צד ה-payout עדיין לא קיים בפרודקשן, לא `payout_statements` ולא ה-RPC `generate_payout_statement` | חלקי |

**מה שנשאר פתוח מהרשימה הזו הוא D3 בלבד**, ועוד הזנב של D6. השאר סגור.
