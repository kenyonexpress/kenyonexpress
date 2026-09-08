# ADMIN-WORKFLOWS

Admin is `/admin/**`, gated by `profiles.role`. Money screens are
`admin` / `super_admin` only (`canSeeMoney`). `content_uploader` writes
catalogue and lands in the approvals queue. `support` reads operations, does
not refund.

Every mutation goes through `writeAuditLog`. Failures of the log are swallowed
so the mutation the admin already made is not rolled back.

---

## 1. Daily admin tasks, in order

1. `/api/health` and `/api/ready` (database, limiter, Meilisearch, R2, Cardcom
   config). 503 pages; 200 with `meilisearch: skipped` is honest, not green
   search.
2. `/admin/analytics` for yesterday: sales, funnel drop-off, coupon vs
   physical.
3. `/admin/approvals`: empty the pending queue before noon.
4. `/admin/orders`: paid-but-not-finalized, refund requests, stranded.
5. `/admin/payments` if Cardcom and the ledger disagree. Cron
   `/api/cron/reconcile` should have run at 04:00 UTC; if cron is off, this
   step **is** the reconciliation.
6. Voucher disputes (scan refusals `wrong_supplier`, customer "I was charged
   twice").
7. Supplier leads / new members without a scanner (blocking).
8. Sentry: new issues on `finalize`, webhook, `redeem_voucher`.

If notifications cron is off, also check `notification_outbox` depth. Paid
customers without a voucher email will call.

---

## 2. Product approval flow

Uploader saves: `applyUploaderPolicy` strips `platform_percent` and
`supplier_split_percent`, forces `approval_status = 'pending'`. Default on
the table for an admin save is `approved`.

Queue: `/admin/approvals`, oldest `submitted_at` first.
Actions: `src/server/actions/admin/approvals.ts` (`approved` / `rejected`).
Admin-session only.

A pending product is not storefront-active. Approving without a
`platform_percent` still cannot sell: the cart marks the line unavailable
(C1). Fill the percent **before** approve, or the queue is theatre.

Reject: Hebrew reason in audit `changes`.

---

## 3. Supplier verification steps

Ordered checklist (`src/lib/admin/supplier-onboarding.ts`):

1. Identity: `name`, `contact_phone`, `address`, `logo_url` (the four that
   block publishing).
2. Status `active`.
3. At least one active `supplier_members` row (owner / manager / scanner).
   Without this, a sold coupon has nobody to scan it.
4. At least one product is nice; zero products is "new", not broken.

Table is `suppliers`, not `vendors`. Bank details may be collected for a
future physical payout; coupon money does not transfer. Do not tell the
supplier "we will send you 90% after scan".

Handoff: Google login to `/supplier/login`, PIN for the till app, print
`https://kenyonexpress.co.il/scan`.

---

## 4. Refund approval decision tree

```
Is the actor admin?
  no -> 403
Any voucher redeemed or expired?
  yes -> no card refund. Wallet goodwill is a separate action.
Any line that canTransition(REFUND)?
  no -> show describeRefundBlockers, stop
Same Israel clearing day as the charge?
  yes -> prefer CancelOnly (no credit)
Defect / our fault?
  yes -> fee 0
  no  -> fee = min(5%, ₪100)
Partial amount set?
  yes -> no fee, never CancelOnly
Provider credit or wallet destination as chosen
```

Details: `REFUND-POLICY-IMPLEMENTATION.md`. There is no "3 requests then
flag" gate.

---

## 5. Voucher dispute resolution

Customer: "the shop refused me" / "I never got a code".

1. Look up code on `/admin` voucher tools (`catalog` read).
2. Status `issued` and not past `expires_at` (clock, not cron): the till
   should work. Check `wrong_supplier` in scan log: they stood in the wrong
   business.
3. Status `redeemed`: value consumed. No card refund. Send them to the
   business.
4. No voucher row and order `paid`: issuance failed after charge. This is
   an incident (`finalize` / `issueVoucher`). Do not tell the customer to
   wait for an email if cron is off; open `/coupon/{id}` from the order.
5. QR "invalid_signature": `VOUCHER_QR_SECRET` rotation window; check
   `_PREVIOUS`.

---

## 6. Content moderation queue

Approvals queue is the moderation queue for catalogue. Reviews, if present,
use `catalog` write. Discounts (`/admin` discounts) are **money**:
`content_uploader` has `none`. Support may read campaigns, not create them.

Illegal or off-policy copy: reject approval or `paused` / `deleted_at` on
the product. Do not edit `platform_percent` as a punishment.

---

## 7. Feature flag change procedure

The live kill switch is `CHECKOUT_ENABLED`.

- Production: must be the string `true` to take real payments
  (`src/lib/payments/env.ts`).
- Dev: default on unless `false`.
- Changing a `NEXT_PUBLIC_*` or this flag requires a **Vercel redeploy**,
  not a restart.
- `CARDCOM_USE_MOCK=true` in production is a launch blocker: charges succeed
  without money.
- `CARDCOM_SANDBOX=true` refuses boot in production.
- `ALLOW_INCOMPLETE_ENV=true` is a laptop waiver for `next start`. Never set
  on Vercel.

No general feature-flag service. Do not add a second kill switch that the
env loader does not know.

---

## 8. Emergency product takedown

Fastest storefront hide:

1. Set `products.status` to `paused` or `archived`, or set `deleted_at`.
2. Call `updateTag(CATALOGUE_TAG)` so the hour cache dies.
3. Search: the products webhook / outbox should enqueue a **delete** job
   (soft-delete or not `active` becomes a delete op). If Meilisearch is
   configured, confirm drift later; if not, ILIKE follows the table.

Do not `DELETE` the row if orders point at it. Soft-delete keeps history.

Checkout in flight: the cart re-reads and marks unavailable; a Low Profile
already open may still pay. Watch `/admin/orders` for that window.

Site-wide: `CHECKOUT_ENABLED` not true. Instant rollback of the Vercel
deployment if the bug is in the build.

---

## 9. Audit log review cadence

`audit_log` is append-only (trigger refuses UPDATE/DELETE, including
service_role). Admin SELECT only.

Cadence: glance daily on money actions (`manual_override`, refunds,
permission_change). Weekly: sample `updated` on `products` and `suppliers`.
After an incident: filter by actor and hour.

Columns include `ip_address` and `user_agent` when `writeAuditLog` ran
inside a request. Cron rows may have null IP; that is still better than no
row.
