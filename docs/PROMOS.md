# Promos and gifts: a code could be scheduled, a price could not

Measured 2026-09-09 against production (`ixvwfbuvfxxsjiywhbbb`).

Most of this was already built. The measurement worth having is which parts, and
which of the remaining gaps are features versus decisions.

## The promo engine exists and is good

`discount_campaigns` (096, applied) carries every knob the spec asks for:

| asked for | column | state |
| --- | --- | --- |
| percent / fixed | `kind` (`discount_kind` enum), `percent_bp`, `amount_agorot` | applied |
| minimum order | `min_order_agorot` | applied |
| cap on the discount | `max_discount_agorot` | applied |
| schedule | `starts_at`, `expires_at` | applied |
| total cap | `max_uses` | applied, **counted since 194** |
| per-user cap | `max_uses_per_user` | applied, **counted since 194** |
| stacking | `allow_stacking` | applied and enforced |

`src/lib/growth/discount.ts` evaluates all of it, refusing with a named reason
(`stacking-not-allowed`, `expired`, `below-minimum`) rather than a boolean.

**The caps only became real in 194.** Before it, `checkout.ts` carried the
finding in a comment: "nothing increments `coupons.used_count`, so `max_uses` is
enforced as a read of a counter no part of this flow advances". A single-use
code was unlimited-use, for everybody. `docs/INVENTORY.md` has the measurement.

**`allow_stacking` is enforced**, and the shape is right: the campaign is
refused when the cart already carries another discount, so the rule lives with
the campaign that has an opinion about it rather than in a global setting.

## Free shipping is not a discount kind, and would be a discount of zero

`discount_kind` is `percent, fixed`. There is no `free_shipping`, and adding one
would produce a promotion worth nothing: **nothing charges for delivery
anywhere.** `orders` has no shipping column, the cart view has no shipping line,
and `TopBar` prints "משלוח מהיר חינם" on every page of the site
(`docs/SHIPPING.md`).

A free-shipping code against free shipping is a code that takes ₪0 off. It
becomes a real kind on the day `shipping_zones` starts charging — which is a
business decision about a sitewide banner, not an engineering task, and
`zones.test.ts` holds the two together so neither can move alone.

## Buy-as-gift is built, applied, and complete

`vouchers` carries `gift_recipient_email`, `gift_recipient_name`,
`gift_message`, `gifted_by_user_id`, `gift_claim_token_hash`, `gift_sent_at` and
`gift_claimed_at`. `/gift/[token]` claims it, `voucher_gifted` mails the
recipient, and `src/lib/gifts/claim-token.ts` hashes the token so the database
never holds the value in the link.

The design note worth repeating from the code: the voucher is not assigned to
the recipient until they open the link and sign in, because `vouchers.user_id`
is NOT NULL and the recipient usually has no account.

## Gift cards to the wallet are NOT built, and that is a decision

`product_type` in production is `coupon, physical, service, recurring`. There is
no `gift_card`, and adding one is not a wiring job:

- `ALTER TYPE ... ADD VALUE` must be its own migration and cannot be referenced
  in the transaction that adds it — the split 135 and 181 were both forced into;
- `finalizeOrder` needs a branch that credits `wallet_entries`, which is
  append-only and on the money path;
- the amount is chosen by the buyer, so the product is a price the customer
  types, which nothing in the catalogue model supports;
- and the recipient of a wallet credit must have an account, unlike a gift
  voucher, so the whole claim flow is different from the one that exists.

That is a feature with a design, on the money path, for which there is no
product in the catalogue and no request from an operator. **The thing customers
actually ask for — buy this specific coupon for somebody else, with a message —
is built and applied.** A gift card is the generic version of it and it is
listed here as absent rather than half-built.

## What was missing: a price with a time on it

`discount_campaigns` schedules a **code**. Nothing scheduled a **price**. A
flash deal is not a code somebody types; it is the product costing less between
two o'clock and six, on the page, for everybody — and the only way to run one
was an operator editing `kenyon_price` twice and remembering to come back.

`scheduled_price_changes` (201) and `/api/cron/price-schedule` are that.

### The interesting part is what it does not need to do

A scheduler that moves prices on a timer, over a catalogue where 15 of 44
products already advertise a struck-through price nobody can evidence
(`docs/PRICING-COMPLIANCE.md`), reads like a machine for manufacturing
non-compliant discounts.

It is not, and the reason is that **193 governs the claim rather than the
price**. Israeli law constrains the "before" price, not the price; lowering is
always lawful. What a flash deal changes is the *evidence* — after a day at ₪99
a `full_price` of ₪150 stops being defensible for thirty days — and
`checkReferencePrice` works that out on its own, with the storefront dropping
the strike-through and nobody deciding anything.

**So the scheduler's whole duty to compliance is one line: every applied change
writes a `price_history` row with `source = 'change'`.** That is the column 193
created for exactly this and left unused, and it closes the sampling gap 193
documented — until now the record was one observation a day at 04:00, so a flash
deal that opened at 10:00 and closed at 18:00 left no trace at all, and the
thirty-day "lowest price charged" would have been computed from a window that
never saw it.

A second refusal in the cron would be a second opinion about the same rule.

### The rest of the design

**A due row in the past is still due.** `effective_at <= now()`, not a window,
so a missed run catches up. A flash deal nobody ran is a promise on a marketing
email the site did not keep, and the customer arriving to find the old price
does not know a cron failed.

**Every five minutes, and the granularity is the feature.** A deal scheduled for
14:00 that started at 15:00 is not the deal that was advertised.

**The cache is invalidated or the deal is invisible.** The catalogue is cached
for an hour under `CATALOGUE_TAG`; a two-hour deal that did not invalidate would
be live for the half of its window nobody could see. `revalidateTag(tag,
'hours')` and not `updateTag` — the latter is Server-Action only, so the deal is
visible from the first request after the cron rather than from the instant of
the change. Seconds, not an hour, and that is the honest description.

**Agorot are written as a decimal string.** `products.kenyon_price` is numeric
and its `_agorot` twin is generated, so the shekel column is the only way in.
`toFixed(2)` over an integer count of agorot is exact; a JavaScript number would
be serialised through a float, which CLAUDE.md forbids on the money path.

**A failure records itself and stays unapplied**, so the next run retries it. A
failure that marked itself applied would drop the deal silently.

**Two rows at the same instant are refused.** Two prices with no rule for which
wins is a coin toss over what a customer is charged. A *cancelled* row frees its
slot, because the unique index is partial.

**Cancelled, never deleted.** "We were going to run this and pulled it" belongs
next to the deal that did run, and a deleted row cannot be told from one that
never existed.

**The schedule is not public.** A list of future prices is the most valuable
thing a competitor could read off this database, and it would let a shopper wait
for a drop they can see coming. RESTRICTIVE deny, the 172 shape.

**The admin page shows applied and cancelled rows too.** The question an
operator opens it with is usually "why is this product ₪99", and a list of the
future cannot answer it.

**A "before" price at or below the new price is refused at the form**, rather
than left to the storefront's compliance check — that check can only *suppress*
the claim after the fact, and the operator would never learn they had typed it.

## Files

| | |
| --- | --- |
| `migrations/pending/201_scheduled_price_changes.sql` | the schedule. Not applied. |
| `src/app/api/cron/price-schedule/route.ts` | applies it, and writes the history row |
| `src/server/actions/admin/flash-deals.ts` | schedule and cancel, audited |
| `src/app/(admin)/admin/flash-deals/` | the list and the form |
| `src/lib/growth/discount.ts` | the promo engine (existing) |
| `migrations/pending/194_discount_claim_caps.sql` | the caps that were decoration. Not applied. |
| `src/server/payments/gift-vouchers.ts` | buy-as-gift (existing, applied) |
