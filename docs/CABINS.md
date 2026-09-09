# Cabins

Cabin booking: units, nightly rates, holds, and a constraint that makes
double-booking impossible. Section 92.

**The feature flag is off.** `213_cabins_phase2.sql` seeds `phase_config.cabin`
disabled, so the type is not listed, not purchasable and its product pages 404.
See `docs/PRODUCT-PHASES.md`.

## The one constraint that matters

```sql
EXCLUDE USING gist (unit_id WITH =, stay WITH &&) WHERE (status <> 'cancelled')
```

Every other way of preventing a double booking is application code: read the
calendar, decide it is free, write the row. **Two requests that read before
either writes both decide it is free, and both write.** That race is not
theoretical for a cabin - it is what a popular weekend is.

The constraint makes it impossible in the database. Two overlapping stays for
one unit cannot both exist, whatever the application believes and however many
servers are running.

`btree_gist` is what lets `unit_id WITH =` sit beside a range in one constraint;
gist has no default operator class for uuid equality without it. It is available
on this database and not installed, and installing and rolling it back was part
of the probe.

### Adjacency

`daterange` is half-open. `[2026-10-01, 2026-10-05)` is four nights ending on
the morning of the 5th, and `[2026-10-05, 2026-10-09)` starts that same morning.
**They do not overlap and they must not** - otherwise checkout day is unbookable
and a cabin loses a night between every pair of guests.

The same convention runs all the way out: `nightsBetween` returns check-in
inclusive and check-out exclusive, and the iCal feed publishes `DTEND` exclusive,
so a stay needs no arithmetic anywhere between the database and a guest's phone.

### Empty ranges

`NOT isempty(stay)` is not tidiness. **An empty range overlaps nothing**, so a
zero-night booking would slip past the exclusion constraint entirely and sit in
the table blocking nothing and meaning nothing.

## Holds

A checkout in progress is a `held` row with `held_until`. It blocks its dates
exactly as a confirmed booking does, which is the point: [92] asks for a
15-minute hold so two guests cannot pay for the same weekend.

**A hold with no expiry is refused by a CHECK**, because it would block a
weekend forever after one abandoned checkout.

`release_expired_cabin_holds()` cancels them. It is a **function and not a view
filter**, and that distinction is load-bearing: the exclusion constraint has no
notion of time, so a `held` row blocks until something changes its status.
Filtering expired holds out of the availability read would show the dates as
free and then fail the insert against the constraint - **a booking that looks
available and cannot be made**. The probe asserts exactly that: an expired hold
still blocks until the sweep runs.

Cancelled rather than deleted, so an operator asking "why did this weekend show
as taken at 14:05" has a row to look at.

## Pricing

Per night, resolved in this order:

1. **A dated range** wins over everything, including a holiday. A season price
   is the operator saying "in this window, this is the price"; if they wanted
   the holiday rate inside it they would not have set the range. The most
   specific statement wins, which is the only ordering that lets an operator
   override anything.
2. **Holiday** beats weekend. Most Jewish holidays fall on a Friday at least
   once, and pricing one as an ordinary weekend is the mistake this ordering
   prevents.
3. **Weekend** is Friday and Saturday.
4. **Base**, which every unit must have. `NOT NULL` and `> 0`: a unit with no
   price is a unit that can be booked for nothing.

A missing weekend or holiday price falls through to the base. That is not a gap;
it is an operator who has not distinguished them.

### Holiday dates are a table, not a constant

The Israeli weekend is computable and does not move. **Jewish holidays do**:
they follow a lunisolar calendar, fall on different Gregorian dates every year,
and several have an eve priced like the holiday and a day after that is not.

Hard-coding a list would be writing dates this file cannot verify - the rule
`content/about.ts` states for prose, and worse in a price. `cabin_holidays` is a
table the operator fills.

An empty table prices holidays as ordinary days: **visibly wrong, and wrong in
the direction of charging less**, rather than silently wrong on a date nobody
checked.

### Dates are strings and the arithmetic is UTC

`new Date('2026-10-02')` parses as UTC midnight, and in a runtime whose local
zone is behind UTC that is the evening of the 1st - so `getDay()` returns the
wrong weekday and **a Friday is priced as a Thursday**.

The server runs in UTC on Vercel and in Asia/Jerusalem on a developer machine,
which is exactly the pair that makes the bug appear on one and not the other. So
every function takes and returns `YYYY-MM-DD` and every step goes through
`Date.UTC`, and a test pins it under two time zones.

## Availability, and what a stranger sees

**Bookings are not publicly readable.** A guest must see that a weekend is taken
or the calendar is useless, but who took it, for how much and with how many
guests is nobody else's business.

`v_cabin_availability` is `security_invoker = false` and exposes three columns:
unit, dates, status. It is the one thing that shows a stranger the dates are
taken, and it can only do that by seeing rows the querying role cannot - so what
it exposes is deliberately three columns with no person, no price and no guest
count.

## The iCal feed

For a supplier who runs their own bookings elsewhere.

**It publishes dates and nothing else.** An iCal URL is a bearer token in a
query string: it gets pasted into Google Calendar, forwarded, and sometimes
indexed. The feed carries the unit, the dates, and the word "booked" - no guest
name, no price, no guest count, no order id. A test asserts the only `@` in the
whole feed is the UID's own domain suffix.

CRLF everywhere and 75-octet folding, because RFC 5545 requires both and readers
do reject feeds without them - Google Calendar among them. Both are the kind of
thing that works in every test written by hand and fails on the one calendar
that matters, so the tests check the bytes.

`METHOD:PUBLISH`, not `REQUEST`: this is a feed to read, and a supplier's
calendar must not treat it as an invitation it can accept or decline. A held
booking is `TENTATIVE` so a supplier can tell it apart from a paid one.

## Cancellation

`free_cancellation_days` defaults to 14 and has a **floor of 7 in a CHECK**.

The Israeli Consumer Protection Law's distance-selling rules give 14 days from
the transaction, and for accommodation the cancellation must reach the supplier
at least 7 days (not counting rest days) before the service date. A supplier may
widen the window; the constraint stops them narrowing it below the statutory
floor.

`withinFreeCancellation` compares **calendar dates, not instants**: "14 days
before" is a date, and comparing timestamps would make the answer depend on the
hour somebody clicked. The boundary is inclusive, because a rule a customer
reads as "up to 14 days before" has to include the fourteenth.

## What was not done

**No booking UI and no supplier calendar console.** The phase flag is off and
there are zero cabin products, so both would be screens nothing can reach. The
schema, the exclusion constraint, the pricing rules, the hold sweep and the iCal
builder are what those screens need.

**No cron entry for `release_expired_cabin_holds`.** The function exists and is
tested; scheduling it belongs with the other cron work, and until a cabin exists
there is nothing to sweep. Until then an expired hold blocks its dates, which is
the safe direction.

**No payment integration for a stay.** A booking carries `order_id` and the
checkout path does not create one yet. That is the next piece, and it needs the
hold and the order to be created in one transaction - which is why the column is
there and nullable rather than absent.

**No multi-unit auto-assignment.** A guest picks a unit. Choosing one for them
across a six-unit property is an optimisation that changes which nights are
bookable, and it should be a deliberate feature rather than a side effect.
