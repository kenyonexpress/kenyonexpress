# W26 Legal

Code-agent spec. Canonical `/legal/*` plus store aliases. Returns must not say escrow / נאמנות. 14-day distance selling. Cancellation fee 5% capped ₪100, zero on defect.

---

## What it builds

1. Code branch: strip escrow copy from RSC legal pages if still present (this pack does not edit TSX).
2. Align FAQ with coupon cash-at-till vs platform prepaid.
3. Privacy: deletion 150/157, cookies `ke_session_id`, `ke_consent`, `ke_attr`, `ke_cart_mirror_v1`.

---

## Tables

None required. Consent records.

---

## RLS

N/A for static pages.

---

## Money invariants

Legal fee constants in `refund.ts` are statute, not settings. `applyBp(500)` and cap 10000 agorot. Same Israel day CancelOnly.

---

## Tests before close

`legal-duplication.test.ts`, `legal-pages.test.ts`. Grep נאמנות / escrow in legal content.

---

## Feature flag

None.

---

## Docs updated

`CUSTOMER-FAQ.md`, `LAUNCH-BLOCKERS.md` cutover trust, `CONSENT-MODEL.md`.

---

## Edge cases

Counsel for EN legal (W10). Cardcom merchant of record is the platform.

---

## Hebrew UX strings

| Key | Copy |
|---|---|
| Returns title | מדיניות ביטול עסקה |
| No escrow | אין חשבון נאמנות. התשלום באתר הוא לפלטפורמה. |
| 14 days | ביטול עסקה מרחוק לפי חוק |

---

## Open questions

| Q | Best answer |
|---|---|
| Does `/legal/returns` still say escrow? | Check `src/app/(legal)/` on a code branch. If yes, cutover trust risk, not a money path. |

---

## Second pass (no נאמנות)

- Launch H10: `/legal/returns` must not say escrow or נאמנות.
- 14-day remote cancel, fee 5% or ₪100 cap (`applyBp` 500 / 10000 agorot). Defect: fee 0.
- Coupon prepaid is platform revenue, not a hold for the shop (`LEDGER.md`).
- Do not machine-translate legal for `/en` (W10 off).

