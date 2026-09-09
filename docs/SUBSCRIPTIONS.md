# Subscriptions

## 2026-09-09: [90] closed, and what it added to the document below

**This section is additive. Everything below it is the 2026-09-02 write-up of
the create path and the lifecycle, and it is still accurate** - [90] built on
top of it rather than replacing it.

Recurring monthly billing against a saved card token. Section 90.

**The feature flag is off.** `211_subscriptions_phase2.sql` sets
`phase_config.recurring` to disabled, so the product type is not listed, not
purchasable and its product pages 404. See `docs/PRODUCT-PHASES.md`.

## What was already built, measured first

`135b_recurring_subscriptions.sql` is **applied**. `subscriptions` (18 columns)
and `subscription_charges` (11) exist in production holding no rows, and the
machinery around them is real rather than scaffolding:

| | |
| --- | --- |
| dunning | `MAX_CHARGE_ATTEMPTS = 3` in `lib/commerce/recurring.ts` |
| the charge cron | `app/api/cron/subscriptions/route.ts` |
| customer page | `/account/subscriptions` |
| cancel | `cancelSubscription` |
| double-charge defence | `subscription_charges_one_per_cycle`, unique on `(subscription_id, period_key) WHERE status = 'succeeded'` |

So section 90 was mostly done. What follows is what was missing.

## Pause and resume

**`paused` had been a permitted status since 135b and nothing could set it.**
The database CHECK allowed it, `dueSubscriptions` skipped it, `canCancel`
accepted it, and the only exported action was cancel. A state the whole system
understands and no path produces is a feature that reads as built.

The decisions are pure functions in `lib/commerce/recurring.ts`, for the same
reason the charge outcome is: they are testable without a database, and they are
the half most likely to be got wrong.

**Pausing keeps `next_charge_at` rather than clearing it.** `dueSubscriptions`
already refuses any status that is not `active` or `past_due`, so a stale date
on a paused row can never be charged. Keeping it lets support see which cycle
the customer stopped on - the same reason `applyChargeOutcome` leaves the date
in place on a decline - and it keeps `paused` distinguishable from `canceled`,
which is what `subscriptions_canceled_is_terminal` is for.

**Resuming starts a fresh cycle from now, and resets `failed_attempts`.** Both
halves are load-bearing and neither is obvious:

- Restoring the stored date would charge the customer **the instant they
  resume**, for a period they spent paused. That is the one thing a pause button
  must not do.
- `dueSubscriptions` refuses any row at or past `MAX_CHARGE_ATTEMPTS`. A
  subscription resumed from `past_due` with three failures behind it would read
  as `active` in the customer's account, sit there looking alive, and **never be
  charged by any run**. That is worse than either state it came from, because
  nothing reports it. The customer had to act to resume, which is the event that
  justifies a fresh dunning cycle; a card that is still dead simply fails three
  more times.

`recurring-hold.test.ts` asserts both, including that the reset is what makes
the resumed row billable again.

## An invoice per charge

**`invoices.order_id` was NOT NULL, and a cycle charge creates no order.** That
is not an oversight on the charge path; it is a decision the cron states in its
own header:

> It does not move money into the wallet or create an order. A cycle charge is a
> payment against a token ... Building orders per cycle would create a second,
> competing definition of what an order is.

That reasoning is right, so 211 does not overturn it. `order_id` becomes
nullable, `subscription_charge_id` is added, and a CHECK requires **exactly
one** of them: an invoice for nothing is a tax document nobody can trace back to
a payment, and one for both is two claims about the same money.

`invoices_one_per_subscription_charge` is unique, so a retried invoice job
cannot issue a second tax document for one payment - a reporting error rather
than a duplicate row.

**Always a tax invoice, never a coupon receipt.** `documentTypeForOrder` decides
from what an order contains, and a subscription contains a recurring service: a
taxable supply on the day it is charged, not an advance against a voucher. There
is nothing to decide, so nothing decides it.

**Queued only on success, after the charge row and before the schedule
advances.** A declined card produces no supply and no document. A crash between
the two leaves a charge with no invoice, which the invoice cron can still find,
rather than an advanced schedule with no record of what was billed. The result
is deliberately not checked: the card has already been charged, and a document
that could not be queued must not turn a successful payment into a failed run.

## The admin console

`/admin/subscriptions`. **There was no admin route at all**, which means a
`past_due` subscription was invisible until the customer complained - the case
the three dunning attempts exist to catch early.

Sorted `past_due` first, then `active`, then by soonest due date. An operator
opening this page is almost always here because something failed, and sorting by
creation date buries the three rows that need them under fifty that do not.

It prints an explicit warning for subscriptions that have spent their retries:
no run will charge them again, they are not cancelled, and that is deliberate -
the cron's own header says auto-cancelling a paying customer over a card that
expired on a Tuesday is not a decision a cron job gets to make.

**Read only.** Cancelling somebody else's subscription is a money decision with
a consumer-law consequence: Israeli law gives the **customer** the right to
cancel at any time, and the customer's own page is where that happens. What an
operator needs first is to see which cards have stopped working.

## Cancellation and Israeli law

`cancelSubscription` is on the customer's own page and is available at any time,
in one step, from the same screen the subscription is displayed on. That is the
requirement: a consumer may cancel a continuing transaction whenever they
choose, and the cancellation route may not be harder than the sign-up route.

Cancelling stops the next charge and does not refund the current period, which
is what the page says in the sentence above the list. `next_charge_at` is
cleared, because `subscriptions_canceled_is_terminal` requires it and because a
cancelled row with a future date is one forgotten status check away from being
billed.

**A failure never cancels.** Three declines leave the subscription `past_due`
for a human to resolve.

## What was not done

**No dunning email.** The charge cron records failures and the admin console
shows them; nothing tells the customer their card was declined. That is the
obvious next step and it is a notification-template question rather than a
billing one, so it belongs with the other outbox work.

**No proration.** A subscription is a fixed amount per cycle. Changing the
amount mid-cycle would need a credit note and a rule about which side of the
period the change falls on, and nothing asks for it yet.

**No plan changes.** Upgrade and downgrade are a different feature: they need a
second subscription, a transfer of the remaining period, and a decision about
which invoice the difference lands on.


---

## 2026-09-02: the create path and the lifecycle

How a recurring product becomes money every month. Written 2026-09-02, against
the code and against production, after the create path was built -- until then
this document could not have been written honestly, because renewal and
cancellation existed while nothing could create a subscription.

## The shapes

A subscription product is `products.type = 'recurring'` (135a) with three
billing columns: `recurring_amount_agorot` (integer agorot), `billing_interval`
(`monthly` | `yearly`), `billing_interval_count`. Incomplete billing columns
mean the PDP shows the ordinary price block and checkout will refuse to plan a
subscription -- loudly, because by then the customer has paid.

## The lifecycle, end to end

```
PDP           "הצטרף למנוי", price per cycle, renewal terms BEFORE the click
checkout      a subscription is bought ALONE (one line), and tokenisation is
              forced: the first cycle's charge is ChargeAndCreateToken
webhook       verifies the charge like any other (signature, replay dedup,
              GetLpResult, amount)
finalize      persists the card token, then creates the subscriptions row --
              idempotent on origin_order_id, so webhook/DLQ replays cannot
              mint a second one. last_charge_at = now: the first cycle was
              the checkout charge itself. platform_percent is the LINE's
              snapshot, never re-read from the product.
renewal       api/cron/subscriptions charges rows whose next_charge_at passed,
              through the saved token, on the terminal that minted it.
              MAX_CHARGE_ATTEMPTS = 3, then past_due.
cancel        cancelSubscription: runs to the end of the paid period.
```

## Refusals that alarm rather than skip

In finalize, after money moved, every refusal raises a payment alarm naming the
reason: `guest_has_no_subscription`, `no_payment_token`,
`product_not_billable` (with the product id). A silent skip would take the
first cycle's money and never renew or deliver.

## Open, honestly

- **Pause** and **card swap** have no server action yet (`cancelSubscription`
  is the only management verb). The account page lists subscriptions and can
  cancel.
- **Status-transition emails** (activated, past_due, canceled) are not sent;
  the outbox has no kinds for them. Same pattern as `account_deleted`: the
  kinds ship in a migration, the enqueues after it.
- The renewal charge's own webhook-less path (`token_charge_*` journal events)
  is defined in payment_events and not yet emitted by the worker.

