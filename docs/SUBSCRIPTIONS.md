# Subscriptions

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
