# Role: vendor vs coupon-partner

**`vendor` is a `profiles.role` enum value.** This pack used "coupon-partner" as a shorthand. That name is a **documentation error**. The till and portal authorize through **`supplier_members`**, not through `profiles.role = vendor`.

---

## How access actually works

```
auth.uid()
  → supplier_members (supplier_id, member_role owner|manager|scanner)
  → is_supplier_member(uuid) / is_supplier_owner / is_supplier_order
```

`profiles.role = vendor` without a membership: `/supplier/access-denied`. Membership with `role = customer`: till still works.

Scanner is **`member_role`**, not a profile role. PIN staff (`supplier_staff`) is not a login.

---

## Policies keyed on membership

Redeem RPC, supplier order SELECT, redemptions SELECT, branch writes (133), product SELECT own. Grep `is_supplier_member` in SQL. Anon EXECUTE on the helper returns false (165 cancelled: revoke would 42501 public catalogue because RLS quals run as the caller).

---

## Docs that still say coupon-partner

`docs/cursor/ARCHITECTURE-OVERVIEW.md`, `RLS-CATALOG.md`, `DATA-FLOW.md`, `API-SURFACE.md`, `GLOSSARY.md` pack-four table. Treat those rows as "supplier member" until edited.

---

## Four pack roles mapped

| Pack slang | Live |
|---|---|
| customer | `customer` |
| content-uploader | `content_uploader` |
| coupon-partner | **`supplier_members`** (+ optional leftover `vendor`) |
| admin | `admin` / `super_admin` (`support` is fifth: read, no money) |

---

## Open questions

| Q | Best answer |
|---|---|
| Drop `vendor` from enum? | Human migration. Not required for v7 if membership is the gate. |

---

## Second pass (auth)

- Till HTTP redeem keys on `supplier_members`, never on `profiles.role`.
- `vendor` without membership: `/supplier/access-denied`. Membership with `customer` profile: till still works.
- `content_uploader` is not a till. `support` is not a refund. `scanner` cannot UPDATE members or stock.
- Guest cart: browser cookie `ke_session_id`; PostgREST sees constructed `Cookie: session_id=<uuid>`. Never forward the jar.
- PIN staff (`supplier_staff`) is not `auth.users` login. 15/hour (`RATE-LIMITS.md`).
- Anon EXECUTE on `is_supplier_member` returns false on purpose. Do not apply cancelled 165.

