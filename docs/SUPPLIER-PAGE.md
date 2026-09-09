# Supplier Portal

What a supplier can see and do, and the authorisation model behind it.

Verified against production (`ixvwfbuvfxxsjiywhbbb`) on **2026-09-01**. Route
paths and module names are read from the branch this document sits on.

Companion documents: `docs/VOUCHER-LIFECYCLE.md` (the scan itself),
`docs/ARCHITECTURE-OVERVIEW.md` §5 (roles and RLS),
`docs/PAYMENT-FLOW.md` (what the supplier is owed, and why it is usually zero).

---

## 1. The one thing to understand first

**On the coupon path the platform owes the supplier nothing.**

The customer pays `coupon_price_ils` on the site and the platform keeps all of
it, permanently. The supplier collects the remaining balance in cash from the
customer at the counter, at the moment the voucher is scanned. That cash never
passes through the platform's clearing account, so there is no payout to
compute, no escrow to release, and no settlement window to wait out.

The portal therefore is not a payments dashboard. It is a **scanning surface
with a sales history attached**. The `payouts` page exists for the physical
product path, which is not yet live.

This is why `payout_status` and `payout_line_type` exist as enums in production
with **no tables behind them**. There is no `supplier_payouts` table and never
has been in this lineage. Documents describing a payout ledger are describing a
design that was not built.

---

## 2. Who is a supplier

Supplier authorisation is **entirely separate from `user_role`**. A user is a
supplier because they hold an active row in `supplier_members`, not because of
anything on their profile. An `admin` is not automatically a supplier, and a
supplier is not an elevated customer.

```
supplier_members
  user_id      -> auth.users
  supplier_id  -> suppliers
  role         supplier_member_role: owner | manager | scanner
  is_active    boolean
```

| Role | Can scan | Can see orders and history | Can manage members |
|---|---|---|---|
| `owner` | yes | yes | yes |
| `manager` | yes | yes | no |
| `scanner` | yes | limited | no |

The membership check runs through two `SECURITY DEFINER` helpers so the rule has
exactly one definition and policies never hand-roll the join:

```sql
is_supplier_member(supplier_id)   -- any active membership
is_supplier_owner(supplier_id)    -- active membership with role = 'owner'
```

`supplier_members` policies are written against `is_supplier_owner`, so an
owner administers their own staff and nobody else's:

```sql
supplier_members_select_unified  user_id = (SELECT auth.uid())
                                 OR is_supplier_owner(supplier_id)
supplier_members_insert_unified  WITH CHECK is_supplier_owner(supplier_id)
supplier_members_update_unified  is_supplier_owner(supplier_id)
supplier_members_delete_unified  is_supplier_owner(supplier_id)
```

---

## 3. Routes

### Authenticated portal, under `(supplier)`

| Route | Purpose |
|---|---|
| `/supplier` | Dashboard: today's scans, sales summary |
| `/supplier/scan` | The scanner. Camera or manual code entry |
| `/supplier/orders` | Orders containing this supplier's lines |
| `/supplier/products` | This supplier's catalogue, read-only |
| `/supplier/redemptions` | Scan history, including failures |
| `/supplier/payouts` | Physical-path settlement. Empty on the coupon path |
| `/scan` | Short alias for the scanner, for a device home-screen shortcut |

### Public, under `(supplier-public)`

| Route | Purpose |
|---|---|
| `/supplier/login` | Sign in |
| `/supplier/access-denied` | Authenticated, but no active membership |

**Both public routes are excluded from the `/supplier/*` auth gate in
`src/proxy.ts`.** Gating them would be a redirect loop: a user with no
membership would be bounced from `access-denied` to `login` and back.

### API

| Route | Purpose |
|---|---|
| `POST /api/supplier/vouchers/redeem` | Redeem one voucher |
| `POST /api/supplier/vouchers/redeem-batch` | Redeem several in one request |
| `GET /api/supplier/vouchers/lookup` | Inspect a code without consuming it |
| `POST /api/supplier/redeem` | Legacy redemption entry point |
| `POST /api/supplier/app/pin` | Identify which member of staff is at the till |

---

## 4. Scanning

The scan itself is `redeem_voucher()`, documented in full in
`docs/VOUCHER-LIFECYCLE.md` §4. From the portal's side, the contract is:

- **The QR is not an authorization token.** It proves the platform minted the
  voucher. Single use is decided by an atomic conditional UPDATE in the
  database, so a screenshotted QR presented twice gets `already_redeemed`.
- **The supplier is never taken from the request.** `redeem_voucher` derives it
  from `auth.uid()`'s active memberships. A device cannot redeem at a business
  it does not work for, and cannot probe one either.
- **Every attempt is recorded**, success or failure, in `voucher_redemptions`
  with outcome, IP, user agent, scan method and idempotency key. `/supplier/redemptions`
  reads that table, so the failures are visible to the supplier too, not just to
  the platform.
- **Rate limit: 30 scans per user per minute.**

`lookup` exists so counter staff can answer "is this valid?" without consuming
the voucher, which is what a customer asking a question before ordering needs.

### The staff PIN

`POST /api/supplier/app/pin` and the `verify_supplier_staff_pin` RPC.

**The PIN is not a login.** The device is already authenticated as the supplier
before the PIN is presented, and a wrong PIN denies nothing the device could not
otherwise do: the scanner still works, the scan is simply recorded with no name
attached. What the PIN buys is an **answerable audit trail**, which is what
matters when a business asks who redeemed a voucher a customer is disputing.

The route exists even though the RPC is granted to `authenticated`, and the
reason is the rate limit. A four-digit PIN against an unlimited endpoint is ten
thousand tries. The route allows **fifteen attempts per hour per staff member**:
far above a cashier who mistyped twice, far below enumeration. bcrypt makes each
attempt cost real time on top of that, and a per-staff lockout catches the case
where one person's PIN is being probed specifically.

`set_supplier_staff_pin` is `service_role` only. Staff cannot set their own.

---

## 5. What a supplier can read

`src/server/queries/supplier.ts` is the read layer:
`getSupplierSales`, `getSupplierOrders`, `getSupplierRedemptions`,
`getSupplierProducts`. Aggregation is in `src/lib/supplier/dashboard.ts`
(`aggregateDashboard`, `toPayoutBreakdown`, `summarizeSettlement`,
`SETTLEMENT_LABEL_HE`).

The RLS boundaries that shape those reads:

**Orders.** A supplier sees an order only once it is paid, and only if it
contains one of their lines:

```sql
orders_select_unified
  is_admin()
  OR (deleted_at IS NULL
      AND status IN ('paid','partially_fulfilled','fulfilled')
      AND is_supplier_order(id))
  OR (is_support() AND deleted_at IS NULL)
  OR user_id = (SELECT auth.uid())
```

A `pending` order is invisible to the supplier. Nothing is shown until the money
is confirmed.

**Order items.**

```sql
order_items_select_unified
  is_admin()
  OR (deleted_at IS NULL AND supplier_id IS NOT NULL
      AND is_supplier_member(supplier_id))
  OR (is_support() AND deleted_at IS NULL)
  OR ... owner clause
```

Scoped by the `supplier_id` **snapshotted on the line**, not by a join to the
live product. Reassigning a product to a different supplier does not retroactively
hand the sales history over.

**Vouchers.** This is the interesting one:

```sql
vouchers_select_unified
  is_admin()
  OR user_id = (SELECT auth.uid())
  OR (redeemed_by_supplier_id IS NOT NULL
      AND is_supplier_member(redeemed_by_supplier_id))
```

A supplier can read a voucher **only after redeeming it**. They cannot enumerate
outstanding vouchers issued against their own business. That is deliberate: it
stops a supplier from learning how much unredeemed liability is walking around,
and from correlating outstanding vouchers to individual customers before those
customers walk in.

**Customer PII is minimal by design.** Name and city for shipping; the full
address is exposed only for physical items, through the `user_addresses`
supplier-read policy.

**Branches.** `supplier_branches` (migration 133) is the one place a supplier
has write access to public-facing data:

```sql
supplier_branches_public_read   anon + authenticated: is_active
                                AND the supplier is not soft-deleted
supplier_branches_member_write  ALL: an active membership row
supplier_branches_admin_all     ALL: admin or super_admin
```

---

## 6. The till app

`apps/mobile` is an Expo application and a **second RPC caller** against the
same database. It calls `redeem_voucher`, `verify_supplier_staff_pin` and
`supplier_app_context`.

> **Any grants or authorisation audit scoped to `src/` under-counts.** This is a
> recurring error: a proposed migration that revokes an `authenticated` EXECUTE
> grant can look safe against the web codebase and still break the till app.
> Check `apps/mobile` before narrowing any grant that `authenticated` holds.

`push_tokens` backs notifications to the till device. `fn_push_targets` is
`service_role` only.

---

## 7. Supplier onboarding

`supplier_leads` holds inbound applications, with `supplier_application_status`
of `pending | approved | rejected`. `suppliers.status` is
`active | suspended | closed`.

Creating a supplier and the first `owner` membership is an admin action
(`/admin/suppliers`). There is no self-service path from lead to live supplier,
which is correct while the first `owner` row is what grants scanning rights over
real money.

---

## 8. Current production state

| | |
|---|---|
| `suppliers` | 12 |
| `supplier_members` | populated |
| `supplier_branches` | **0** |
| `supplier_staff` | populated, PINs bcrypt-hashed |
| `vouchers` | **0** |
| `voucher_redemptions` | **0** |

No voucher has been scanned in production. The portal has not yet been exercised
against real traffic, so treat the scan path as tested but not proven.

---

## 9. Known gaps

1. **`/supplier/payouts` has nothing to show and no table behind it.** On the
   coupon path this is correct: there is nothing to pay out. When the physical
   path goes live it needs a real settlement source, and `settlement_events` is
   the table that would carry it. The `payout_status` and `payout_line_type`
   enums are unbacked today.

2. **Vouchers do not expire on their own.** No scheduler is running, so
   `expire_vouchers()` is not being called. A supplier can currently redeem a
   voucher whose `expires_at` has passed only if the guard inside
   `redeem_voucher` fails to catch it, which it does not: the atomic UPDATE
   carries `AND expires_at > now()`, so an overdue voucher returns `expired` at
   the counter even though its stored status is still `issued`. The row is
   stale; the answer is correct. See `docs/RUNBOOK.md` §2.

3. **`authenticated` still holds INSERT, UPDATE and DELETE on 56 tables**,
   including `orders`, `order_items` and `vouchers`. RLS is what actually stops
   a supplier writing outside their scope, not the grant. Every supplier-facing
   write policy has to be correct on its own; there is no second layer under it.
