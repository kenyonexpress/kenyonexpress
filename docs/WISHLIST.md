# Wishlist: the shop knew both facts and said nothing

Measured 2026-09-09 against production (`ixvwfbuvfxxsjiywhbbb`). `wishlists`
holds **0 rows**, so everything below is inert until somebody saves something.

154 shipped the table and SECTIONS 24 shipped the rest of it well: the heart on
every card, a guest list in `localStorage` that merges on login, a cap of 100
that **refuses rather than evicting** (a list the customer curated does not lose
its oldest entry somewhere they cannot see), an optimistic toggle whose rollback
is against the *current* set rather than a pre-request snapshot, and a
move-to-cart that adds before it removes.

None of it **tells anybody anything.** A saved product that gets cheaper, or
comes back into stock, is the entire reason a shopper saved it — and the shop
knew both facts and said nothing.

## Both alerts are decisions, not new data

Neither of these needed a crawler, a job queue or an integration. The data
arrived in the two migrations before this one:

| | |
| --- | --- |
| `price_history` (193) | one row per product per day. A price drop is a comparison between two of its rows. |
| `stock_waitlist` (195) | who asked to be told when a product returns. |

`/api/cron/wishlist-alerts` only decides who to tell.

## The price-drop rule, and why both bounds

Compared against **the price on the day it was saved**, not against yesterday.
"It is cheaper than when you saved it" is a sentence the customer can act on;
"cheaper than yesterday" is about a price they never saw. It also keeps the
alert stable — a product that drifts down over three weeks produces one useful
mail instead of fifteen tiny ones.

**5% and ₪5, both, not either.** A percentage alone is wrong at the bottom of
the catalogue: 5% of a ₪9 massage is 45 agorot, and "the price dropped!" about
45 agorot is the mail that teaches somebody to ignore us. An absolute alone is
wrong at the top: ₪5 off a ₪1,600 campaign is not news.

The thresholds were chosen against the **direction of the mistake** rather than
from data, because there is none — `wishlists` is empty. Too low and the alert
becomes noise and the ones that matter stop being read; too high and a genuine
sale goes unsaid.

**Basis points are floored**, so a drop cannot round its way past the bar.

**A missing baseline is `no_history`, not a fallback.** `price_history` starts
the day 193 is applied, so a product saved before that has no recorded price.
Falling back to today's price would compare a number with itself; falling back
to `full_price` would compare against a claim `docs/PRICING-COMPLIANCE.md` shows
nobody can evidence.

**The dedupe key carries the new price and no date.** A product that sits at the
lower price for a month produces one mail, not thirty — so no date. A product
that drops again produces a second — so not just the pair. The consequence,
stated because it is real: a price that drops, returns, and drops again to the
*same* figure will not mail twice. That is the right trade; the second mail
would say exactly what the first said.

## It enqueues, it does not send

Every alert goes into `notification_outbox` with a dedupe key and
`/api/cron/notifications` drains it — same retry, same backoff, same
idempotency as every other notification.

That is deliberate, and the alternative is already in the codebase: the
abandoned-cart nudge calls `sendEmail` directly with its own nudges table, so
"what has this system mailed" is a two-table question (`docs/EMAILS.md`).
Adding a third would make it three.

## Ahead of its migration, visibly

200 adds the two `kind` values, and the cron ships before it. Until 200 is
applied every enqueue fails with `23514`, the route reads that code as "the kind
is not accepted yet", reports it **once per run**, and returns 200.

`src/lib/email/outbox-kinds.test.ts` gained a third category for this, and the
assertion under it is what stops the category becoming an excuse list: **every
ahead-of-its-migration kind must have a caller that handles `23514`.** That is
the difference between shipped-ahead and shipped-broken — the first sends
nothing and says so, the second throws in a cron at five in the morning.

The gate has a real limit, named there rather than left to be rediscovered:
`order_shipped` was in the same state before 183 and never appeared, because its
enqueuer is a database trigger and the scan only reads `src`.

## The schedule, and why 05:00

`0 5 * * *`, an hour after `price-snapshot` at `0 4 * * *`. **The order is the
point:** the price-drop comparison reads today's row out of `price_history`, and
running first would compare today against a day nobody has recorded yet —
producing nothing and reporting success.

## All three of these migrations are APPLIED, and this section said otherwise

**Corrected 2026-09-09.** 193, 195 and 200 were all filed in
`migrations/pending/` and all three are live in production:

| Migration | Evidence read from production |
|---|---|
| 193 | `price_history` exists with all eight declared columns, RLS on, 3 indexes |
| 195 | `stock_waitlist` exists with all seven declared columns, RLS on, 3 indexes |
| 200 | `notification_outbox_kind_check` carries exactly the 16 names it specifies |

All three have been moved to `migrations/applied/`. **200 must not be
re-applied**, and will refuse: its opening `DO` block raises when the live
constraint carries a name it does not restate, and the live constraint now
carries the two names 200 itself added.

The tolerance described below is still real and still worth keeping, because it
is what let the feature ship before the tables existed. It is no longer the
situation:

```json
{ "priceDrops": { "sent": 0, "skipped": "price_history absent (193)" },
  "restocks":   { "sent": 0, "skipped": "stock_waitlist absent (195)" } }
```

A cron that 500s nightly because a migration is unapproved teaches everybody to
ignore it.

**`notified_at` is set only after the enqueue succeeded.** Marking first loses a
mail on any error; never marking sends it on every run forever.

**A failed profile read abandons the run rather than sending to whoever it could
read.** An unread error there renders as "nobody has an email address", which is
a silent run of zero alerts reporting success — the shape
`discarded-read-inventory.test.ts` exists to catch, and it caught this one.

## What was already there

**The deal-ending countdown** exists in `ProductInfo` and `DealsSection`, tied
to a real `offer_valid_until` rather than a rolling timer — the same rule that
keeps urgency claims substantiable under Israeli consumer law.

**The guest list and the merge on login** are SECTIONS 24's, and the merge is
browser-initiated of necessity: a guest list is `localStorage`, which no route
handler can read.

## What is not done

**Recently viewed.** Not built, and a table would be the wrong first move: a
server-side history of what somebody browsed is a behavioural record with a
retention question and a subject-access question attached, for a feature whose
whole value is a strip of four thumbnails. It belongs in `localStorage`, beside
the guest wishlist that already lives there, and it is worth building when
anything on the site has enough traffic for the strip to be non-empty.

**The shareable list link.** It needs a public token on a private list — every
saved product, readable by anyone holding a URL, forever, with no way to tell
who has it. That is a privacy design and not a feature flag: it needs an
expiry, a revoke, and a decision about whether the list owner's name travels
with it. Not built for a table with zero rows.

## Files

| | |
| --- | --- |
| `src/lib/wishlist/alerts.ts` | the two rules, pure |
| `src/lib/wishlist/alerts.test.ts` | 8 cases, including both threshold edges |
| `src/app/api/cron/wishlist-alerts/route.ts` | who to tell |
| `migrations/applied/200_wishlist_alert_kinds.sql` | the two kinds, and the guard. Applied. |
| `src/lib/email/notifications.ts` | `buildPriceDropEmail`, `buildBackInStockEmail` |
| `src/lib/email/previews.ts` | both, visible at `/dev/emails` |
