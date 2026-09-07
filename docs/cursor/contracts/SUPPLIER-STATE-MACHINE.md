# Supplier state machine

Lead: submitted → (admin) approved | rejected.

Supplier row: active vs suspended (column name: confirm `status` / `is_active` on `suppliers`). Suspended: public hide, till `unauthorized` / membership check fail.

Membership: owner/manager/scanner. Not a `profiles.role` transition.

---

## Who

| Action | Who |
|---|---|
| Lead insert | anon via action, rate limited |
| Approve | admin; writes `suppliers` + `supplier_members` owner |
| Reject | admin; audit |
| Suspend | admin; audit; do not delete (history) |
| Add scanner | owner/manager per RLS |

Forbidden: self-approve, self-set `profiles.role` to admin, scanner creating members, payout table as "approved".

---

## Money

Approve does not grant a global split. Products still unsellable without per-product percent.

---

## Open questions

| Q | Best answer |
|---|---|
| Exact supplier status enum? | Read `suppliers` in `database.ts`. Do not invent `kyc_pending`. |

---

## Second pass

Read with `waves/WAVE-INDEX.md` and `business/LAUNCH-BLOCKERS.md`. Tree on this branch wins over older briefs. Do not apply SQL from this worktree.
