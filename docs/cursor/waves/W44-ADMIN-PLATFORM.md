# W44 Admin platform

Code-agent spec. Broader than W15: feature flags page, reports 170, queues, users, role change, growth.

---

## What it builds

1. `listFeatureFlags` remains env read-only until a flags table exists.
2. Reports: bigint agorot, Israel day, no live product join. Pending 170 filename vs "already applied" header: verify production.
3. User role change audited. Trigger still exists.
4. Do not enable `AI_AGENTS_*` at launch.

---

## Tables

`audit_log`, reporting tables if 170 applied, `profiles`.

---

## RLS

Money reports admin. content_uploader 403. support read where documented.

---

## Money invariants

Dashboard number not a safe integer is not money. UTC midnight buckets forbidden (170 uses Asia/Jerusalem).

---

## Tests before close

`admin-reports.test.ts`, `aggregate.test.ts`, `audit-required.test.ts`, `role-change.test.ts`.

---

## Feature flag

`AI_AGENTS_*` off. Kill switches read-only in UI.

---

## Docs updated

`FEATURE-FLAGS.md`, `ADMIN-HANDBOOK.md`, `MIGRATION-PLAYBOOK.md` 170.

---

## Edge cases

Duplicate 170 files (indexes vs reporting). Full name.

---

## Hebrew UX strings

| Key | Copy |
|---|---|
| Flags | מתגים (קריאה בלבד) |
| Israel day | יום עסקים לפי שעון ישראל |

---

## Open questions

| Q | Best answer |
|---|---|
| Is 170 applied? | Header vs `pending/` disagree. Probe. Do not join live products either way. |
