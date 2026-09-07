# W47 Test depth

Code-agent spec. TEST-MAP in this pack lists G1–G25 historically. This wave is the **code** work to close gaps, not more markdown.

---

## What it builds

1. G15 unique pending prefixes. G16 `percentageOf` ≡ `applyBp`. G17/G21 cookie pair. G18 webhooks admin client. G20 production whitelist. G23 ntfy without DSN. G26 `percentToBp` vs `percentToBasisPoints` on >2 decimals.
2. Support 403 on refund. `error` vs enum outcomes.
3. Do not delete e2e money specs (`full-purchase-redeem`, `physical-purchase`, `admin-refund`).

---

## Tables

N/A (tests). SQL tests under `tests/sql/` if present: do not skip because "CI has no DB" without an explicit contract (rls-manifest is the offline pin).

---

## RLS

`rls-manifest.test.ts` + write-policies. Re-measure is human.

---

## Money invariants

`money-no-float.test.ts` allowlist must not grow without a comment. `round2` on agorot is a fail.

---

## Tests before close

This wave **is** the tests. Close when G15–G23 have a failing-red then green on a code branch.

---

## Feature flag

None.

---

## Docs updated

`quality/TEST-MAP.md`, `MONEY-TEST-PLAN.md`, `RLS-TEST-PLAN.md`.

---

## Edge cases

E2E against `pnpm start` fresh. Production Cardcom never in CI.

---

## Hebrew UX strings

N/A.

---

## Open questions

| Q | Best answer |
|---|---|
| Can this pack run pnpm test? | **No.** Code branch only. |
