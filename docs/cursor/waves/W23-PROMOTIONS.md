# W23 Promotions

Code-agent spec. `discount_campaigns` engine exists (bp, funded from platform commission, UNIQUE campaign+order). Homepage CMS promotes deals. Do not add a second `campaigns` table that rewrites `kenyon_price`.

---

## What it builds

1. Admin code campaigns only through `discount.ts` rules.
2. Checkout applies server-side. Snapshot `amount_agorot`.
3. Homepage sections for merchandising, not a second price.

---

## Tables

`discount_campaigns`, `discount_redemptions`, `homepage_sections`, `banners`.

---

## RLS

Staff write campaigns. Redeem service_role at pay. Shopper cannot INSERT campaigns.

---

## Money invariants

Discount ≤ platform fee. Coupon code must not become percent-of-face. No `* 0.9`. Stacking two codes: forbid.

---

## Tests before close

`growth/discount.test.ts`. Replay unique. Implausible SKU still unsellable.

---

## Feature flag

`is_active` on campaign. Off: Hebrew code invalid. Paid snapshots stay.

---

## Docs updated

`MONEY` docs, `PRICING-EXAMPLES.md`.

---

## Edge cases

Wallet + code: wallet is payment source, does not change campaign snapshot.

---

## Hebrew UX strings

| Key | Copy |
|---|---|
| Code label | קוד קופון |
| Invalid | הקוד לא תקף |
| Applied | ההנחה הוחלה |

---

## Open questions

| Q | Best answer |
|---|---|
| Automatic sale price without code? | **No.** The product is the deal. |

---

## Second pass (after contracts and ops)

Binding: `WAVE-INDEX.md`, `contracts/ROLE-VENDOR.md` (till is `supplier_members`), `contracts/LEDGER.md` (integer agorot, cashback at finalize), `contracts/PAYMENT-BOUNDARY.md` (GetLpResult, no HMAC), `contracts/MIGRATION-PLAYBOOK.md` (full pending filenames). Feature flags are env. Do not invent payout or escrow writers. Hebrew UX stays RTL source-of-truth.
