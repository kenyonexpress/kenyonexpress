# Architecture Decisions

Every structural decision this system rests on, what it was decided instead of,
and why.

Dated where the date is known from a migration, a commit or a document. Where a
decision was made implicitly and only later written down, that is said rather
than a date invented.

> This file was previously the log of provisional decisions taken in Ofir's
> absence. That content is intact at
> **`docs/DECISIONS-PROVISIONAL.md`**, and those decisions are still awaiting
> approval. This file is the architectural record.

**Status key:** ✅ in force · ⚠️ in force but the code diverges · 🕯️ superseded

---

## Money

### D-1. Money is integer agorot, never float ✅
**Date:** foundational.

Every amount is an integer count of agorot (1 ₪ = 100 agorot). Every rate is
integer basis points. All rounding is integer half-up. One module,
`src/lib/money.ts`, with a branded `Agorot` type so an ordinary `number` cannot
be passed where money is expected.

**Instead of:** `numeric` shekels in the application, or floats.

**Why:** float cannot represent 0.1, so two independently computed halves of a
split disagree by fractions that accumulate. With integers, `commission +
supplier_due = face` is exactly true and can be enforced as a database CHECK,
which is not expressible in floating point.

**Consequence:** every constructor asserts `Number.isSafeInteger`, including on
intermediates, so a value that would lose precision throws rather than rounding
quietly.

### D-2. There is no escrow ✅
**Date:** 2026-07-24, removed from the database by migration 125.

The customer pays the absolute coupon price on the site, **all of it stays with
the platform permanently**, and the supplier collects the balance in cash at the
counter. No coupon money is held for a supplier and none is paid out to one.

**Instead of:** holding the supplier's share until redemption, which is what the
first design did and what several documents still describe.

**Why:** it is a payment product the platform is not licensed to be, it creates
a liability that has to be reconciled, and it answers a question nobody asked:
the supplier is already getting paid, in cash, by the customer standing in front
of them.

**Consequence:** the coupon and physical happy paths became the **same two
moves**, `pending -> paid -> split_executed`, with a coupon simply splitting
100/0. There is no state between `paid` and settled because nothing is deferred.
`escrow_holds` survives with 2 legacy rows and `escrow_held` / `escrow_released`
survive as enum labels nothing can write, because you do not drop an enum value
from a production database over a rule change.

### D-3. There is no payout system ✅
**Date:** implied by D-2; recorded 2026-09-01.

**Why:** it follows directly. If the platform owes the supplier nothing on the
coupon path, there is nothing to pay out.

**Consequence:** `payout_status` and `payout_line_type` exist as enums with
**no tables behind them**, and `src/server/actions/admin/payouts.ts` still calls
four RPCs and one table that do not exist. See `docs/API-REFERENCE.md` §5.

### D-4. The coupon prepayment is an absolute amount, never a percentage ✅
**Date:** 2026-07-28 ruling.

`products.coupon_price_ils`, set by an admin per product.

**Instead of:** deriving it as a percentage of face value.

**Why:** deriving it is exactly how the quote and the charge came apart before.
A product without it renders as `{ sellable: false, reason: 'missing-price' }`
rather than guessing.

### D-5. `platform_percent` is mandatory, per product, with no default anywhere ✅
**Date:** migration 050 (`NOT NULL`, no `DEFAULT`).

**Instead of:** a global 10% with per-product override.

**Why:** a silent default prices a product nobody priced. A product without the
value cannot be sold, and that failure is loud and fixable.

### D-6. The percent is snapshotted onto `order_items` at purchase ✅

Along with supplier identity by value. Settlement never reads a live percentage
off a product.

**Why:** changing a product's rate tomorrow must not rewrite the arithmetic of
an order placed today, and renaming a supplier must not rename the sale.

### D-7. The supplier residual is `face − fee`, not a second percentage ✅

**Why:** applying the mirror percent to the same base rounds twice, and the two
halves then disagree by an agora. Subtraction cannot.

### D-8. Per-unit splitting gives the remainder to the first unit ✅

1000 agorot across 3 units is 334 / 333 / 333.

**Why:** each unit becomes a voucher carrying its own conservation CHECK. The
remainder has to land somewhere integral, and "the first one" is arbitrary but
deterministic.

### D-9. VAT is extracted by subtraction, at 18% ✅
**Date:** `VAT_RATE_BP` moved 1700 → 1800; contradiction closed 2026-09-01.

`net = divRoundHalfUp(gross * 10000, 10000 + vatRateBp)`, then
`vat = gross − net`.

**Why:** only one of the two is rounded and the other absorbs the remainder, so
`net + vat = gross` exactly. Computing both independently is how a receipt comes
to be off by an agora. `DEFAULT_VAT_PERCENT` derives from the same constant so
the two cannot drift again.

---

## Payments

### D-10. `finalizeOrder` is the only writer of the transition to `paid` ✅

**Why:** it makes the webhook safe to replay. Finalize checks `paid_at` first
and returns `{ ok: true, replay: true }`, so a callback delivered five times
issues one set of vouchers.

### D-11. The Cardcom callback body is never trusted for money ✅

Authenticity rests on an unguessable secret in the callback URL plus a
**mandatory server-to-server `GetLpResult` re-fetch**, and the re-fetched result
is the only trusted source of amount, status and token.

**Why:** Cardcom's legacy `/Interface/*.aspx` API **does not sign its
callbacks**. There is no HMAC header to verify. Given that, the body is an
unauthenticated assertion from the internet.

### D-12. Both webhook secrets are always compared, with no short circuit ✅

**Why:** returning on the first match would let response time reveal which
secret was presented, defeating the constant-time comparison it sits inside.

### D-13. Journal before acting ✅

Every payment event is written to `payment_events` before any decision.
Deduplication is on `(provider, external_event_id)`; a `23505` unique violation
means replay, which answers 200 and does nothing.

### D-14. `payment_events` is append-only, enforced by trigger ✅
**Date:** migration 130.

**Why:** a forensic record that can be edited is not a forensic record. The
`payment_events_append_only` trigger refuses UPDATE and DELETE, so the property
holds against every writer including the service role.

### D-15. `processed_at` is stamped after finalize, not before ✅

**Why:** it used to be stamped one statement *before* finalize ran, so a finalize
failure left a row claiming to be handled and the only trace was an alarm.
Nothing could enumerate the damage afterwards, let alone replay it. The current
ordering makes `verified_against_api = true AND processed_at IS NULL` mean
exactly one thing: charged, confirmed with Cardcom, and finalize did not
complete.

### D-16. A card refund is legal only while every voucher is still `issued` ✅

**Why:** once a voucher is redeemed the value was consumed at the business and
the supplier has already been paid in cash by the customer. The platform cannot
un-consume it. A goodwill gesture after that point is a wallet credit, which is
a different money movement against a different table.

### D-17. Israeli consumer law lives in CHECK constraints, not application code ✅
**Date:** migration 131.

```sql
cancellation_fee_agorot <= LEAST((requested_agorot + 19) / 20, 10000)
ground NOT IN ('defect','duplicate_charge') OR cancellation_fee_agorot = 0
```

**Why:** a statutory cap that a code path can forget is a compliance risk. In
the schema, no writer can violate it.

---

## Vouchers

### D-18. Single use is one conditional `UPDATE`, not a read-then-write ✅

```sql
UPDATE vouchers SET status = 'redeemed', ...
WHERE code = ? AND status = 'issued' AND expires_at > now()
  AND supplier_id IN (SELECT supplier_id FROM supplier_members
                      WHERE user_id = auth.uid() AND is_active)
```

**Why:** there is no window between check and write for a race to fit. Two
concurrent scans cannot both match. This single statement is the entire
single-use guarantee; neither grants nor RLS enforce it.

### D-19. The QR proves minting, not authorization ✅

`KEV1.<payload>.<HMAC-SHA256>`, with the MAC covering the full `KEV1.<payload>`
prefix so the version byte cannot be swapped.

**Why:** possession of a valid payload must not be sufficient. Someone who
screenshots a QR and presents it twice gets `already_redeemed` on the second
scan, because the database decides, not the signature. The `k` key-id field
exists so the secret can rotate.

**Instead of:** reusing `src/server/domain/orders/redemption.ts`, whose digest
is a bare unsigned SHA-256 and is forgeable by anyone with a copy of the repo.

### D-20. The voucher code excludes `I`, `L`, `O`, `U` ✅

Ten symbols of Crockford base32, 32^10 ≈ 1.1e15.

**Why:** this code is read aloud across a counter and typed by hand. Those four
are the ones that get misheard. Generation rejects bytes at or above 256 so no
symbol is favoured; a bare `byte % 32` would bias `0`–`7`.

### D-21. Every scan attempt is recorded, including failures ✅

`voucher_redemptions` gets a row for `not_found`, `wrong_supplier`,
`rate_limited` and `unauthorized` as well as `success`, with IP and user agent.

**Why:** a log that records only successes cannot answer who tried.

### D-22. `wrong_supplier` reveals nothing else ✅

**Why:** a scanner at the wrong business must not be able to learn the status,
the value or the real supplier of someone else's voucher.

### D-23. A supplier can read a voucher only after redeeming it ✅

The policy is gated on `redeemed_by_supplier_id`, NULL until redemption.

**Why:** otherwise a supplier could enumerate outstanding vouchers issued against
their business, learning how much unredeemed liability is walking around and
correlating it to individual customers.

### D-24. The staff PIN is not a login ✅

**Why:** the device is already authenticated as the supplier, and a wrong PIN
denies nothing the device could not otherwise do. What the PIN buys is an
answerable audit trail for when a customer disputes a redemption. It is rate
limited to 15/hour/staff because a four-digit PIN against an unlimited endpoint
is ten thousand tries.

---

## Data and security

### D-25. RLS on every table, with the policy as the boundary ✅

61 tables, RLS on all of them, 0 disabled, 133 policies.

⚠️ **But:** `authenticated` still holds INSERT/UPDATE/DELETE on 56 relations
despite `126_revoke_authenticated_dml` being in the ledger. RLS is therefore the
**only** database-level defence on the money tables, not RLS plus a grant.

### D-26. `auth.uid()` is wrapped in a scalar subquery in every policy ✅
**Date:** `rls_auth_initplan_wrap_select`.

`(SELECT auth.uid())` rather than `auth.uid()`.

**Why:** it turns a per-row function call into an InitPlan evaluated once per
query. On a large table the difference is the whole query cost.

### D-27. Every `SECURITY DEFINER` function pins `search_path` ✅

61 of 61, zero unpinned.

**Why:** it closes the search-path hijack class outright. A definer function
without it can be made to resolve `products` to an attacker's table.

### D-28. Server-only tables deny explicitly rather than by absence ✅
**Date:** migration 122.

Five tables moved from "zero policies" to a `RESTRICTIVE` policy with
`USING (false)`.

**Why:** absence of a policy is indistinguishable from an oversight, and a later
`CREATE POLICY` on such a table silently opens it. A `RESTRICTIVE false` cannot
be overridden by adding a permissive policy.

### D-29. All 12 views are `security_invoker` ✅

**Why:** a `SECURITY DEFINER` view is a hole straight through the RLS of its
base tables.

### D-30. `profiles.role` is authoritative, not `app_metadata` ✅

**Why:** `app_metadata` is copied into the JWT at sign-in and goes stale the
moment a role changes. Reading the table costs a query and is always right.
`enforce_profile_privilege_columns` stops a user changing their own `role` or
`supplier_id`, which is what makes "you may update your own profile" safe.

### D-31. Supplier rights come from `supplier_members`, not `profiles.role` ✅

**Why:** the two are orthogonal. An admin is not automatically a supplier, and a
supplier is not an elevated customer. `is_active` is part of the check, so
deactivating a member revokes scanning immediately without deleting the audit
history attached to their user id.

### D-32. Money columns are integer twins of `numeric` originals, generated ⚠️
**Date:** migrations 138–141.

26 `GENERATED ALWAYS ... STORED` columns computed as
`round(<shekel column> * 100)::bigint`.

**Why:** the multiplication stops happening in JavaScript, and the twin cannot
drift from its source because the database computes it.

⚠️ **Diverges:** `finalize.ts` and `queries/orders.ts` still name **four**
column names from the *other*
generation, which do not exist in production. `docs/RUNBOOK.md` §4.1.

### D-33. `search_index_outbox.product_id` is not a foreign key ✅
**Date:** migration 132.

**Why:** a DELETE of the product must leave the "remove this document"
instruction behind. `ON DELETE CASCADE` would delete exactly the row carrying
the work.

### D-34. The search webhook payload is a notification, never data ✅

The worker re-reads the product row from Postgres before touching the index.

**Why:** out-of-order and duplicate deliveries converge on the truth instead of
fighting, and a spoofed payload can at worst schedule a no-op. Same discipline
as D-11.

---

## Platform

### D-35. Next 16, with `src/proxy.ts` as the edge entry ✅

`middleware.ts` no longer exists; the exported function must be named `proxy`.

### D-36. Redirects run before session refresh, on GET/HEAD only ✅

**Why:** Googlebot re-crawling retired paths should not cost thousands of token
refreshes. And a 301 on a POST is a request whose body the browser may or may
not resend: a redirected payment callback is a payment nobody hears about.

### D-37. `/checkout` is not auth-gated; `/checkout/frame-return` must not be ✅

**Why:** checkout takes guests, and sign-in happens at the pay press.
`frame-return` is where Cardcom navigates the payment iframe, cross-site, and
browsers withhold `SameSite=Lax` cookies on that navigation. Gating it shows a
login form inside the payment box of a shopper who has just paid.

### D-38. pnpm only ✅

**Why:** `npm install` crashes inside npm's arborist on pnpm's symlink store,
before any lifecycle hook can produce a better message.

### D-39. Coverage is floored on the money modules only, at 95% ✅

No global threshold.

**Why:** a global percentage is a number people optimise rather than a property
anyone relies on. The closed invariant list is what protects the money path.

### D-40. The cron routes were removed from `vercel.json` ✅

**Why:** Vercel's cron allowance is a plan feature; Hobby is two daily jobs and
this needs ten, four at short intervals. Declaring all ten **does not fail and
does not warn** — the platform runs what the plan covers and silently ignores
the rest, which is how a payment reconciler comes to be believed to be running
when it is not. Removing them was the honest choice.

⚠️ **Consequence:** nothing is scheduled. `docs/OPERATIONS-CALENDAR.md`.

### D-41. Migrations are files applied on approval; `db push` is forbidden ✅

⚠️ **Diverges in practice:** many of the 99 applied migrations were applied
through MCP and their SQL was never committed, which is how production's ledger
and `supabase/migrations/` became different lists. A migration number is not a
unique key here: two migrations are numbered 126 and two 127.

---

## Superseded

| | Decision | Superseded by | Date |
|---|---|---|---|
| 🕯️ | Coupon prepayment split with the supplier, held until redemption | D-2, D-3 | 2026-07-24 |
| 🕯️ | Fixed 10% commission with per-product override | D-5 | migration 050 |
| 🕯️ | `platform_bp` as integer basis points on `vouchers` | `platform_percent`, whole-percent `numeric` | never applied |
| 🕯️ | VAT 17% in the ledger against 18% on invoices | D-9 | 2026-09-01 |
| 🕯️ | Cardcom Multi-Account split at time of payment | settlement at finalize | 2026-07-27 |
| 🕯️ | `voucher_status` renaming `redeemed` to `used` (draft 087) | live enum keeps `redeemed` | never applied |
| 🕯️ | A double-entry ledger (`ledger_entries`, `ledger_accounts`) | `wallet_entries` | never applied |

---

## Related

| For | See |
|---|---|
| Provisional decisions awaiting approval | `docs/DECISIONS-PROVISIONAL.md` |
| Where documents contradict production | `docs/SCHEMA-REALITY-CHECK.md` |
| The money rules in force | `docs/MONEY-MODEL.md` |
| The security posture these produce | `docs/SECURITY-POSTURE.md` |
