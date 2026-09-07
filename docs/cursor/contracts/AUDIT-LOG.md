# Audit log contract

`audit_log` is append-only. Client DML denied. Trigger insert. 137: immutability triggers (no UPDATE/DELETE). Pending `169_audit_full_coverage.sql` is a **different** 169 from analytics.

---

## What is logged

Staff mutations via `writeAuditLog`: role change, product publish, refund, approvals, supplier approve. Actor is the staff uid, not the service_role uuid (`audit-actor.test.ts`).

Payment path journals `payment_events` (separate table, append-only). Do not merge the two.

---

## Hash chain

If 169 audit coverage adds `before`/`after`/`request_id`: treat as **row snapshots + request correlation**, not a bitcoin-style chain unless the SQL file literally stores `prev_hash`. Best current answer: there is **no** Merkle chain in the 2026-08-19 manifest era. Verification is: count gaps in `request_id`, compare before/after JSON, RLS deny update.

If a later apply adds `row_hash` / `prev_hash`: verification procedure is `SELECT` ordered by id where `row_hash = sha256(prev_hash || payload)` in a human SQL snippet stored next to the migration. Do not invent that column in docs if the file does not have it. Read `169_audit_full_coverage.sql` on apply.

---

## Verification procedure (ops)

1. Pick an order id from a complaint.
2. `payment_events` for the payment (money truth).
3. `audit_log` for staff actions on that id.
4. If 157 applied: IPs older than 365 days NULL; WHO/WHAT remain.
5. A missing staff audit on refund is a W15/W47 fail, not "the DB lost it".

---

## Retention

157 sweep IPs. Do not DELETE money-adjacent audit rows to "GDPR" (DATA-RETENTION: keep B-class books).

---

## Open questions

| Q | Best answer |
|---|---|
| Hash chain live? | **Unverified.** Do not tell an auditor there is a hash chain until the applied SQL is read. |
