# W35 Staff roles

Code-agent spec. `supplier_members.member_role`: `owner` | `manager` | `scanner`. Orthogonal to `profiles.role`. PIN staff (`supplier_staff`) is not a login.

---

## What it builds

1. Owner: members + profile + (read) settlement. Manager: scan + profile maybe. Scanner: scan only.
2. Cannot self-promote via client UPDATE (035 trigger).
3. `hasMinRole` in `src/lib/supplier/roles.ts` is the app mirror; RLS must match.

---

## Tables

`supplier_members`, `supplier_staff`.

---

## RLS

`is_supplier_member`, `is_supplier_owner`. Anon EXECUTE on those helpers returns false (165 cancelled because revoke would 42501 catalogue).

---

## Money invariants

No role may change `order_items` money. Scanner cannot refund.

---

## Tests before close

`rbac.test.ts`, `roles.test.ts`, PIN route, membership read-or-fail (not not_found).

---

## Feature flag

None.

---

## Docs updated

`ROLE-VENDOR.md`, `SUPPLIER-STATE-MACHINE.md` (membership, not supplier row).

---

## Edge cases

User with `profiles.role = vendor` and no membership: access-denied. User with membership and `role = customer`: till works (membership wins).

---

## Hebrew UX strings

| Key | Copy |
|---|---|
| Owner | בעלים |
| Manager | מנהל |
| Scanner | סורק |
| Invite | הוספת צוות |

---

## Open questions

| Q | Best answer |
|---|---|
| Is `vendor` required? | **No.** Membership is sufficient. `vendor` is a leftover label. |

---

## Second pass (membership)

- Till = `supplier_members` (`owner` | `manager` | `scanner`). See `ROLE-VENDOR.md`.
- Scanner cannot UPDATE stock or members. PIN 15/hour, not a website login.
- Owner invite writes audit. Do not grant `admin` to run a restaurant.
- `vendor` on profile without membership: access-denied.

---

## Third pass

Hebrew: בעלים / מנהל / סורק / הוספת צוות.
`vendor`
is leftover. Membership is the till.


