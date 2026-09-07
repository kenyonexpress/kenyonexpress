# W48 Rule verification

Code-agent spec. Verify the invariants this pack claims against the tree (read-only). Output is this docs pack staying honest.

---

## What it builds

1. Grep: no `packages/money.ts`, no `middleware.ts` (it is `src/proxy.ts`), Next 16.2.12, coupon 100/0 in `commission.ts`.
2. Confirm `CHECKOUT_ENABLED`, compromised keys script, 12 cron jobs JSON.
3. Confirm escrow not in supplier due test.
4. Update `QUALITY-SCORECARD.md` / `OPEN-QUESTIONS.md` when runtime disagrees.

---

## Tables

N/A.

---

## RLS

165 cancelled: do not recommend re-applying.

---

## Money invariants

List every `fn_wallet_transfer` caller: finalize cashback, spend wallet, refund wallet, referral complete. All integer then `p_amount_ils`.

---

## Tests before close

A docs PR that matches the tree. Scorecard dates.

---

## Feature flag

N/A.

---

## Docs updated

This pack. `DECISION-LOG.md`.

---

## Edge cases

APPLY-ORDER.md internally contradicts disk. Playbook must say so.

---

## Hebrew UX strings

N/A.

---

## Open questions

| Q | Best answer |
|---|---|
| Trust APPLY-ORDER or the directory? | **Directory + README pending + preflight files.** APPLY-ORDER has history paragraphs. |
