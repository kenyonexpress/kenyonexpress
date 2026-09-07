# W16 Customer account

Code-agent spec. Gated `/account/*`. Wallet, vouchers, orders, referrals, wishlist, subscriptions, security, addresses, saved cards.

---

## What it builds

1. One `profiles` row per `auth.users`. Privilege columns frozen.
2. Guest merge on login (cart + wishlist).
3. Wallet display from `v_wallet_ledger` (parse `*_ils` if that is what the view exposes; do not `* 100`).
4. Voucher QR: signed with current/previous secret. Apple Wallet optional (`GET /api/wallet/apple/[id]`, RLS via user client). No Google route.

---

## Tables

`profiles`, `orders`, `vouchers`, `wallet_accounts`, `wallet_entries`, `push_tokens`, wishlist.

---

## RLS

Owner only. Account deletion: `fn_anonymize_user` (150) or TS fallback. Phrase `מחק את החשבון שלי`. Soft-delete auth. Keep ledger.

---

## Money invariants

Wallet spend only at checkout as payment source (does not mutate commission). Cashback credited at **finalize**, not scan.

---

## Tests before close

Merge no dupes. Delete phrase. Saved cards no PAN. Apple 404 if unconfigured. Privilege trigger.

---

## Feature flag

`PHONE_AUTH_ENABLED`. Apple env cluster. `PUSH_ENABLED`.

---

## Docs updated

`AUTH` flow, `DATA-RETENTION.md`, `GLOSSARY.md` cookies.

---

## Edge cases

Frame-return ungated. `/coupon/[id]` gated. Gift claim token is a capability.

---

## Hebrew UX strings

| Key | Copy |
|---|---|
| Wallet | הארנק שלי |
| Coupons | הקופונים שלי |
| Delete phrase | מחק את החשבון שלי |
| Insufficient wallet | יתרת הארנק אינה מספיקה |

---

## Open questions

| Q | Best answer |
|---|---|
| Hard-delete auth.users? | **No.** Cascades orphan money rows. Soft-delete. |
