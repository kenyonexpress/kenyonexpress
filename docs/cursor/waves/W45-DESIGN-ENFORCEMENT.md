# W45 Design enforcement

Code-agent spec. Tokens, copy-gate, asset-gate, hardcoded-gate, RTL logical properties, 11% visual.

---

## What it builds

1. Keep `pnpm lint` gates (code branch). This pack does not run them.
2. No raw hex in components. Heebo. Electro geometry, live WP content.
3. `refs/` is a gate output, not a source (`REFS-POLICY.md`).
4. Do not import `@dnd-kit` onto storefront JS.

---

## Tables

None.

---

## RLS

N/A.

---

## Money invariants

Copy-gate should catch escrow / 10% default in UI strings if wired. If not, add on code branch.

---

## Tests before close

Tokens collision, contrast, latin-field-direction, rtl e2e, copy-gate.

---

## Feature flag

None.

---

## Docs updated

`HEBREW-QA.md`, `PERF-BUDGET.md`, `A11Y-CHECKLIST.md`.

---

## Edge cases

`cacheComponents` vs pixel snapshots. Compare against `pnpm start`, not stale `dev`.

---

## Hebrew UX strings

N/A (enforcement). Bad copy to reject: נאמנות, עמלה 10% כברירת מחדל.

---

## Open questions

| Q | Best answer |
|---|---|
| Electro vs live Elementor? | Live WP is not Electro. Some pixel rows were correctly refused (`LIVE-DELTA.md`). |

---

## Second pass (after contracts and ops)

Binding: `WAVE-INDEX.md`, `contracts/ROLE-VENDOR.md` (till is `supplier_members`), `contracts/LEDGER.md` (integer agorot, cashback at finalize), `contracts/PAYMENT-BOUNDARY.md` (GetLpResult, no HMAC), `contracts/MIGRATION-PLAYBOOK.md` (full pending filenames). Feature flags are env. Do not invent payout or escrow writers. Hebrew UX stays RTL source-of-truth.
