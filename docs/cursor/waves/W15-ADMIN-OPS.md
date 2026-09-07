# W15 Admin ops

Code-agent spec. Optimistic proxy gate; every page and action re-checks. Roles: `admin`, `super_admin`, `content_uploader`, `support`. Money sections: admin / super_admin.

---

## What it builds

1. Operator handbook alignment: products, percents, approvals, moderation, queues, feature-flags **read-only** (env report).
2. Migrations viewer if present on a code branch: **read-only**, never apply.
3. Payouts page: stub Hebrew, no `42P01`.
4. Webhooks tab: `createAdminClient` or stay empty (zero-policy table).

---

## Tables

Staff surfaces listed in ARCHITECTURE-OVERVIEW §2.3. `audit_log` append via trigger / `writeAuditLog`.

---

## RLS

`support` read-expanded, no money write. `super_admin` same money as admin plus role changes (`updateUserRole` audited).

---

## Money invariants

Admin form money agrees with engine (`admin-money-agreement.test.ts`). Bulk price uses `applyBp`. Implausible 95% guard. No global default percent.

---

## Tests before close

`audit-required.test.ts`, `role-change.test.ts`, `uploader-prohibitions.test.ts`. Webhooks tab not user-scoped.

---

## Feature flag

Kill switch report page. Cannot flip env from the UI.

---

## Docs updated

`ADMIN-HANDBOOK.md`, `FEATURE-FLAGS.md`, `API-SURFACE.md`.

---

## Edge cases

`createPublicClient` must stay anon when staff preview the shop. Uploader JWT on public client would show drafts.

---

## Hebrew UX strings

| Key | Copy |
|---|---|
| Payouts stub | אין תשלומי ספק במודל הקופון |
| Webhooks empty | אין אירועים לטאב הזה בחיבור הנוכחי (or honest: נדרש מפתח שירות) |
| Unsellable | אין ברירת מחדל לעמלה |

---

## Open questions

| Q | Best answer |
|---|---|
| Migrations UI apply button? | **Forbidden.** Human MCP only. |

---

## Second pass (admin money)

- Payouts screen: Hebrew stub or empty, **not** a 500 from missing `payout_statements`.
- Webhooks tab: zero-policy table. Must `createAdminClient`. Empty is honest.
- Feature flags page reports env, does not write a table.
- `requireSection` on every mutation. Uploader never refunds. Support never refunds.
- Audit actor is the staff uid (`contracts/AUDIT-LOG.md`).
- Duplicate pending 169–172: show **filename**, not the number, if the UI lists pending files.

---

## Third pass

Stub copy: אין תשלומי ספק במודל הקופון. Unsellable: אין ברירת מחדל לעמלה. No apply-migration button in the admin UI.


