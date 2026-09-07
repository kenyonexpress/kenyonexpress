# W20 Perf budget

Code-agent spec. Visual gate under 11% at 380/768/1440. Bundle ratchet `scripts/bundle-gate.mjs`. Nested sharp 0.34 served original AVIF (override to 0.35.3).

---

## What it builds

1. Keep ratchet; do not import `@dnd-kit` onto home (abandoned, zero `src/` imports).
2. `compare.mjs` writes `docs/UI-PARITY-REPORT.md` itself. Measure-without-write is a process bug.
3. Search kill / Meili optional must not ship a huge unused SDK (HTTP, not npm).

---

## Tables

None.

---

## RLS

N/A.

---

## Money invariants

Perf work must not move money to the client. No `parseFloat` on the money path to "speed up".

---

## Tests before close

Bundle gate CI. Lighthouse smoke. `deployed-runtime.test.ts`. Home JS budget documented in `PERF-BUDGET.md`.

---

## Feature flag

`KILL_SWITCH_CACHE` slower but correct.

---

## Docs updated

`quality/PERF-BUDGET.md`, `DEPENDENCY-AUDIT.md`.

---

## Edge cases

`cacheComponents` + `connection()` vs `dynamic`. `NEXT_PUBLIC_*` inlined at **build**. Bare Playwright against stale `pnpm dev` fabricates failures.

---

## Hebrew UX strings

None.

---

## Open questions

| Q | Best answer |
|---|---|
| Raise 11% for EN pages? | Exclude EN from the Hebrew Electro gate (W10). Do not raise the Hebrew threshold. |
