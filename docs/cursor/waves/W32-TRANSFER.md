# W32 Transfer

Code-agent spec. Gift claim (W29) is the v1 transfer. A general "forward this QR to anyone" is a fraud surface (screenshot already exists).

---

## What it builds (v1 recommendation: **skip**)

If product insists:

1. Transfer only `issued` vouchers. New owner uid. Old owner loses SELECT. Audit.
2. Not after redeem/expiry/refund.
3. Rate limit. Not to self. Not a cycle with referrals.

**Default.** Do not ship. Screenshot sharing is already possible; a transfer API makes stolen accounts worse.

---

## Tables

`vouchers.user_id` update via DEFINER RPC only. `audit_log`.

---

## RLS

Owner cannot UPDATE uid themselves (would bypass). RPC DEFINER + auth.uid() is current owner.

---

## Money invariants

No money moves. Prepaid already platform's. Transfer is not a refund.

---

## Tests before close

If skipped: no `/api/vouchers/transfer` route (mutating-route-guards). If built: issued-only, audit, no redeem mid-flight.

---

## Feature flag

Off by default. Off: 404. In-flight issued stay with current owner.

---

## Docs updated

`SECURITY-REVIEW.md`, `CUSTOMER-FAQ.md` (screenshot warning).

---

## Edge cases

Transfer then refund to original card: still the original payer, not the new holder. Document that.

---

## Hebrew UX strings

| Key | Copy |
|---|---|
| Skip FAQ | אי אפשר להעביר קופון באפליקציה. אפשר לשלוח במתנה בקופה. |
| If built | העברה בוצעה |

---

## Open questions

| Q | Best answer |
|---|---|
| Ship transfer? | **No** for v7. Gift at purchase only. |
