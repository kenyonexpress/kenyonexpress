# W34 Multi location

Code-agent spec. `supplier_branches` (133). Scan is still **supplier_id** scoped, not branch-scoped, unless RPC is extended.

---

## What it builds

1. Public addresses / hours per branch. Waze from lat/lng. Missing coords: no fake pin.
2. Till: `wrong_supplier` stays shop-level. Branch is display unless product adds `redeemed_branch_id`.
3. Scanner membership is shop-wide by default. Do not invent per-branch PIN without a migration.

---

## Tables

`supplier_branches`, `suppliers`. Optional future column on `voucher_redemptions`.

---

## RLS

Public SELECT published branches. Members SELECT own shop branches. PIN table not public.

---

## Money invariants

Branch does not change split. Same snapshot.

---

## Tests before close

133 policies: scanner cannot INSERT branch if that was the 133 test. Geo distance. Public page omits PIN.

---

## Feature flag

None.

---

## Docs updated

`SUPPLIER-FAQ.md`, `W13-CITY.md` leftover.

---

## Edge cases

One legal entity, two brands: two `suppliers` rows, not two branches, if till isolation is required.

---

## Hebrew UX strings

| Key | Copy |
|---|---|
| Branches | סניפים |
| Hours | שעות פתיחה |
| Navigate | ניווט |

---

## Open questions

| Q | Best answer |
|---|---|
| Per-branch redeem? | **Not in v1.** Shop-level `wrong_supplier` is enough. |

---

## Second pass (one supplier_id)

- Redeem keys on membership `supplier_id`, not a branch body field.
- Hours/maps are display. They do not change money or voucher state.
- Do not promise "כל הסניפים" in supplier onboarding copy (W07 FAQ).

---

## Third pass

Display only: סניפים / שעות פתיחה / ניווט. Redeem stays shop-level
`wrong_supplier`.


