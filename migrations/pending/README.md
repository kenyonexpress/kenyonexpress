# `migrations/pending/`

## 2026-09-09: 223 WRITTEN, not applied - the column that gives the bell a writer

`223_notifications_outbox_link.sql`. One nullable column and one unique index.

**198 shipped a notification centre with no writer.** The table, its RLS, both
indexes, `REPLICA IDENTITY FULL` and membership of `supabase_realtime` are all
in production, the bell reads it, the realtime subscription is live - and the
only statements against `notifications` anywhere in the repository were two
SELECTs and an UPDATE of `read_at`. It was a finished feature that was empty by
construction.

The fix is a fourth leg on the outbox drain, beside email, push and WhatsApp,
and `outbox_id` is the one piece of schema it needs: `ON CONFLICT DO NOTHING`
on a unique column makes the fan-out idempotent at the database, so a row seen
again because its OTHER leg is still pending cannot notify twice.

**Not an `in_app_status` column mirroring `push_status`.** A push is an attempt
against a remote service and needs a state machine; an in-app row is a local
INSERT, so the ROW is the state, and a column tracking whether the row exists is
one fact stored twice.

**The index is not partial, and the first draft's was.** The probe rejected it
with `42P10`: an inference-based `ON CONFLICT` only matches a partial index if
it repeats the predicate, so every writer forever would have had to remember
`where outbox_id is not null` or take a runtime error. Postgres already treats
NULLs as distinct in a unique index.

`ON DELETE SET NULL` and not CASCADE: the queue is operational plumbing and may
be pruned, and a customer's notification history must not disappear because
somebody tidied it.

## 2026-09-09: 221 + 222 WRITTEN, not applied - the rating cache and helpful votes

`221_review_rating_cache.sql`, `222_review_helpful_votes.sql`. Both for
`SECTIONS 25`, and both are counters maintained by a trigger.

**221 fixes a defect that has not happened yet.** `getRatingSummaries` folds
every approved review in TypeScript with no `.limit()`, so it inherits
PostgREST's row ceiling: past it, the average is computed over whichever rows
came back, keeps its one decimal place, and is simply wrong with nothing
raising. `rating_sum` + `rating_count` on `products`, not a stored average,
because only sum and count can be updated from a delta - a stored average would
force the trigger to rescan, which is the cost the cache exists to remove.

The two transitions a naive trigger misses are the only two that will ever
happen here: every review arrives `pending`, so approval is an UPDATE of
`status` rather than an INSERT, and 185 made removal a soft delete rather than
a DELETE. Both probed.

**222 is one row per person per review, keyed `(review_id, user_id)`.** The
primary key IS the anti-abuse design; a rate limit slows a second vote down and
a key makes it impossible, which the probe confirms. Votes are readable only by
the voter: who found what helpful is a behavioural trace, and publishing it
would let anyone profile any customer straight off the catalogue.

Both functions are `SECURITY DEFINER` with an empty `search_path`, because the
writer is a customer who holds no UPDATE on `products` and, since 199, holds
UPDATE on `reviews` only for the three `supplier_reply` columns. Neither trigger
widens that.

## 2026-09-09: THIS DIRECTORY OVERSTATES WHAT IS OUTSTANDING. Read this first.

Three files were moved to `migrations/applied/` today (193, 195, 200) because
production already had them, column for column. They were found while doing
`SECTIONS 24`, not while looking for them, which is the worrying part: nobody
was checking.

**Four more are very likely in the same state, and one is worse.** Every table
each remaining pending file declares was tested with `to_regclass` against
production on 2026-09-09:

| File | Tables it declares | In production |
|---|---|---|
| `197_shipping_zones_and_pickup.sql` | `shipping_zones`, `pickup_points` | **both exist** |
| `198_in_app_notifications.sql` | `notifications`, `notification_preferences` | **both exist** |
| `199_review_replies_and_reports.sql` | `review_reports` | **exists** |
| `201_scheduled_price_changes.sql` | `scheduled_price_changes` | **exists** |
| `207_email_deliverability.sql` | `email_suppressions`, `email_events_daily` | **`email_suppressions` exists, `email_events_daily` does NOT** |

**207 is the one that matters.** A file that is half in production is not a
filing error, it is a migration that stopped in the middle or was applied by
hand in pieces, and it will not tell you which. Anything reading
`email_events_daily` gets `42P01` today while the suppression list works, so the
failure looks like a code bug rather than a schema gap.

**These four were NOT moved, deliberately.** Existence of a table is not proof
that a file applied: it does not check columns, constraints, RLS, policies,
grants or indexes, and moving on that evidence is the same mistake that put 193,
195 and 200 in the wrong directory in the first place. Each needs the
column-for-column comparison that 193 and 195 got before it moves.

The remaining files below this line were not tested this way beyond the table
existence above.

## 2026-09-09: 220 WRITTEN, not applied - the one search_path warning 209 misses

`220_wallet_entries_search_path.sql`. One `ALTER FUNCTION`.

**Why it is not an edit to 209.** `209_advisor_warnings.sql` pins three
functions and says "3 WARN -> 0". Read out of production the same day, all
three already carry `proconfig = {search_path=public}`:

    set_updated_at()
    fn_cashback_ledger_block_mutation()
    fn_il_phone_digits(text)

The advisor does not warn on any of them. The function it does still name,
`fn_wallet_entries_block_mutation`, appears in no pending file at all, so
applying 209 as written leaves `function_search_path_mutable` at 1 rather than
0. This file is additive: 209 is another session's, and its `auth_rls_initplan`
and reasoning sections are correct.

**What the function is.** The append-only guard on `wallet_entries` - it raises
on every UPDATE and DELETE so a balance can only be corrected by posting a
compensating transfer. It is money, which is why it is worth pinning even though
`prosecdef = false` makes this defence in depth rather than a live hole. The
body is a single unconditional `RAISE` that qualifies no object, so an empty
search_path cannot change its behaviour.

**`ALTER`, not `CREATE OR REPLACE`**, because replacing a function resets its
grants and this one is attached to triggers on `wallet_entries`.

## 2026-09-09: 219 WRITTEN, not applied - the cost ledger, because nothing can fetch a bill

`219_infra_costs.sql`. `infra_costs` and `infra_budgets`.

**Why a table rather than four API clients.** Measured the same day: NOT ONE
billing credential exists in this project. No Vercel token (and no project link
either), no Supabase management token, no Upstash MANAGEMENT key, no Cloudflare
token. `src/lib/costs/providers.ts` names the exact variable each would need.
So the manual figure is the working path, not a fallback, and it has to persist
somewhere an operator can correct it. An API pull later writes the same rows
with `source = 'api'`, and the two stay distinguishable because a typed figure
is a recollection and a fetched one is a measurement.

**`amount_micro`, not agorot** - the same argued exception as 216: vendor costs
in USD quoted to five decimal places, where agorot would need an FX rate the row
does not have and would round a $0.0075 unit to 1 agora. The integer half of the
rule is not relaxed and the file refuses to apply if the column is not an
integer type.

**`month` is a `date` CHECKed to the first of a month**, not a text `'2026-09'`.
A text month cannot be compared, ordered or windowed without parsing, and every
reader would parse it slightly differently; the CHECK is what stops it drifting
into "the day somebody entered the figure".

**The uniqueness includes `kind`**, and that is the one that matters. One
provider legitimately carries both a subscription and usage - a Vercel Pro seat
is fixed and its bandwidth overage is not - and collapsing them would make the
month-end projection extrapolate a subscription, which on day 3 says the month
will cost ten times the bill.

**Admin-only in both directions.** What the platform pays is the cost side of
every margin the shop makes; a supplier or a customer reading it learns what the
operator can afford. There is no self-read to write because these rows belong to
nobody.

**Verified against production without applying**, in a rolled-back `DO` block: a
mid-month date was refused, a second row for the same provider/month/kind was
refused (it would silently double the month), an unknown provider and a negative
cost were refused, fixed and variable coexist for one provider, and `anon` could
not read while `authenticated` could not write.

## 2026-09-09: 218 WRITTEN, not applied - a trigger that fails every customer profile save, and the money column it accidentally guards

`218_profile_trigger_and_wallet_grant.sql`. **Found while writing 217, not
looked for.** 217 adds columns to `profiles`, so "can a customer write their own
columns here" had to be answered. The answer was about two other things.

**(1) `enforce_profile_privilege_columns` names a column that does not exist.**
Its last check is `NEW.supplier_id IS DISTINCT FROM OLD.supplier_id`, and
`public.profiles` has no `supplier_id` -- thirteen columns, read from
`information_schema`. PL/pgSQL resolves field references at RUN TIME, so the
function was created without complaint and raises `42703` the first time it
reaches that line. The admin and service-role branches return before it, so the
only callers that get there are **ordinary customers updating their own row**.

**This is live.** `src/server/actions/account.ts:58` saves the account details
form with the request-scoped client, so every customer editing their name or
phone gets 42703 and sees `שמירת הפרטים נכשלה` -- a generic message that makes
the cause undiagnosable from the UI. Proven by impersonating a real customer
row (`set_config('request.jwt.claims', ...)` + `SET LOCAL ROLE authenticated`)
inside a transaction that was rolled back.

**(2) That crash is the only thing stopping a customer minting store credit.**
`profiles_update_unified` is `USING (id = auth.uid())`, and an RLS policy is a
ROW filter with no opinion about columns. `authenticated` holds UPDATE on the
whole table. `wallet_balance_agorot` is generated and cannot be written, but it
is generated FROM `wallet_balance`, which can. The trigger guards `role` and
does not mention the wallet. So **fixing (1) alone would open (2)**, which is
why they are one file and must not be separated.

**(3) And the obvious fix does not work.** The first draft said
`REVOKE UPDATE (wallet_balance) ON public.profiles FROM authenticated`. Probed
against production: **the wallet write still succeeded**, balance 9999.00. A
column-level REVOKE cannot subtract from a TABLE-level grant --
`pg_class.relacl` carries `authenticated=arwdxtm/postgres` and
`pg_attribute.attacl` is empty. `information_schema.column_privileges` hides
this perfectly by reporting a table grant expanded into one row per column, so
the draft's own verification passed while protecting nothing. The file now
revokes the table grant and grants back exactly `(full_name, phone)`, which is
measured: `account.ts:58` is the only request-scoped write to `profiles` in
`src`.

**Re-probed after correction**, one rolled-back block: the customer saved their
name, the wallet write was refused, and role escalation was refused by the
guard rather than by a crash. Production re-read afterwards: name null, wallet
0.00, ACL unchanged, trigger still broken. Nothing applied.

## 2026-09-09: 217 WRITTEN, not applied - what `profiles.phone` does not mean

`217_profiles_phone_verified.sql`. `phone_verified_at` and
`phone_verified_e164`.

**`profiles.phone` already exists and says nothing about possession.** It holds
whatever a signup form was given: a typo, somebody else's number, or a
deliberate one. `phone_verified_at` is the moment an SMS code sent to that
number was entered correctly, and nothing else.

**A timestamp and a second column, not a boolean.** A boolean cannot say WHEN
(a number verified two years ago is a different fact to a fraud review), cannot
say WHICH NUMBER (changing `phone` would silently transfer the proof), and
cannot say NOTHING (NULL is "never verified", which every existing row is).

**It issues no grant and refuses to apply before 218.** See 218 for why: the
UPDATE grant on `profiles` is table-level and therefore covers columns that do
not exist yet, so these two would have been customer-writable the moment they
were created -- a possession proof forgeable by its own subject. A column-level
REVOKE here would have been a silent no-op, and its verification would have
passed.

**Verified against production without applying**, in a rolled-back block with
218 applied first: the columns are not customer-writable, a timestamp with no
number is refused, a non-E.164 number is refused, an Israeli landline is refused
as a verified mobile, a real verification writes cleanly under the service role,
and a customer impersonated through PostgREST could not forge one.

## 2026-09-09: 216 WRITTEN, not applied - the SMS log, and a deliberate exception to the money rule

`216_sms_log_and_opt_outs.sql`. Two tables: what was sent and what it cost, and
who told us to stop.

**THE PRICE COLUMN IS NOT AGOROT, AND THAT IS THE EXCEPTION.** The standing rule
is money = agorot, integer. Twilio bills in USD, as a negative decimal string
with five places (`-0.00750`). Storing that as agorot needs two things that are
both wrong: a USD/ILS rate applied at write time, frozen at the moment of a text
message and unauditable afterwards; and a rounding that turns $0.0075 into 1
agora, a 30% error on the unit price multiplied by every message ever sent. So
it is `price_micro` (bigint, millionths) plus `price_currency`, with a CHECK
that they are both present or both absent. It is a VENDOR COST, not the customer
money path: nothing here is charged to anybody and `src/lib/money.ts` is
untouched. The integer half of the rule is not relaxed and the file's own
verification block refuses to apply if the column is not an integer type.

**Hebrew is why cost is measured per message at all.** Hebrew is outside GSM
03.38, so every body switches the whole message to UCS-2, where a segment is 70
characters and 67 per part of a multipart -- not 160. A 140-character
notification reads as "well under the limit" and is billed as THREE. A Hebrew
SMS programme costs two to three times a per-message estimate, and the
difference is invisible until the invoice.

**The opt-out list is keyed by PHONE, not by user.** An opt-out is a property of
a handset: the same number may be on two accounts, and a customer who says stop
means stop to that phone. `user_id` is recorded for support and is deliberately
not the uniqueness. `sms_opt_outs` gets NO read policy at all -- it is keyed by
phone number, so a self-read would have to compare a session against a column
anyone can guess, and the only useful query against it is exactly the
enumeration oracle not to build.

**Verified against production without applying**, in rolled-back `DO` blocks.
Refused, each with a check violation: an Israeli LANDLINE (Twilio accepts and
bills an SMS there and delivers it nowhere), a non-E.164 number, a negative
price, a price with no currency, a currency with no price, a lowercase currency
code, and a duplicate `provider_sid` (the status callback fires several times
per message and must update rather than insert). Grants confirmed: `anon` cannot
read the log, `authenticated` cannot insert into it, and nobody but the service
role can read `sms_opt_outs`.

Order: independent of everything else pending.

## 2026-09-09: 215 WRITTEN, not applied - the delivery log, and the column that is deliberately not in it

`215_push_deliveries.sql`. One row per push attempt per device.

**Why a second log when the outbox already has five push columns.** Those five
describe ONE notification's push leg, which is the right shape for a retry loop
and the wrong shape for the question an operator asks: "why did this customer
stop getting notifications". A customer has several browsers and they fail
independently - the phone whose data was cleared answers 410 forever while the
desktop works - and the outbox collapses all of them into one `push_error`.

**THE ENDPOINT IS A BEARER CAPABILITY AND IS NOT LOGGED.**
`push_subscriptions.endpoint` is a URL anyone holding it can push to, with no
authentication beyond a VAPID signature they can mint themselves. A delivery log
is the most-read, least-guarded table in any system: it gets pasted into support
tickets, exported to spreadsheets and joined into dashboards. `endpoint_host` is
stored instead - which push service is failing is what triage needs, and it is
not a credential. The file's own verification block REFUSES TO APPLY if a column
named `endpoint` exists.

**`subscription_id` is not a foreign key, on purpose.** A 410 means the
subscription is dead forever and the sender deletes the row. A foreign key would
take the log entry with it under CASCADE or block the delete under RESTRICT, and
that entry is precisely the record explaining why the subscription is gone.

**Verified against production without applying**, in one rolled-back `DO` block:
the table, both indexes, RLS, the revokes and both policies were created; a log
row for a subscription that does not exist was inserted and kept; an unknown
`transport`, an unknown `outcome` and a status of 9999 were each refused with a
check violation; `anon` had no SELECT and `authenticated` had no INSERT while
having SELECT. Re-read afterwards: the table does not exist.

Order: independent of everything else pending. It creates one table and touches
nothing existing.

## 2026-09-09: 214 WRITTEN, not applied, and reading the constraint corrected this file

`214_settlement_gap_kind.sql`. One notification kind, `settlement_gap`, so
`/api/cron/settlement-reconcile` can reach a human.

**It cannot share `reconciliation_gap`.** The outbox dedupes on
`admin:<kind>:<day>`. Both jobs run within twenty minutes of each other, so one
kind for two jobs means whichever enqueued second is swallowed as a duplicate -
and silence is the exact thing both of them exist to prevent.

**200 IS APPLIED, AND THIS FILE SAID IT WAS NOT.** `pg_get_constraintdef` on
2026-09-09 returned sixteen kinds including `price_drop` and `back_in_stock`,
which are 200's two. Nothing in the repository recorded the application. The
entry below still says "200 WRITTEN, not applied" as it was written; this
paragraph is the correction rather than an edit, because a manifest that
silently rewrites its own history is a manifest nobody can date.

Two other places were wrong the same way and are fixed in the same commit:
`src/lib/email/outbox-kinds.test.ts` listed both kinds as rejected by the live
constraint, and the wishlist alert path was believed to be degrading to 23514
when it has in fact been able to send.

**DO NOT APPLY 200.** Its guard refuses any live name it does not restate, and
the live constraint now carries the two names 200 itself added - so it raises
rather than dropping anything. 214 carries all sixteen forward plus its own.

**Verified against production without applying**, with one rolled-back `DO`
block: the guard passed against the live sixteen, the constraint was dropped and
recreated at seventeen, `fn_enqueue_notification('settlement_gap', ...)` landed
a row, an unknown kind was still refused with 23514, and the block ended in an
unconditional `RAISE`. Re-read afterwards: sixteen kinds, zero outbox rows.
Nothing left behind.

Order: independent of everything else pending, except that it must be applied
AFTER any file that restates `notification_outbox_kind_check`. Today there is
one such file, 200, and it must not be applied at all.

## 2026-09-09: 213 WRITTEN, not applied, and one constraint is the whole design

`213_cabins_phase2.sql`.

**The exclusion constraint is the point.** Every other way of preventing a
double booking is application code: read the calendar, decide it is free, write
the row. Two requests that read before either writes both decide it is free, and
both write. That race is not theoretical for a cabin - **it is what a popular
weekend is.**

```
EXCLUDE USING gist (unit_id WITH =, stay WITH &&) WHERE (status <> 'cancelled')
```

Two overlapping stays for one unit cannot both exist, whatever the application
believes and however many servers are running.

**Adjacency is the case worth naming.** `daterange` is half-open:
`[2026-10-01, 2026-10-05)` is four nights ending on the morning of the 5th, and
`[2026-10-05, 2026-10-09)` starts that same morning. They do not overlap and
they must not - otherwise checkout day is unbookable and a cabin loses a night
between every pair of guests.

**`btree_gist` is available and not installed.** It is what lets `unit_id WITH =`
sit beside a range in one constraint; gist has no default operator class for
uuid equality without it. Installing and rolling it back was part of the probe.

**Holiday dates are a table, not a constant.** [92] asks for weekday, weekend and
Israeli holiday pricing. The weekend is computable - Friday and Saturday, and
that does not move. Jewish holidays do: lunisolar calendar, different Gregorian
dates every year, several with an eve priced like the holiday and a day after
that is not. Hard-coding a list would be writing dates this file cannot verify,
and a wrong date is a wrong price on the busiest night of the year. An empty
`cabin_holidays` prices holidays as ordinary days - visibly wrong, and wrong in
the direction of charging less, rather than silently wrong on a date nobody
checked.

**Bookings are not publicly readable and availability is.** A guest must see
that a weekend is taken or the calendar is useless, but who took it, for how
much and with how many guests is nobody else's business. `v_cabin_availability`
exposes three columns - unit, dates, status - and nothing else.

**`free_cancellation_days` has a floor of 7 in a CHECK.** The Israeli Consumer
Protection Law's distance-selling rules give 14 days from the transaction, and
for accommodation the cancellation must reach the supplier at least 7 days
(excluding rest days) before the service date. A supplier may widen the window;
the constraint stops them narrowing it below the statutory floor.

**Verified against production without applying.** An overlapping booking is
refused with `exclusion_violation`, an adjacent one is accepted, a zero-night
stay is refused - an empty range overlaps nothing, so without
`NOT isempty(stay)` it would slip past the constraint entirely - a hold with no
expiry is refused, an expired hold **still blocks until the sweep runs** and
then does not, a cancellation frees its dates immediately, a range rate with no
dates and a second weekend price are both refused, the cancellation window
cannot be narrowed below 7 days, and under `SET ROLE anon` the client could read
the availability view and not the bookings table. Re-read afterwards: no tables,
no view, and `btree_gist` not installed.

Order: after 210, which creates `phase_config`.


## 2026-09-09: 212 WRITTEN, not applied, and the probe corrected it twice

`212_courses_phase2.sql`.

**Two transactions, and the reason is measured.** `ALTER TYPE ... ADD VALUE` was
probed inside a `DO` block that ended in a `RAISE`. It was **accepted** -
Postgres 17 permits it inside a transaction - and it rolled back cleanly;
`pg_enum` still held exactly `coupon, physical, service, recurring` afterwards.
What is still forbidden is USING the new value in the transaction that added it.
Nothing in the second half needs to, but the split is kept so the next statement
somebody adds cannot be the one that discovers this.

**CTI rather than columns on `products`.** That table already carries 60-odd
columns of which `coupon_expiry_days`, `recurring_amount_agorot` and
`billing_interval` are each meaningful for one type and null for every other. A
row in `course_products` IS the statement that this product is a course, and
[91] can be reverted by dropping three tables rather than by finding four
columns.

**`has_course_access` reads `auth.uid()` and does not take a uid.** That
distinction is one this database has already been bitten by: a `SECURITY
DEFINER` function that accepts a uid attributes the check to whoever the caller
names, which is an authorisation bypass wearing a parameter.

Two routes in, both [91]'s own words. A **purchase** is an `order_items` row on
an order with `paid_at IS NOT NULL` - not `status = 'paid'`, because the status
moves on to `fulfilled` and `platform_settled` and a string check would revoke
access the moment an operator settled the order. A **subscription** grants
access while `active`, and while `past_due` with the dunning window still open:
cutting a customer off on the first declined retry is premature, and the whole
point of three attempts is that the first often fails for a reason that
resolves.

**The probe corrected this file twice, and both were RLS mistakes that would
have shipped as "courses are broken for anonymous visitors".**

1. `REVOKE ALL ... FROM anon` on `course_products` and `course_modules`
   contradicted the public-read policies above it. A policy grants nothing; it
   only filters what a GRANT already allows. The failure surfaced as
   `permission denied for table course_modules` **raised by a query against
   `course_lessons`**, because the lesson policy's subquery reads modules - a
   long way from the line that caused it.
2. A single policy `TO anon, authenticated` calling `has_course_access` failed
   for anon with `permission denied for function`. Privileges are checked on the
   whole expression rather than short-circuited past the `is_preview` branch
   that would have avoided the call. Granting the function to anon would have
   worked and bought nothing - `auth.uid()` is null for anon so it always
   returns false - while adding an RPC endpoint and an advisor warning. Split by
   role instead, which is the move
   `120_split_public_select_policies_by_role.sql` already made on this database.

**Verified against production without applying.** anon sees only the preview
lesson and can still read the syllabus; an authenticated user with no purchase
sees only the preview and has no access; the buyer of a real paid order sees
both lessons and has access; progress is readable and writable only by its
owner; an unpaid order grants nothing; a subscription grants access, survives
the first decline, and stops once the three attempts are spent. Re-read
afterwards: no tables, no function, and the enum unchanged.

Order: after 210, which creates `phase_config`.


## 2026-09-09: 211 WRITTEN, not applied, and most of [90] was already there

`211_subscriptions_phase2.sql`.

**Measured before writing anything.** `135b_recurring_subscriptions.sql` is
applied: `subscriptions` (18 columns) and `subscription_charges` (11) exist in
production holding no rows, and the machinery around them is real rather than
scaffolding - `MAX_CHARGE_ATTEMPTS = 3`, a charge cron, `/account/subscriptions`,
`cancelSubscription`, and a unique index that makes a cycle succeed exactly once.

**What [90] was missing, against its own list:**

- **pause and resume.** `paused` has been a permitted status since 135b: the
  CHECK allows it, `dueSubscriptions` skips it, `canCancel` accepts it - and
  **nothing could set it.** A state the whole system understands and no path
  produces is a feature that reads as built.
- **an invoice per charge.** Zero mentions of an invoice anywhere on the charge
  path.
- **an admin console.** No `/admin/subscriptions` route existed at all, so a
  `past_due` subscription was invisible until the customer complained - the case
  three dunning attempts exist to catch early.
- **the feature flag off.** 210 seeds every type enabled, `recurring` included.

**`invoices.order_id` becomes nullable**, because a cycle charge creates no
order - and that is a decision the cron states in its own header ("Building
orders per cycle would create a second, competing definition of what an order
is"), not an oversight. A CHECK then requires exactly one of `order_id` and
`subscription_charge_id`: an invoice for nothing is a tax document nobody can
trace back to a payment, and one for both is two claims about the same money.
Safe to widen: `invoices` holds zero rows.

**The switch is turned off here rather than in 210**, because 210 seeds every
type enabled so that applying it changes nothing, and [90] asking for its flag
off is a statement about this feature rather than about the shape of the table.
Each phase-2 section owning its own switch is also the pattern 91 and 92 need.

**Verified against production without applying.** The phase switch goes off
**without clearing `enabled_at`**, an invoice for a charge with no order is
storable, a second invoice for one charge is refused, an invoice for neither is
refused, an invoice for both is refused, the existing order-only shape still
works, and deleting a charge takes its invoice with it. The probe's first run
also caught itself: it used `billing_interval = 'month'` and
`subscriptions_interval_known` permits only `monthly` and `yearly`.

Order: after 210, which creates `phase_config`. Independent of everything else.


## 2026-09-09: 210 WRITTEN, not applied, and the measurement inverted its default

`210_product_phases.sql`.

**[89] describes phase 1 as coupons and phase 2 as physical products, off until
the admin turns it on after ten sales. Read off production:**

```
type      status   count          orders total 4, of which sold 2
coupon    draft       15          vouchers 0
physical  active      44
physical  draft       21
```

**Every active product on this site is `physical`**, which the section puts in
phase 2, and there is not one active coupon to put in its place: all 15 are
drafts. Shipping phase 1 as written would hide 44 of 44 active products and
leave an empty shop, while the condition for refilling it - ten sales - is five
times away.

That does not make the feature wrong; it makes the DEFAULT wrong. So the file
separates two things the section says in one breath: `phase` records which phase
a type belongs to, as **advice**, and `is_enabled` is the switch, **seeded true
for every type**. Applying this file changes nothing a shopper sees, and
`/admin/phases` prints how many active products a switch would hide next to the
switch itself.

**A table and not an environment variable.** `lib/admin/feature-flags.ts` says
there is no flags table because "an agent cannot apply a migration, so a
deploy-free admin toggle does not exist" - true of the four operational kill
switches. This is different: [89] asks for a toggle the ADMIN flips, and an
environment variable is a redeploy, which on this project is a step nobody has
managed since 31.08.

**`product_type` is `text`, not the enum.** 91 and 92 add course and cabin
types, and a text key lets a row be seeded for a type before the enum has it -
which is the order those sections need, since the phase must be OFF before the
type exists.

**Verified against production without applying.** Four rows seeded and all
enabled, every `product_type` enum value has a row, a re-run of the seed does
**not** re-enable a type the operator disabled and does not overwrite their
note, `enabled_at` is set on the first enable and moves neither on a re-enable
nor on a disable, an unknown type raises rather than silently updating nothing,
an enabled row with no date is refused while a disabled future type with no date
is accepted, phase 3 is refused, and under `SET ROLE anon` the client could read
the table - which the storefront filter needs - and could neither write it nor
execute `set_phase_enabled`. Re-read afterwards: no table, no function.

Order: independent of everything else pending.


## 2026-09-09: 209 WRITTEN, not applied, and it does not reach zero WARN

`209_advisor_warnings.sql`.

**What the advisors say, measured today:** security has 3
`function_search_path_mutable`, 2 `anon_security_definer_function_executable`
and 21 `authenticated_security_definer_function_executable`; performance has 6
`auth_rls_initplan` and 19 `multiple_permissive_policies`. Fifty-one WARN
findings in six categories.

**This file clears nine of them**, and the two categories it leaves are left
deliberately.

**The 23 definer warnings cannot go to zero.** `is_admin()` is called by **93
policies**, `has_role` by 19, `is_support` by 13, `current_user_role` by 11,
`is_supplier_member` by 10. An RLS policy expression is evaluated **as the
calling role**, so `authenticated` must hold EXECUTE on every one of them or 93
policies start throwing permission errors - the whole admin panel, the supplier
console and the account area. `SECURITY INVOKER` is worse: these functions read
`profiles.role`, and `profiles` is behind a policy that calls `is_admin()`. The
`anon` half is one policy, `seo_redirects_select_unified`, which is
`(is_admin() OR is_active)` for `{anon, authenticated}`.

What is true and worth stating: an anonymous caller can POST to
`/rest/v1/rpc/is_admin` and get `false`. Nothing leaks - `is_supplier_member`
tests membership of the CALLER, so it returns false for a supplier that exists
and for one that does not.

**The 19 multiple-permissive warnings are not touched.** Merging two permissive
policies into one `OR` is a rewrite of access control on 19 tables including
`cashback_ledger`, `payment_events` and `payout_statement_lines`. The cost being
avoided is planning time on a database whose largest table is 44 rows.

**`ALTER` and not `CREATE OR REPLACE`**, twice over: replacing a function resets
its grants and `set_updated_at` is attached to triggers on dozens of tables, and
`ALTER POLICY` leaves no instant in which the table is readable without its
policy.

**Verified against production without applying.** All three functions pinned and
still working - `fn_il_phone_digits` still normalises `054-123-4567` and
`+972 54 1234567` to `972541234567` and still refuses junk, which is the check
that an empty `search_path` did not break a function that resolves nothing
outside `pg_catalog`. All six policies survive, the push policy is now an
InitPlan, and the RESTRICTIVE super_admin MFA gate kept **both** its
`COALESCE(..., 'aal1')` default and its `aal2` requirement: a coalesce lost in
that rewrite turns "no aal claim means aal1, refuse" into "unknown, allow".
Re-read afterwards: zero functions pinned, and the push policy back to
`(auth.uid() = user_id)`.

Order: independent of everything else pending.


## 2026-09-09: 208 WRITTEN, not applied, and the probe corrected the file twice

`208_drop_redundant_indexes.sql`.

**Measured on production first.** 91 tables, **390 indexes**, 253 of them never
scanned since 16.07. The whole database is 9,856 kB and **5,920 kB of that is
index** - 60%.

**253 unused indexes is not the finding and none of them is dropped for being
unused.** At 44 rows Postgres will not use an index at all, because scanning one
page is cheaper, so "never scanned" here mostly means "the query that would use
it has never run". Dropping on that basis is optimising for a scale the business
is trying to leave.

**Redundancy is the finding, and it is wrong at every scale.** An index on `(a)`
buys nothing beside an index on `(a, b)`: a B-tree is scannable on any prefix of
its key, so the composite serves every query the narrow one serves while the
narrow one costs a write on every insert and planning time on every query.
Fourteen such pairs, found by comparing every non-unique, non-primary index
against every other index on the same table with the same partial predicate.

**Two look backwards on the scan counts** - `products_status_idx` with 55,593
scans and `carts_session_id_idx` with 49,714 are both dropped, in favour of
indexes with 0 and 14. The planner used the narrow one because it existed, not
because nothing else could serve the query.

**Verified against production without applying, and the probe corrected this
file twice.** All fifteen were dropped inside a rolled-back transaction, with
`enable_seqscan = off` so a 44-row table could not hide the answer behind a
sequential scan, and `EXPLAIN` re-read for each:

```
products.status = 'active'  ->  idx_products_published
carts.session_id = ...      ->  carts_session_profile_idx
orders.user_id = ...        ->  idx_orders_user_status
vouchers.order_item_id      ->  vouchers_order_item_issued_idx
```

The first is **not** what the pair-wise analysis predicted. `products` carries
four status-leading or status-filtered indexes, and with the plain one gone the
planner takes the **partial** `idx_products_published`, which matches the
predicate exactly and is smaller than the composite. A better answer than the
file expected, and the only way to know was to drop it and look.

The probe also caught a defect in itself: its first run compared
`user_id = gen_random_uuid()` and reported a sequential scan on `orders`.
`gen_random_uuid()` is VOLATILE, so no index scan is possible against it - the
schema was fine and the test was wrong, and a less suspicious reading would have
kept an index on the strength of it.

`pg_indexes` re-read afterwards: 390, unchanged, with all fifteen still present.

Order: independent of everything else pending. It drops indexes and creates
nothing.


## 2026-09-09: 207 WRITTEN, not applied, and its first draft was wrong

`207_email_deliverability.sql`.

**The first version of this file was `CREATE TABLE public.email_suppressions
(address text ...)`.** Probed against production inside a rolled-back `DO` block
it failed with `column "address" does not exist` - because `CREATE TABLE IF NOT
EXISTS` had silently done nothing. **The table has been there since
`supabase/migrations/095_notification_outbox.sql`**, with `email` as its primary
key, a `reason` CHECK whose fourth value is spelled `unsubscribed`, and zero
rows.

That is the whole argument for probing before writing more. `IF NOT EXISTS` does
not warn; it succeeds. A file applied rather than probed would have left the new
columns uncreated and every reader looking for a column called `address` that
does not exist, and it would have reported success.

**The list is already consulted and has never held a row.**
`fn_enqueue_notification` checks it before queueing and has since 095, and
pending 190 checks it too. It is empty because Resend reports a bounce or a
complaint exactly once, over a webhook, and **nothing in this repository listens
to that webhook**. So a hard-bounced address is mailed again by the next cron
and an address whose owner pressed "spam" is mailed for as long as they have an
account. That cost is not paid by the address that bounced; it is paid by every
receipt and every coupon sent to everybody else, in the sending domain's
reputation.

**The grants are wider than the policy.** Measured live: `anon` holds SELECT,
and `authenticated` holds SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES
and TRIGGER, against a single `email_suppressions_admin_read` SELECT policy. RLS
closes the DML, because a command with no policy is denied, so this is latent
rather than live - but **TRUNCATE is not subject to RLS at all**, and the only
thing between `authenticated` and an emptied suppression list is that PostgREST
has no endpoint for it. `144_revoke_authenticated_dml` swept this class and did
not reach this table.

**The counters hold no address.** `email_events_daily` is a count per (day,
template, event). It answers "is the coupon mail being opened less than it was"
and cannot answer "did this customer open it", and there is no column that could
be joined to make it answer that. The normal implementation - a row per message
with a recipient, an opened_at, a user agent and an IP - is a reading-behaviour
profile per customer, on a site whose privacy page promises search terms are
kept without a user and without an IP.

**Verified against production without applying.** One `DO` block applied the
whole file, exercised it and ended in an unconditional `RAISE`. All of it
passed: a bounce suppresses and stores normalised with its source, a complaint
outranks a bounce, a later `manual` does **not** erase a complaint, one row per
address however often it is reported, a non-address refused, an unknown reason
refused, an unnormalised address refused by the new CHECK, the reader that has
existed since 095 now finds the row, counters increment rather than replace, an
untagged send lands under `unknown` rather than being dropped, an undefined
event kind refused, the grant fix leaves `authenticated` with SELECT alone and
`anon` with nothing, and under `SET ROLE anon` neither the counters nor
`suppress_email` were reachable. Re-read afterwards: zero rows, neither new
column present, no counters table, neither function.

Order: independent of everything else pending. It alters one existing table,
creates one new one and two functions.


## 2026-09-09: 206 WRITTEN, not applied, and one of its lines is a real defect

`206_homepage_merchandising.sql`.

**Measured first, and it changes what [59] is.** `127_homepage_cms.sql` **is
applied**: `homepage_sections`, `banners`, `v_homepage_sections_live` and
`v_banners_live` all exist in production with RLS on. **Both tables hold zero
rows.** So the machinery is live and inert - only the hero was ever wired to it,
`readHomepageContent` returns the authored constants on every request, and no
operator could reach any of it because there was no console. [59] is therefore
mostly application code; this file is the small database half.

**Four kinds the CHECK refuses today.** `product_rail`, `category_spotlight`,
`supplier_spotlight` and `countdown`. `featured` stays in the set and is not
reused for the rail: it has never had a component, and a kind meaning "some
products, configured how exactly" is the ambiguity a closed set exists to
prevent. `product_rail` says which products by saying `source` in its config.

**The window check is the line worth reading.** Neither table checked that
`ends_at` is after `starts_at`, and the live views filter
`starts_at <= now() AND ends_at >= now()`. A backwards window is therefore a row
that is active, scheduled, correct-looking in the admin list, and matches
**nothing, ever** - no error, nothing to see, and the operator's next move is to
check the schedule again. It is one mis-typed `datetime-local` away on two
adjacent fields. Equal is refused too: a zero-length window is the same
invisible row with a different typo behind it. Safe to add today precisely
because both tables are empty.

**`config` must be an object.** It is `jsonb NOT NULL DEFAULT '{}'` with no
shape check, so `[1,2,3]` and `"hello"` are both storable and both make every
`config.x` read undefined. The per-kind shape stays in
`lib/homepage/sections.ts` with zod, because a CHECK encoding four object shapes
is a CHECK nobody will extend correctly.

**Verified against production without applying.** One `DO` block applied the
whole file, exercised it and ended in an unconditional `RAISE`. All of it
passed: all four new kinds store and 127's seven still store, an unknown kind
refused, a backwards window refused, a zero-length window refused, an
open-ended and a forward window both accepted, a backwards banner window
refused, an array and a string as `config` both refused, the live view still hid
a future-windowed row while returning an open one, and under `SET ROLE anon` the
client could read the live view and could not insert. Re-read afterwards: zero
rows, the original seven-value CHECK intact, and neither new index present.

Order: independent of everything else pending. It alters two constraints, adds
three, and creates two indexes.


## 2026-09-09: 205 WRITTEN, not applied, and it seeds nothing

`205_content_pages.sql`.

**The decision worth reading first is that it inserts no rows.** The obvious
shape is five INSERTs carrying the text of `/about`, `/faq`, `/contact`,
`/suppliers` and a new `/page/how-it-works`. That text already lives in
`src/content/about.ts`, `src/content/legal/faq.ts` and `src/lib/content/pages.ts`,
and those modules are what the routes render today. A copy here would be a
second copy of every paragraph, in a file applied once and then never read
again, and the copy that drifts would be the one on screen. So the TypeScript
stays the floor: `getContentPage` merges published rows over `BUILT_IN_PAGES`,
and a row is created the first time an operator saves that page.

**Applying this file therefore changes nothing a visitor sees.** It creates two
empty tables and three functions.

**`bound_route` is not writable from any form.** Four of the five pages already
have addresses that are in the sitemap, carry canonicals and are linked from the
footer; `/page/about` alongside `/about` would be duplicate content competing
with itself. The column records the address a page renders at, for the sitemap
and the admin's view link. If an operator could type it they could point a page
at `/checkout`, and the sitemap would publish a URL that renders something else.

**Writes go through three `SECURITY DEFINER` functions, not PostgREST.** A page
update and its revision row have to be one transaction, and the revision NUMBER
has to be allocated under a row lock -- `max(revision) + 1` from the client is a
read-then-write that two overlapping saves both lose. `published_at` is set once
on the first publish and never moved.

**Rollback appends; it never deletes.** Restoring revision 3 writes it forward
as a new revision with a note naming the source, and revisions 4 and 5 stay
exactly where they are. An undo that erases what it undid turns the history from
evidence into a guess.

**Verified against production without applying.** One `DO` block created both
tables, both policies, all three functions, exercised them, and ended in an
unconditional `RAISE`. All of it passed: the first save is revision 1 and the
second is 2 on the same row, `published_at` does not move on a later edit or on
unpublish, an empty published prose body is refused while the same body as a
draft is accepted, an faq page with no entries is refused, a Hebrew slug is
refused, a bound route under `/page/` is refused, a second page claiming
`/about` is refused, a rollback of a revision that does not exist raises rather
than blanking the page, an unknown status is refused, a nine-character meta
description is refused, a `javascript:` og image is refused, and under `SET ROLE
anon` the client saw the one published row, no revisions at all, and could
neither update a page nor execute `save_content_page`. `to_regclass` and
`to_regproc` were re-read afterwards: nothing left behind.

Order: independent of everything else pending. It creates two tables and three
functions and touches nothing existing.


## 2026-09-09: 204 WRITTEN, not applied, an applicant is not a supplier

`204_supplier_onboarding.sql`.

**The obvious design is one enum value, and the measurement is why it is not
done.** `supplier_status` is `active, suspended, closed`; adding `pending` looks
like one line. But `from('suppliers')` appears at **19 call sites** in this repo
and roughly **nine** filter on status at all, so a pending supplier would be
visible by default in about ten places (the directory, the admin pickers, the
publish gate, the payout run), and nothing would fail if one were missed. That
is a gap-by-default: the safe state would depend on remembering.

A separate application table inverts it. An applicant cannot appear anywhere a
supplier appears because there is no row; the `suppliers` row is created at
approval, by which point every existing query is already correct without being
touched. The 12 live supplier rows are untouched by this file.

**The bank account is not a column.** `supabase_vault` is installed in this
project (measured; a create/read round trip was exercised and rolled back), so
the number goes into a vault secret through a `SECURITY DEFINER` wrapper granted
to nobody but the service role. What stays in the clear is the bank code, the
branch and the **last four**, which a payout operator needs to recognise an
account and which cannot move money. There is deliberately **no read function**:
nothing in this application needs to turn the id back into an account number,
and one sitting here unused is one that can be called.

**The contract log is append-only and stores a hash.** "The supplier accepted
the terms" is worth nothing if the terms can be edited afterwards, so each
acceptance keeps the version and a SHA-256 of the exact text that was on screen.

**Verified against production without applying.** One `DO` block ran the whole
file, exercised it, and ended in an unconditional `RAISE`. All of it passed: the
vault wrapper round trips and refuses an empty secret, a five-digit business id
refused, `submitted` with no `submitted_at` refused, a rejection with no reason
refused, an approval with no supplier refused, a **second live application for
one business number refused** while a rejected one frees the number, a duplicate
`r2_key` refused, and a non-hex contract hash refused. `pg_class`, `pg_proc` and
`vault.secrets` re-read afterwards: nothing left behind.

Order: independent of everything else pending.

## 2026-09-09: 203 WRITTEN, not applied, the tables were live and the code never arrived

`203_support_center.sql`.

**Measured first.** `support_tickets` and `support_ticket_messages` are already
applied in production, with RLS on and five policies between them, holding
**zero rows**. This file is what they are missing, not a new feature's schema.

**The finding is in a CHECK constraint.** `channel` has permitted
`'contact_form'` since the table was created and **nothing has ever written that
value**. The contact form mails the shop inbox and creates no ticket, so a
customer's message has no status, no owner and no record that anybody answered
it. The only writer is the WhatsApp webhook.

**`email` is a bug fix.** A `contact_form` ticket has no `user_id` (the sender
may have no account) and no `phone`, so the table could hold a message from
somebody we have **no way to reply to**. A CHECK now requires one of the three.

**The policy change is a leak fix.** `internal` becomes an expressible message
direction, and the existing owner-read policy returns every message on the
ticket, so the first internal note would have been handed to the customer it
was written about. The replacement filters it in the same statement that
introduces the direction, so the two cannot be applied separately.

**No SLA due-date column, deliberately.** A stored deadline is computed once
under a policy that was not stored beside it, so it is wrong for every row the
moment the targets change and cannot be recomputed. Derived in
`server/domain/support/sla.ts` from `created_at` and `first_response_at`. The
contrast is `disputes.respond_by` in 202, which **is** a column, because that
deadline is set by the acquirer and we are only recording it.

**No customer INSERT policies.** A policy can say "this row is yours"; it cannot
check that the order asked about is the caller's, that the ticket is open, or
that this is not the fortieth message this hour. Writes go through actions on
the service-role client, as `refund_requests` does.

**Verified against production without applying.** One `DO` block ran the whole
file, exercised it, and ended in an unconditional `RAISE`. All of it passed: an
unreachable ticket refused, the new channels and categories accepted, `closed`
without `closed_at` refused **and** `closed_at` without `closed` refused, a
bogus priority and category refused, the `internal` direction accepted and a
bogus one refused, and the owner policy confirmed to filter internal notes.
Nothing left behind.

Order: independent of everything else pending. It touches only the two support
tables.

## 2026-09-09: 202 WRITTEN, not applied, one column that is a live bug, and three tables

`202_fraud_abuse.sql`.

**Part 1 is not a feature.** `information_schema` says `public.payments` has
twenty columns and `token_id` is **not one of them**, although
`026_commerce.sql` declares it in the CREATE TABLE, production and the file
chain are different lineages, the same discovery `payment-money-columns.ts`
records about 059. On 2026-09-07, commit `52fe21ed4` added `token_id` to the
`payments` INSERT on the saved-card charge path. 42703 takes down the whole
statement, so from that commit **every purchase with a saved card failed**
before Cardcom was called, with "יצירת תשלום נכשלה". The hosted-page path
inserts no `token_id` and was unaffected, which is why it never presented as an
outage.

The application no longer depends on this migration for that: `payment-token-
column.ts` probes for the column and omits it when absent. Applying it restores
the **record**, which card a charge rode on, and makes the per-account card
velocity signal readable at all.

**The part that refuses needs no migration.** The velocity limits count
declines, distinct cards and one card across accounts out of `payments` and
`payment_tokens`, which exist today. `order_risk_assessments` is the part that
does **not** refuse: a score with no measured base rate behind it routes an
order to a human and never declines one. It is a table and not a column on
`orders` because that INSERT must not grow, the lesson `order-money-columns.ts`
exists to record.

**The refund cap is three per order, not three per customer.** Per customer
punishes the good one; per order bounds the loop that costs something. Enforced
by a trigger and not only by the form, and **a withdrawn request still counts**,
because otherwise the cap is bypassed by withdraw-and-reopen and withdrawing is
free.

**Disputes are entered, not received.** The legacy Cardcom `/Interface/*.aspx`
API sends no chargeback notification, so there is no integration to write.
`respond_by` is NOT NULL: a case answered late is lost by default. `status` is
text + CHECK rather than `public.dispute_status`, which exists in production
with **zero columns using it** and whose `resolved_accepted` cannot say who
accepted, losing a chargeback and declining to contest one are different
numbers in every report.

**Verified against production without applying.** One `DO` block created all of
it, exercised it, and ended in an unconditional `RAISE`. All of it passed: the
review CHECK refuses half a decision, three requests land and the fourth is
refused, a withdrawal does not free a slot, an approval with no `decided_at` is
refused, a duplicate `provider_ref` is refused, and a `won` with no
`resolved_at` is refused. `pg_class`, `pg_proc` and `information_schema` re-read
afterwards: nothing left behind.

Order: independent of everything else pending. It adds one column, three tables
and one function, and touches no existing row.

## 2026-09-09: 201 WRITTEN, not applied — a flash deal, and what it does not need to do

`201_scheduled_price_changes.sql`. `discount_campaigns` (096) schedules a
**code** — `starts_at`, `expires_at`, caps, stacking, and since 194 caps that
are actually counted. Nothing has ever scheduled a **price**. A flash deal is
not a code somebody types; it is the product costing less between two o'clock
and six, on the page, for everybody. The only way to run one today is an
operator editing `kenyon_price` twice and remembering to come back.

**The interesting part is what this does not need to do.** A scheduler that
moves prices on a timer, over a catalogue where 15 of 44 products already
advertise a struck-through price nobody can evidence, reads like a machine for
manufacturing non-compliant discounts. It is not, and the reason is that 193
governs the **claim** rather than the price.

Israeli law constrains the "before" price, not the price. Lowering is always
lawful. What a flash deal changes is the **evidence** — after a day at ₪99 a
`full_price` of ₪150 stops being defensible for thirty days — and
`checkReferencePrice` works that out on its own from `price_history`, with the
storefront dropping the strike-through and nobody deciding anything.

So this file's whole duty to compliance is one line of the cron that applies it:
**every applied change writes a `price_history` row with `source = 'change'`**.
That is the column 193 created for exactly this and left unused, and it closes
the sampling gap 193 documented — until now the record was one observation a day
at 04:00, so a flash deal that opened at 10:00 and closed at 18:00 left no trace
at all, and the thirty-day "lowest price charged" would have been computed from
a window that never saw it.

**A table and not `pg_cron`.** A row can be listed, cancelled, and shown to an
operator who wants to know what is about to happen to their catalogue; a job in
another schema can be none of those without a query nobody will write.

**Nothing here is public.** A schedule of future prices is the most valuable
thing a competitor could read off this database, and it would let a shopper wait
for a drop they can see coming. RESTRICTIVE deny, the 172 shape.

Proven against production, rolled back:

```
duplicate_moment=REFUSED  negative_price=REFUSED  due_includes_past=1
cancelled_frees_slot=2    anon_read=REFUSED
```

Two rows at the same instant are two prices with no rule for which wins, so the
partial unique index refuses the second. A past-due row is still due, because a
missed run must catch up — a flash deal nobody ran is a promise on a marketing
email the site did not keep. And a cancelled row frees its slot for a
replacement, because the index is scoped to uncancelled rows.

## 2026-09-09: 200 APPLIED, and moved — two kinds, and a guard against 183's mistake

**Moved to `migrations/applied/` on 2026-09-09.** Production's
`notification_outbox_kind_check` carries exactly the sixteen names this file
specifies, read with `pg_get_constraintdef`. The repository had been asserting
both things at once: the note on 214 already said 200 was applied, while the
file itself still sat in `pending/`.

**Do not re-apply it, and it will not let you.** Its own opening `DO` block
raises when the live constraint carries a name the file does not restate, and
the live constraint now carries `price_drop` and `back_in_stock` - which this
file added and its fourteen-name guard list does not include. That is the guard
working, not a defect. 214 carries the sixteen forward.

`200_wishlist_alert_kinds.sql`. `price_drop` and `back_in_stock`, so a wishlist
can do the one thing a wishlist is for: tell somebody when a saved product gets
cheaper or comes back.

Both are possible because the **data** arrived in the last two migrations, not
because anything new is invented here — `price_history` (193) makes a price drop
a comparison between two of its rows, and `stock_waitlist` (195) already holds
who asked to be told.

**The constraint cannot be extended, only dropped and recreated, and that is
where the danger is.** 183 shipped with twelve names reconstructed from the file
before it while the live constraint already carried fourteen; applying it
verbatim would have **dropped `account_deleted`** and turned every
account-deletion notification into a 23514. Its preflight caught it.

The fourteen restated here were read out of production with
`pg_get_constraintdef` on 2026-09-09, and the `DO` block at the top **refuses to
run** if the live constraint has grown a name this file does not know about. A
migration that restates a list is only as current as the day it was written, so
it checks the day it runs.

Probed against production, rolled back:

```
guard=PASSED  kinds=16  price_drop=ACCEPTED  bogus_kind=REFUSED  account_deleted_kept=true
```

**The application ships ahead of it, deliberately and visibly.**
`/api/cron/wishlist-alerts` enqueues both kinds and reads `23514` as "200 is not
applied", reporting it once per run rather than throwing.
`src/lib/email/outbox-kinds.test.ts` gained a third category for exactly this —
and the assertion under it requires every ahead-of-its-migration kind to have a
caller that **handles 23514**, which is the difference between "shipped ahead of
its migration" and "shipped broken".

## 2026-09-09: 199 WRITTEN, not applied — a dormant grant, woken by a new policy

`199_review_replies_and_reports.sql`. It adds the supplier's public answer to a
review and a reader's way to object to one. **The `REVOKE` in it is the point,
not tidying.**

154 shipped `reviews` with a verified-purchase INSERT policy, a moderation
status and a soft delete. What it had no room for was a conversation: a one-star
review with no reply and one with "we are sorry, the masseuse was ill that day
and we have refunded you" are different documents, and only the second makes a
shopper trust the shop.

**The finding is what a new policy does to an old grant.** `authenticated`
already held a **table-wide UPDATE grant** on `reviews`, over every column. It
is inert today for exactly one reason: there is no UPDATE policy on the table,
so RLS denies every UPDATE regardless of the grant.

Adding the supplier reply policy **ends that**. The first version of this file
did, and a probe against production came back:

```
rewrite_body=ALLOWED
```

— a supplier could have rewritten the rating and the body of a review about
their own business. The column grant beneath was not wrong; it was never
reached, because the wider grant already covered every column. This is the shape
172's RESTRICTIVE policies were installed for, arriving from the other
direction: **a grant that protects nothing until somebody adds a policy, at
which point it protects nothing.**

Re-probed after `REVOKE UPDATE ON public.reviews FROM authenticated`:

```
update_grants=3  own_reply=ALLOWED  rewrite_body=REFUSED
foreign_reply=NO ROWS  duplicate_report=REFUSED  read_queue=REFUSED
```

Exactly the three reply columns; a supplier may answer a review of their own
product and not one of anybody else's; a second report from the same person is
refused by the unique index; and a reporter cannot read the moderation queue —
deliberately, because letting them read their own report back tells them whether
an admin has acted, which turns a moderation decision into a negotiation with
whoever objected loudest.

**Reports are resolved rather than deleted.** "We looked and it was fine" is the
answer that stops the same review being re-queued by the next report, and it is
only expressible if the row survives.

**Measured: `reviews` holds 0 rows.** Everything here, and everything 154
shipped, is inert until the first customer writes one. That is said rather than
hidden, because "the reply feature works" and "the reply feature has never had a
review to reply to" are different claims.

## 2026-09-09: 198 WRITTEN, not applied — the bell, and an empty publication

`198_in_app_notifications.sql`. `notification_outbox` is an **email queue**: an
address, a payload, a dedupe key, drained by a cron, and a row leaves it when
the mail is sent. It is a record of what we tried to **send**, not of what a
customer has been **told**. Nothing in it can back a bell with an unread count,
and reusing it for one would mean an "unread" that clears when a cron runs
rather than when somebody reads it.

`push_subscriptions` (179) and the WhatsApp tables (173) are the other channels
and are applied and complete. The in-app one has never existed: a customer who
is on the site has no way to see that their voucher was redeemed unless they
happen to open the mail.

**The realtime trap, measured:**

```
select * from pg_publication_tables where pubname = 'supabase_realtime'  ->  0 rows
```

The publication is **empty**. A `postgres_changes` subscription against a table
that is not in it connects, reports `SUBSCRIBED`, and receives nothing, ever —
no error on either side. Nothing in this codebase subscribes to anything today,
so it is not currently a live bug. It is the bug the bell would have had. The
`ALTER PUBLICATION` is therefore part of the feature, and `REPLICA IDENTITY
FULL` with it: without it an UPDATE's WAL record carries no `user_id` and the
filter Supabase applies cannot be evaluated.

**The client may mark read and nothing else, enforced by a column grant.** An
UPDATE policy scoped to the owner would let a customer rewrite the title of
their own notification — harmless until one is quoted in a support
conversation. `GRANT UPDATE (read_at)` is the narrower tool and it is enforced
by the grant system rather than by a `WITH CHECK` somebody has to get exactly
right.

**`notification_preferences` has no CHECK on `kind`, deliberately.** Which kinds
may be switched off is a product decision that moves, and a constraint would
mean a migration each time one crossed between required and optional. The list
lives in `src/lib/notifications/preferences.ts`, which checks `REQUIRED_KINDS`
**before** reading a row — so a row for a required kind is inert rather than
dangerous, which is what makes the missing constraint safe.

**Verified against production inside a rolled-back `DO` block:**

```
in_publication=1  absolute_href=REFUSED  mark_read=ALLOWED
rewrite_title=REFUSED  other_users_visible=0
```

## 2026-09-09: 197 WRITTEN, not applied — somewhere to put a delivery rate

`197_shipping_zones_and_pickup.sql`. Nothing charges for delivery anywhere:
`orders` has no shipping column, the cart view has no shipping line,
`calculateSettlement` takes no shipping input, and all 44 active products carry
`requires_shipping = true`.

**That is a decision, not a gap.** `TopBar` prints "משלוח מהיר חינם" on every
page of the site with no qualifier, and the product page promises 3-7 business
days with no fee beside it. The code and the banner agree.

**What is missing is a place to put a rate.** "Free" is expressed as an
*absence*, and an absence cannot be changed carefully: there is nowhere to write
"Eilat costs more", nowhere to write "free over ₪199", and no way to tell
whether free-everywhere was chosen or merely never built. This makes the policy
a value, seeded with exactly what the site already does.

**Not wired into checkout, and not by oversight.** Charging for delivery needs
rates nobody has set and contradicts a sentence on every page.
`src/lib/shipping/zones.test.ts` holds the two together: a surcharge configured
while the banner still says free fails the suite, in both directions.

**`eilat` is separate from `south`** and it is the only split here that is not
arbitrary — a four-hour drive past the last distribution point, priced apart by
every Israeli courier, and exactly where a flat national rate loses money.

**`pickup_points` is created EMPTY and stays that way.** A pickup point is a
physical arrangement with a real shop, not a row. A seeded example is the single
worst thing this file could do, because the failure lands on a customer standing
outside a locked door holding an order number.

Proven in a rolled-back `DO` block: `zones=5 charging=0 pickup_rows=0
anon_insert=REFUSED`.

## 2026-09-09: 196 WRITTEN, not applied — the tracking number nobody could see

`196_shipped_notification_carries_tracking.sql`. One key in one
`jsonb_build_object`, and it closes a chain that was broken at the last link.

155 gave `order_items` a `carrier` and a `tracking_number`, and both are applied.
The admin records them. 183 gave the order a trigger that mails the customer
"ההזמנה שלך נשלחה" with a button reading **"למעקב אחרי ההזמנה"** — pointing at
`/account/orders`, which rendered the word "נשלח" and **nothing else**.

So the number was captured, stored, and shown to nobody, and the mail raised
exactly the question the page it linked to could not answer. The customer's only
remaining move was to write to support for a string already in the database.

The page half is fixed in code. This is the mail half: the trigger built its
payload from `orders` and a COUNT of items and never looked at either column.

**`shipments` is an ARRAY, because the data is per line.** 155 put carrier and
tracking on `order_items` and said why: an order-level shipments table "would
fork fulfillment state into two places for the multi-supplier order that is this
platform's normal case". Suppliers ship separately, so three suppliers is three
parcels with three numbers, and a payload carrying one pair would be wrong in
the case the model was built for. It is NULL rather than `[]` when no line has a
number, and the email builder reads a missing array as "say nothing".

**The firing condition, dedupe key and EXCEPTION clause are byte-for-byte the
ones production carries**, read out with `pg_get_functiondef` rather than
reconstructed from 183 — restating a function is how a live guard gets dropped
by accident. Proven in a rolled-back `DO` block: the trigger fired once and the
payload carried exactly the line with a real number, excluding the one whose
tracking was whitespace.

## 2026-09-09: 195 WRITTEN, not applied — a sold-out page that learns nothing

`195_stock_waitlist.sql`. `ProductInfo` printed "אזל מהמלאי", disabled the
button, and the visit ended there. Somebody came for a specific thing, it was
not there, and the shop learned nothing from it — not that the product is
wanted, not by how many people.

**Measured 2026-09-09, and it is why this file is the smallest one here:** no
active product is at zero stock. 44 active, 0 sold out, 19 with
`stock_quantity IS NULL` and therefore never sold out by construction. The
branch exists in the UI and production does not currently reach it. Built for
the first time it does, and sized accordingly.

**Email is the key, not the user id.** A guest can want a restock, and demanding
an account at that moment converts the only signal of interest into a signup
form. `user_id` is recorded when there happens to be one.

**Notified, not deleted.** `notified_at` marks a row sent rather than removing
it, so "we told forty people and three bought" stays answerable and a second
restock does not mail the same person again unless they ask again. The unique
index is partial on `notified_at IS NULL` for exactly that: one LIVE request per
address per product, and a new request after a notification is a new request
rather than a duplicate.

**Not readable by any client role.** A row is an email address next to a
purchase intention; a public SELECT would turn the waitlist into a customer list
anyone could page through. RESTRICTIVE deny, the 172 shape, so a permissive
policy added later cannot outvote it.

**Verified against production inside a rolled-back `DO` block:**

```
rows_after_two_calls=1  bad_email=REFUSED  unknown_product=REFUSED  rows_after_renotify=2
```

Two calls with the same address in different casing and whitespace write one
row. A malformed address and an id that is not a live product are both refused
rather than stored. After a notification the same person can ask again.

## 2026-09-09: 194 WRITTEN, not applied — a single-use code is unlimited-use

`194_discount_claim_caps.sql`. The finding was already in the codebase, in a
comment next to the charge in `checkout.ts`:

> nothing increments `coupons.used_count`, so `max_uses` is enforced as a read
> of a counter no part of this flow advances

That is exact, and what it means is that a code marked single-use is not
single-use. It is **unlimited-use, for everybody, forever**. The check reads a
counter, the counter stays at zero, the check passes. Nothing errors and nothing
logs, because from the code's point of view the coupon simply has uses left.

`max_uses_per_user` is worse on the `coupons` side: the column does not exist.
`discount_campaigns` **has** both columns and a `discount_redemptions` table to
count against, and `growth/discount.ts:147` reads `used_count >= max_uses`
there too — against a counter that also has no writer. Two coupon systems, the
same defect in both, and one of them looks complete enough that nobody
re-checked.

Measured 2026-09-09: `coupons` 0 rows, `discount_campaigns` 0 rows,
`discount_redemptions` 0 rows. **Nothing has been lost yet.** The hole opens the
moment the first code is created, and a marketing code is created by somebody in
a hurry.

**Shaped after 117's stock reservation on purpose.** A `max_uses` cap is the
same kind of scarce thing as the last unit in stock, and 117 already solved it:
check and claim in one statement under `FOR UPDATE`, before the card is charged,
all-or-nothing, released when the order is cancelled. `claim_order_discount` is
`reserve_order_stock` and `release_order_discount` is `release_order_stock`;
they are called from the same two places. One shape in the codebase for "hold a
limited thing while the shopper pays" beats two that differ in ways nobody
chose.

**A read-then-write in TypeScript would be the bug that was already fixed here
once.** `finalize.ts` used to SELECT `stock_quantity` and UPDATE to
`max(0, stock - qty)`; two concurrent finalizes read the same number and wrote
the same result, and the floor hid it. `SELECT used_count; UPDATE used_count+1`
is that bug with a different column.

**Verified against production inside a rolled-back `DO` block**, with nothing
left behind:

```
first=OK  replay=OK  used_after_replay=1  rows=1
second_order=per_user_exhausted  released=1  used_after_release=0  retry=OK
```

A replayed claim for the same order leaves the counter at 1 and writes exactly
one row (the unique index is what makes it idempotent rather than a guard
somebody has to remember). A second order by the same customer under a cap of 1
is refused. Release hands the use back and the next attempt succeeds. The match
is case-insensitive — the first call passed `probe194` against a stored
`PROBE194`.

`coupons.max_uses_per_user` is nullable with `DEFAULT 1`: NULL means unlimited
and stays expressible, while a code created without a thought is single-use per
customer. That direction is the recoverable one — a customer refused a second
use opens a ticket, a code reused without limit is money that is gone.

## 2026-09-09: 193 WRITTEN, not applied — fifteen price claims and no evidence

`193_price_history.sql`. Measured against production the same day:

```
44  active products
15  showing a struck-through "מחיר רגיל" above the price charged
20  products with any price change recorded anywhere (audit_log)
 0  products in BOTH sets
```

The intersection is empty. Israeli consumer law treats an advertised saving as
a factual claim about what the trader used to charge; `products.full_price` is
a number an operator types into a form, eight components paint it with a line
through it, and nothing between the form and the shopper has ever asked whether
it is true.

**`audit_log` cannot stand in for it, and the numbers say why.** 555 product
rows, 21 mentioning `kenyon_price`, covering 20 products, none of them among the
fifteen. A change log records the edits that went through the audited path — a
bulk update, a direct SQL edit or a CSV import writes nothing — and, more
fundamentally, the law asks about the price on **every day** of a window,
including the twenty-nine when nobody edited anything.

**Append-only, by trigger, for every role including `service_role`.** This table
exists to contradict a claim somebody wants to make. A history that whoever is
under pressure to run a sale can edit is not evidence, it is a second copy of
the claim. UPDATE and DELETE both raise `42501`.

**No unique key on (product, day), deliberately.** A price can change twice in a
day; forcing one row per day would make the writer choose which is "the" price,
and a writer that chooses can be wrong. A day may carry several rows and the
reader takes the lowest — the price a shopper could actually have paid. The
unique index covers the whole observation instead, so a re-run of the snapshot
is a no-op and a real change is a new row.

**Status goes in the row and the reader filters on it.** A draft day is not a
day the product had a price, and without it a product could be hidden for a
month and return advertising any "before" price at all behind a full window of
draft days.

**Verified against production inside a rolled-back `DO` block**, with nothing
left behind:

```
seeded=80  rerun_wrote=0  update=BLOCKED  delete=BLOCKED  products_with_null_price=0
```

It seeds one day from the live catalogue as it applies, so the window starts the
day it lands rather than the day somebody remembers to schedule the cron.
Nothing invents a price for a day it was not observed: a fabricated history
would let an unprovable claim pass the check that exists to catch it. Full
measurement in `docs/PRICING-COMPLIANCE.md`.

## 2026-09-09: 192 WRITTEN, not applied — the redirect table has never held a row

`192_seed_seo_redirects.sql`. `select count(*) from public.seo_redirects` returns
**0** against production, so every URL the retired WordPress site served 404s
today and has since the cutover. The machinery around the table is complete and
careful -- proxy lookup ahead of the session, a five-minute in-memory map that
fails open, `normalizePath` folding percent-encoding and NFC so Hebrew compares
equal, an anon RLS policy, a hit counter -- and it has never been given a row.
All twenty-two `wp_import` staging tables are empty too.

**Data only. No DDL.** That is why it is a numbered file rather than a script:
it is the same reviewable, once-approved artefact as any other change to
production, and it is idempotent, so re-running it is a no-op.

**Not projected by `wp_import.fn_project_redirects`, and the reason is the
finding.** That function copies `url_inventory.mapped_new_path` and checks only
that the path is non-empty, starts with a slash and differs from its source. Run
today it emits 34 rows and **13 are wrong against production**: eleven category
rows point at the Hebrew slugs WooCommerce used (`מסעדות-ובתי-קפה`) where this
database has always used English ones (`restaurants-cafes`), so each is a 301
into a 404 -- worse than the 404 it replaces, because Search Console files it
under "redirect" and the broken destination never surfaces as a broken page.
`/blog` is marked gone and `/blog` is a live route here with real posts; the
proxy answers 410 before routing, so the row would have removed a working,
indexed page with the one status code that tells a crawler not to return. And
two `/product/...₪` rows redirect one live product at another -- the duplicate
pair blocker #1 records, whose resolution is the operator's call.

All three share a shape: the inventory was frozen on 2026-08-11 and used as a
live predicate. `scripts/build-legacy-redirects.mjs` re-asks the question every
run and refuses a row whose source is live or whose target is not, which is how
33 correct rows replaced 34 rows containing 13 wrong ones.

**It deactivates rather than deletes.** Rows not in the seed get
`is_active = false`; dropping them would throw away `hits`, the only evidence of
whether a retired URL still receives traffic. It ends in a `DO` block that
raises unless exactly 33 rows are active, so a partial apply cannot pass
quietly. Full measurement in `docs/WP-MIGRATION.md`.

## 2026-09-09: 191 WRITTEN, not applied — somewhere to put the reconciliation

`191_payment_discrepancies.sql`. SECTIONS 28 names a daily reconciliation cron
"writing `payment_discrepancies`". The cron exists and is thorough; the table
appears nowhere in this repo, and the findings did not survive the run.

**What was lost, read off the route rather than assumed.** The admin alert caps
at twenty rows, which is right -- an alert listing two hundred is one nobody
reads. The rest lived only in the HTTP response body, whose caller is a
scheduler that discards it. `reconcile.gaps_found` logs a COUNT, so the number
of problems survived and the identity of the transactions did not. And
`missing_remotely` is outside the critical set on purpose, so it was neither
alerted nor logged individually nor stored: the terminal parser has never been
confirmed against a live wire format and that kind is where a mismatch lands, so
not paging on it is correct, but keeping no record of it threw away the exact
evidence that would settle the parser question on the first live run.

**Keyed on the discrepancy, not on the run.** The window is 48 hours and runs
overlap deliberately, so the same finding recurs. The unique key is
`(kind, transaction_id, cardcom_account_id)`, and a re-find bumps `last_seen_at`
and `seen_count`. One problem stays one row, and a finding that STOPPED being
found is visible as a row whose `last_seen_at` predates the last run. In a
per-run table that same fact is an absence of new rows, and an absence is also
what a cron that quietly died looks like.

**The writer is a function, not a PostgREST upsert.** PostgREST compiles
`upsert` to `ON CONFLICT DO UPDATE` over every column in the payload:
`first_seen_at` would be reset on every run, and `seen_count` cannot be
expressed from the client at all without a read-then-write that two overlapping
runs both lose. `security invoker` and not definer -- the only caller holds the
service role already -- with `search_path` pinned anyway, which is 188's point.

**Verified against production, nothing applied.** One `DO` block built the
table, both indexes, both policies and the function, exercised them, and ended
in an unconditional `RAISE`. Everything held: a batch carrying the same key
twice writes one row (the `distinct on` is what keeps `ON CONFLICT DO UPDATE
cannot affect row a second time` from firing), a re-find leaves the count alone
while `seen_count` reaches 2 and `first_seen_at` survives, a row marked
`resolved_at` is reopened, a later run that resolved no order id does not erase
the one an earlier run found, the same deal number on a second terminal is a
second row, an unknown `kind` is refused by the CHECK, and `null` and a non-array
both return 0. `pg_class` and `pg_proc` re-read afterwards: nothing left behind.

**The route does not wait for it.** `PGRST202` and `42883` are read as "not
applied yet", said once per process rather than once per run, and never fatal.
Recording is not the job; asking the terminal is.

## 2026-09-09: 190 WRITTEN, not applied — the second abandoned-cart reminder

`190_abandoned_cart_second_reminder.sql`. SECTIONS 26 asks for two reminders,
T+2h and T+24h. What shipped sends ONE, ever, and the ceiling is structural
rather than a decision the route makes: `abandoned_cart_one_per_cart` is a
UNIQUE on `cart_id` alone and `fn_due_abandoned_carts` excludes any cart with any
nudge row. There is no counter to raise. This file adds `reminder_number` with a
CHECK of 1..2, swaps the uniqueness to `(cart_id, reminder_number)`, and
replaces the function so it says WHICH reminder is owed.

**There is no `cart_abandonment` table, and that is deliberate.** The section
names one holding `(cart_id, last_activity_at, reminder_sent_count)`. All three
already exist and are already correct: `carts.updated_at` is the activity stamp
the cart itself writes, the count is `count(*)` over the receipts, and `cart_id`
is the nudge's own column. A separate counter has to be kept true by a trigger
or by application code, and it fails silently in both directions -- ahead of the
sends it mails too little, behind them too much. Counting the receipts cannot
disagree with the receipts.

**The gap is measured from the last nudge, not from the cart.** "Cart older than
24h and exactly one nudge" misfires the moment the cron starts late: a cart
abandoned 30 hours ago earns the first mail immediately and the second one
hourly tick later.

**Three findings came out of the dry runs, and two of them would have shipped:**

1. `DROP INDEX abandoned_cart_one_per_cart` fails with 2BP01. It is a
   CONSTRAINT, and `pg_indexes` -- which is what was read to write the statement
   -- lists it like any other index and says nothing about that. The first run
   stopped halfway.
2. **The recreated function came back EXECUTE-able by PUBLIC, anon and
   authenticated.** A DROP takes grants with it and a bare CREATE applies the
   defaults; the original carried only `postgres` and `service_role`, so
   somebody had already revoked the rest and the DROP would have undone it
   silently. The function is SECURITY DEFINER and returns CUSTOMER EMAIL
   ADDRESSES. Measured as `anon`: allowed without the revokes, 42501 with them.
   Three REVOKEs are now in the file above the grants.
3. The full sequence on a cart planted 30 hours old: reminder 1, then NOT DUE on
   the next tick, then reminder 2 once the gap had passed, then NOT DUE, and a
   third row refused 23514.

**The route ships before this file and degrades to exactly today's behaviour.**
The new third parameter has a default so the deployed two-argument call still
resolves; before the migration the old function returns no `reminder_number`,
the route reads that as reminder 1, and the old UNIQUE still allows one nudge
per cart. There is no window where the two halves disagree.


## 2026-09-09: 189 WRITTEN, not applied — the review title and one review per product

`189_reviews_title_and_one_per_product.sql` closes the three things SECTIONS 25
asks of the schema that 154 did not ship: `title`, `verified_purchase`, and
**one review per user per product**.

The third is the one that matters and it is not a missing column, it is a
different rule. 154 enforces `order_item_id UNIQUE` — one review per purchased
**line** — and says so on purpose: "buying twice earns two review slots". Under
the section's rule a second purchase earns nothing new, because the thing being
reviewed is the product. Both constraints stay; the new one is strictly tighter.

**The index is partial on `deleted_at IS NULL`, and that is the retry path.** A
rejected review keeps occupying the slot, otherwise moderation is a treadmill.
Soft-deleting the row is how a moderator lets somebody try again, and it frees
the slot without erasing the history.

**`verified_purchase` is a materialisation, not a gate.** What verifies a review
is 154's INSERT policy. No code reads this column to decide anything, and a
client can post `false` about its own review — a lie in the harmless direction.
Forbidding it would mean restating the INSERT policy, which is the shape that
nearly broke 183.

**Three dry runs against production, all rolled back**, `reviews` back to 0 rows
after each. The DDL applies verbatim; a second review by the same customer on
the same product from a second real purchase is refused 23505; a soft-delete
frees the slot and the retry is accepted; and with two live duplicates planted
first, block 0 fires and names the pair while a bare `CREATE UNIQUE INDEX`
merely 23505s. Details in the file header.

**The application half is already shipped and does not wait for this file.**
`runSubmitReview` and `getMyReviewableItem` enforce one-per-user-per-product in
code today, so the rule holds on production now and this migration makes the
database the one that holds it. The title field is rendered only when the column
exists (probed once per request that needs it), so nothing a customer types can
be silently dropped before it lands.


## 2026-09-09: 183 APPLIED, and the preflight is the whole story

`183_order_shipped_notification.sql` enqueues `kind=order_shipped` when an
order transitions INTO `fulfilled`. A trigger and not application code because
`fulfilled` has at least three writers, and an enqueue in one of them silently
skips the others.

**The file would have broken account deletion if applied verbatim.** It restated
`notification_outbox_kind_check` in full, the style 121 established, from a
twelve-name list plus `order_shipped`. Read off production 2026-09-09, the live
constraint already carried **fourteen** names, including `account_deleted` from
150's lineage. `DROP CONSTRAINT` + `ADD CONSTRAINT` with the shorter list would
have dropped `account_deleted` and turned every account-deletion notification
into a 23514. `account_deleted` was added to the file before it was applied, and
the live constraint still carries all fourteen. **A restated list is only ever as
current as the day it was written**, which is exactly what 155 already knew: it
carries a `RAISE EXCEPTION` refusing to run if the check has no `account_deleted`
yet. 183 had no such guard.

**Applied** as `order_shipped_notification_183`, then proven in a transaction
that was rolled back (`notification_outbox` reads 0 rows before and after,
orders still `cancelled=2, paid=2`):

```
paid -> fulfilled                   1 row enqueued
UPDATE on an already-fulfilled row  still 1
bounce out and back                 refused by the 137 guard anyway
                                    (fulfilled -> partially_fulfilled illegal),
                                    count held at 1
dedupe_key    order-shipped:<order uuid>
payload       order_id, order_ref D3A5AA99, item_count 1, fulfilled_at,
              customer_name (Hebrew, resolved from profiles)
```

**A second finding, recorded rather than fixed.** The constraint accepts
`account_deleted` and **no builder renders it** — there is no
`buildAccountDeletedEmail`, so `buildNotification` returns null and the drain
would park such a row forever. Nothing enqueues it today
(`src/server/actions/account.ts` deliberately sends no goodbye mail), so it is a
loaded gun on the shelf rather than a fire. It is now tracked as
`CHECK_ACCEPTS_BUT_RENDERS_NOTHING` in `src/lib/email/outbox-kinds.test.ts`, with
an inverted assertion so the list cannot rot: write the builder and the test goes
red asking for the name to be moved. The stale comment in `account.ts` — which
said the constraint was what blocked the goodbye mail — now says what actually
blocks it.


## 2026-09-09: 181 APPLIED, as 181a + 181b

**181 was the only security file left in the queue and it was NOT applied**,
which took reading a comment to establish. Both functions it touches,
`is_support()` and `enforce_profile_privilege_columns()`, already exist in
production from the 053/090 lineage, so a probe that asks "does the name exist"
calls 181 applied and drops a live hardening out of the queue. What settled it
is the comment production reported on the trigger function (still the pre-181
text) and the absence of the `profiles_super_admin_mfa` policy.

**The hole was real and was read off production, not inferred.** The deployed
`enforce_profile_privilege_columns` body was literally
`IF public.is_admin() THEN RETURN NEW; END IF;` with nothing between it and the
return, so any admin could grant themselves or anyone else `super_admin`
through the user client. The "only super_admin grants admin roles" rule existed
only in application code on the service-role path.

**Split in two on the way in**, the shape production already recorded for 135
(`135a` the enum, `135b` everything using it):

| File | Applied as | What |
| --- | --- | --- |
| `181a_read_only_enum.sql` | `read_only_enum_181a` | `ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'read_only'`, alone |
| `181b_admin_rbac_hardening.sql` | `admin_rbac_hardening_181b` | `is_support()` learns the new value; the admin-tier ladder on the guard; the RESTRICTIVE `profiles_super_admin_mfa` policy |

An enum member is permanent — PostgreSQL cannot drop one — so the split buys a
safe stopping point: 181a on its own is inert, referenced by no policy and no
function until 181b lands. It also removes the same-transaction hazard entirely
rather than dodging it with `role::text` comparisons.

**PROVEN in a transaction that was then rolled back**, so production kept no
probe rows (`profiles` reads 9 customer + 1 super_admin before and after).
Acting as the real super_admin with an `aal1` claim, which is that account's
actual session shape today:

```
self role change              -> cannot change your own role
grant admin from aal1         -> admin-tier role changes require an
                                 MFA-verified session (aal2)
service-role path (uid NULL)  -> succeeded, and assigned 'read_only',
                                 which also proves 181a's member is usable
```

**THE ONE THING 181 DID NOT KNOW, and the operator should.** Production holds
exactly one super_admin and it has **no verified MFA factor** (zero rows in
`auth.mfa_factors` with `status = 'verified'`). So the file's claim that "a
super_admin's session is aal2 in practice" was not true: it is aal1, because no
factor exists at all. Until that account enrols TOTP it cannot UPDATE its own
`profiles` row through the user client — `updateProfile` in
`src/server/actions/account.ts` (full_name, phone) is the only such path.

That was checked for a deadlock and there is none: enrolment runs entirely
through `supabase.auth.mfa.enroll/challenge/verify` and writes to
`auth.mfa_factors`, never to `profiles`, so the policy cannot block the ceremony
that lifts it. And `enforceSuperAdminMfa` in `src/lib/admin/rbac.ts` already
redirects that account away from every admin page to `/admin-mfa?mode=enrol`,
so this adds no lockout that was not already there.

**No recursion, checked rather than assumed.** The RESTRICTIVE policy on
`profiles` calls `current_user_role()`, which selects FROM `profiles` — the
shape 077 had to undo. It is safe only because the deployed function is
SECURITY DEFINER (`prosecdef = true`, read off production), so its own read
bypasses RLS and never re-enters the policy. If anyone makes it INVOKER, this
policy deadlocks every authenticated `profiles` UPDATE.

**Follow-up, not blocking:** `src/types/database.ts` is now stale on
`user_role` — production has `read_only` and the generated type does not.
`src/lib/admin/roles.ts` carries `AppRole = UserRole | 'read_only'`, which is
still load-bearing and self-healing: regenerate the types and the union
collapses to `UserRole` with no type error.


## 2026-09-09: the numbering was a tangle, and it was measured, not guessed

**`pending/` held two 170s and two 171s.** Two sessions that could not see each
other each picked the next free number, and one of each pair had already been
applied to production five days earlier. "Apply 170" was an ambiguous
instruction, which is the worst thing a migration number can be. Every pending
file was therefore probed against production for the objects it creates, and
the directory was rearranged to match the answer rather than the other way
round.

| File | Probe against production | Verdict |
| --- | --- | --- |
| `169_audit_full_coverage.sql` | `audit_log_trigger_fn`, `idx_audit_log_request_id`, trigger `audit_orders` all present; `audit_full_coverage_169` (`20260904001341`) | applied → moved to `applied/` |
| `170_reporting_tables.sql` | the 4 `report_*` tables + all 6 RPCs present; `reporting_tables_170` (`20260904003703`) | applied → moved to `applied/` |
| `171_search_fts.sql` | `products_search_vector_gin` + `coupon_deals_search_vector_gin`, `search_products`, `fts_prefix_query`, `fts_unaccent`, `fts_join` present; `search_fts_171` (`20260904005239`) | applied → moved to `applied/` |
| `172_rls_zero_policy_tables.sql` | all ten policies present, and zero public tables now carry RLS with no policy; `rls_zero_policy_tables_172` (`20260904010757`) | applied → moved to `applied/` |
| `182_coupon_qr_batches.sql` | `coupon_qr_batches` + `coupon_qr_codes` present; `coupon_qr_batches_182` (`20260907163213`) | applied → moved to `applied/` |
| `186_composite_indexes_top_queries.sql` (was 170) | 0 of its 10 index names existed | **not applied** → renumbered **186**, then applied (below) |
| `187_category_name_shekel_order.sql` (was 171) | `categories.name_he` for `under-99` still read `עד ₪99` (codepoints `1506,1491,32,8362,57,57`) | **not applied** → renumbered **187**, then applied (below) |
| `184_orders_monthly_partitioning.sql` (was 148) | `orders_flat`, `orders_invoice_numbers` absent | not applied → renumbered **184** |
| `185_soft_delete_user_facing_remainder.sql` (was 149) | none of its 4 `deleted_at` indexes exist | not applied → renumbered **185** |
| `173`, `177`, `178`, `179`, `183` | every table, function and trigger they create is absent | not applied, numbers unchanged |
| `181_admin_rbac_hardening` (now `181a`+`181b`) | `profiles_super_admin_mfa` absent, and `enforce_profile_privilege_columns` still carries its **pre-181** comment | not applied at the time, number unchanged; **applied later the same day**, see the top of this file |

**181 is why the probe reads comments and not just names.** Both functions it
touches (`is_support`, `enforce_profile_privilege_columns`) exist in production
already, from the 053/090 lineage. A probe that asked only "does the name
exist" would have called 181 applied and moved a live security hardening out of
the queue. What settles it is the function's own comment, which production
still reports without the admin-tier ladder 181 adds, and the RESTRICTIVE
policy it creates, which is absent.

**Why the unapplied file is always the one that moves.** A number production
has spent cannot be reclaimed by renaming a file — `supabase_migrations.schema_migrations`
already means something by it. So 148, 149, 170 and 171 stayed with their
applied owners and the four squatters became 184, 185, 186 and 187. Their
headers carry the rename and the reason.

**The test that should have caught this now exists.** The only numbering
assertion in `src/__tests__/pending-migrations-inventory.test.ts` compared
`pending/` + `applied/` against `supabase/migrations/` and never compared the
two named directories against each other, so a collision in the exact place the
file is named after went unseen for five days. `lets no unapplied migration
squat on a number production has spent` closes it. Duplicates *inside*
`applied/` stay legal and are documented: production genuinely spent 169 twice
and 172 twice.

## 2026-09-09: 186 and 187 APPLIED

**`186_composite_indexes_top_queries.sql`** applied via MCP as
`composite_indexes_top_queries_186`. `preflight_186.sql` ran first against
production and all four blocks passed: none of the ten index names existed, all
fourteen columns were present with the expected types, `product_status` carried
`active`, and no existing index already covered a pattern. All ten indexes were
read back afterwards and every `indexdef` matches the file. Expand-only —
`CREATE INDEX IF NOT EXISTS` and nothing else, no drops, no data changes.

**`187_category_name_shekel_order.sql`** applied via MCP as
`category_name_shekel_order_187`. One row, one text column, matched on the exact
broken string. Before: `1506,1491,32,8362,57,57` (sign before digits, no
isolate). After: `1506,1491,32,8294,57,57,160,8362,8297` — `עד ` then
U+2066 LRI, `99`, NBSP, `₪`, U+2069 PDI, which is exactly what `isolate()` in
`src/lib/money-format.ts` emits for every other price on the site. No other
`categories` row still matches the broken shape. `repairPriceOrder` rewrites
only `₪<digits>`, so it now leaves this name untouched and the datum and the
render agree. Rollback is at the foot of the file.


## 2026-09-04: 172 added — a test row is on sale for one shekel

`172_hide_master_product_test_row.sql` zeroes the stock on
`מוצר ראשי מאסטר Master Product` (`restaurants-meat-3`), which renders on the
homepage at ₪1 against a ₪400 compare-at price with ten in stock. **Not applied.**

Stock zero rather than a delete: the row may be referenced by an `order_items`
line and deleting it would orphan a historical order. No preflight — one row,
one integer column, and the `where` clause is its own check.

## 2026-09-04: 171 added — the shekel sign in a category name

`187_category_name_shekel_order.sql` rewrites `categories.name_he` for the
`under-99` department from `עד ₪99` to the digits-then-sign form the whole site
now renders, wrapped in an LTR isolate. **Not applied.**

The page does not wait on it: `getAllCategories` repairs the order on read, and
`e2e/price-bidi.spec.ts` measures the rendered geometry at 380/768/1440. The
migration fixes the datum so exports and feeds agree with the page. It has no
preflight because it touches one row of one text column and its own `where`
clause is the check.

## 2026-09-04: two files pending — 162 (blocked on vault) and 169

> The "audit" paragraph below records the file moves; STATE.md's incident
> section (04.09 06:24) records the fuller truth: 166-168 were applied to
> production that morning by a parallel agent without prior approval, and
> Ofir owes a retroactive yes/no. The moves themselves correctly reflect the
> database.

An audit on 2026-09-04 ran every preflight against production and found that
166, 167 and 168 are **already applied and recorded** in
`supabase_migrations.schema_migrations` (versions `20260903232445`,
`20260903232455`, `20260903232504` — 2026-09-03 23:24 UTC), with the live
definitions matching the files byte-for-file (function body, trigger,
constraint expressions, policy set all compared). The three files and their
preflights moved to `migrations/applied/`; their rows joined the APPLIED IN
PRODUCTION table below. Every file in `migrations/applied/` now has a SHA-256
line in `migrations/applied/CHECKSUMS.sha256`
(verify with `cd migrations/applied && shasum -c CHECKSUMS.sha256`).

### `186_composite_indexes_top_queries.sql` — PENDING, not approved

Expand-only composite indexes for the ten hottest query patterns
(ARCHITECTURE-PERFORMANCE §6.3 + measured plans; baselines in
`docs/perf/indexes.md`). `CREATE INDEX IF NOT EXISTS` only, no drops, no
data changes; each pattern matched to the live code path that issues it and
checked non-duplicate against `pg_indexes`. Written by the parallel
autopilot session on 04.09. Preflight: `preflight_186.sql`.

### `169_analytics_server_event_names.sql` — PENDING, not approved

CREATE OR REPLACE of `fn_ingest_analytics_events`, byte-identical to 151's
except the name whitelist, which gains the four `SERVER_EVENT_NAMES` of
`src/lib/analytics/events.ts` (`begin_checkout`, `purchase`,
`voucher_redeemed`, `order_refunded`). 151 shipped with only the eight
client names, and the function skips unknown names by design — so every
server event ever emitted (begin_checkout since the checkout wave, the three
step-14 additions) has been silently dropped. Until this applies they keep
being dropped, harmlessly and documented at the emit sites. Preflight:
`preflight_169.sql` — signature, before-picture of the whitelist,
service_role-only grants.

### `162_cron_schedule.sql` — PENDING, approved (CLOSEOUT §7), blocked on vault

Schedules the twelve jobs of `scripts/cron-jobs.json` through pg_cron + pg_net
(161 installed both). Job commands read `cron_secret` and `app_url` from vault
at run time, so `cron.job.command` stores neither value. BLOCKED: the vault
holds neither secret and seeding them needs the Vercel production env, which
this machine cannot reach (no `vercel` CLI, no link). The exact seeding
commands are under "## חסמים לאופיר" in STATE.md. Preflight:
`preflight_162.sql` — every block must pass through MCP `execute_sql` first.

### `165_revoke_anon_helpers.sql` — CANCELLED 2026-09-04, moved to `migrations/cancelled/`

Would have revoked EXECUTE on `public.is_admin()` and
`public.is_supplier_member(uuid)` from `anon` (CLOSEOUT §8c). Cancelled by
CLOSEOUT §13: the stop-and-think its own preflight flagged came back positive.
Eighteen RLS policies on public/anon-readable tables (product_images,
coupon_deals, suppliers, seo_redirects, cashback_rules, categories, wallet_*,
split_executions, escrow_holds, payments, carts, notification_outbox) call the
helpers inside USING/WITH CHECK; quals run as the caller, so the revoke turns
every anonymous catalogue SELECT into 42501. anon EXECUTE here is **by
design** — the helpers return false for a caller with no uid. Regression net:
`src/db/__tests__/anon-catalog.test.ts`. The file and `preflight_165.sql` live
in `migrations/cancelled/` with the reason at the top.

### `166_voucher_transition_guard.sql` — APPLIED, verified 2026-09-04 (moved to `migrations/applied/`)

BEFORE UPDATE trigger on `public.vouchers.status`, in 137's idiom. Closes the
gap VOUCHER-LIFECYCLE.md §1 records: 137 guards orders/order_items/payments
and never covered `vouchers`, so a service_role statement can un-redeem a
burned voucher and let it be collected twice. Allows exactly the four
`issued -> redeemed | expired | cancelled | refunded` moves; every non-issued
state is terminal by design (value restored later is a wallet credit, not a
state change). No-op updates, INSERTs and NULLs pass untouched. Preflight:
`preflight_166.sql` — enum labels, column type, no existing trigger, row
counts per status.

### `167_order_items_money_constraints.sql` — APPLIED, verified 2026-09-04 (moved to `migrations/applied/`)

Sign constraints (`col IS NULL OR col >= 0`) on the eight agorot columns of
`order_items` that carry none — balance_due, cashback_amount, commission,
escrow_held, escrow_release, face_value, paid_on_site, supplier_immediate —
plus the conservation CHECK `face = paid_on_site + balance_due` (NULL on any
side passes; pre-070 rows keep moving). Both are BUSINESS-RULES §10 entries:
stated rules nothing refuses to break. The JS half shipped first
(`assertOrderItemMoneyInvariants` in `src/lib/commerce/order-money-columns.ts`
throws on every insert path), so the running writer cannot produce a violating
row and the apply is safe for it. Refuses rather than corrupts, like 126: ADD
CONSTRAINT validates all rows and raises on a violator. Preflight:
`preflight_167.sql` — columns exist, names free, zero negative rows, zero
non-conserving rows, table scale.

### `168_wallet_ledger_client_readonly.sql` — APPLIED, verified 2026-09-04 (moved to `migrations/applied/`)

Drops the six authenticated INSERT/UPDATE/DELETE policies on
`wallet_balances` and `wallet_transactions` (marathon step 6). Measured live
on 04.09: the write policies are gated on `is_admin()`, which is the wrong
door — an admin's browser session can write ledger rows directly, a money
movement with no audit_log row. Every code path that touches the tables
(admin user page, apps/mobile wallet screen) is SELECT-only, so nothing
running loses anything; service_role bypasses RLS and the audited server
writers are untouched. The two SELECT policies (admin/support/owner) stay.
Live regression net: `src/db/__tests__/wallet-rls.test.ts` (anon half; the
full per-role matrix is marathon step 10). Preflight: `preflight_168.sql`.

## 2026-09-03: every row below is APPLIED (history)

### `159_pin_search_path_and_revoke_enqueue.sql` — APPLIED 2026-09-03

Applied to production through MCP alongside 158 and verified. Pins
`search_path = pg_catalog, public` on `set_updated_at`, `add_business_days`,
`payout_available_at` and `enforce_payout_availability`, and revokes EXECUTE on
`enqueue_search_index()` from `public`/`anon`/`authenticated`.

The number 159 briefly belonged to the pending orders-indexes file; that one was
renamed the same day (its second rename -- it arrived as `005`), and ended at
`163_orders_indexes.sql`: `160_fk_indexes.sql` and `161_enable_pg_cron_pg_net.sql`
were both applied to production on 2026-09-03, and `162` is reserved for the cron
schedule those two make possible. **New migrations start at 164.**

### `160_fk_indexes.sql` — APPLIED 2026-09-03

Applied to production through MCP and verified. Ten `create index if not
exists` statements covering foreign keys that had no index behind them:
`payment_events.actor_id`, `payout_statements.approved_by`, three on `refunds`
(`decided_by`, `payment_id`, `requested_by`), two on `reviews` (`reviewed_by`,
`user_id`), two on `subscriptions` (`origin_order_id`, `payment_token_id`) and
`wishlists.product_id`.

Every statement is `if not exists`, so re-running it is a no-op. There is no
rollback row because dropping an index that supports a foreign key is not a
restoration of anything: `drop index if exists public.<name>;` per line, if one
is ever actually wanted.

**This is the file that pushed the orders-indexes migration off 160.**

### `161_enable_pg_cron_pg_net.sql` — APPLIED 2026-09-03

Applied to production through MCP and verified. Enables `pg_cron` (schema
`pg_catalog`, version 1.6.4) and `pg_net` (schema `extensions`, version 0.20.0),
then grants `usage on schema cron` to `postgres`.

The schemas are read off production, not chosen: `pg_cron` lives in whatever
schema it was installed into and cannot be moved, so naming a different one
would make the file describe a database that does not exist.

**Why both, and why the grant.** `pg_cron` schedules but cannot make an outbound
request; `pg_net` supplies `net.http_post`, which is what lets a job reach a
Vercel route. The grant is what lets `postgres` call `cron.schedule` at all --
without it, `162` fails on its first statement.

This migration is what closes the standing GO/NO-GO blocker recorded in
`STATE.md`: the cron routes existed and nothing in the world called them.
Verified at the time of writing: `select count(*) from cron.job` returned **0**,
so no job is scheduled yet -- that is `162`, which is pending.

### `163_orders_indexes.sql` — APPLIED 2026-09-03

Written by a parallel agent session (commit `fbdd8e1f5`) alongside Drizzle
schemas at `src/db/schema/orders.ts` and `order-items.ts`. Creates `orders` and
`order_items` guarded by `IF NOT EXISTS`, plus three indexes on
`orders(user_id)`, `orders(created_at)` and `order_items(created_at)`.
**Applied to production through MCP on 2026-09-03 and verified.** Both tables
were already live, so the CREATEs no-opped and the net effect was the three
indexes, exactly as the file header predicted.

**It arrived numbered `005` and was renamed twice.** `supabase/migrations/`
already holds `005_products_schema.sql`, so the original name meant two different
things in the two directories, and `005` sorted ahead of the entire 122-158 applied
series -- every member of which already assumes these two tables exist. The
numbering assertion in `pending-migrations-inventory.test.ts` is what caught it.
The later renames, `160` -> `163`, are the same rule once more: `160_fk_indexes.sql`
and `161_enable_pg_cron_pg_net.sql` went to production on 2026-09-03 and `162` is
reserved for the cron schedule, and a number that names both an applied file and an
unapplied one is the exact confusion this directory keeps paying for.

The file itself is honest about the rest: its header records that both tables
are already live on the hosted DB, so every `CREATE` is guarded and the net
effect on production is the three indexes. `APPLY-ORDER.md` does not list it.

---

## Every row below is APPLIED.

### `158_revoke_anon_public_on_new_functions.sql` — APPLIED 2026-09-03

Applied to production through MCP by the cloud session and verified
(`anon_exec` 3, `migrations` 111). The file now lives in `migrations/applied/`.

Revokes `EXECUTE` from `public`, `anon` and `authenticated` on ten functions
added by 130/131/137/149/152/157 and by `118_search_intelligence`, in an
idempotent `DO` loop. All ten were confirmed to exist before the file was
written. **Not applied.**

**TWO THINGS THAT ARE NOW LIVE IN PRODUCTION.** Both were raised before the
file was applied and neither was changed, so both are in effect now. Neither is
a crash; both are silent. They are recorded here so the next person to see the
symptom does not have to rediscover the cause.

1. **`fn_record_recent_search(text)` has a live `authenticated` caller.**
   `118_search_intelligence.sql` grants it to `authenticated, service_role` on
   purpose, and `src/lib/search/record.ts:52` calls it **with the visitor's own
   client** (`recordRecentSearch(client, term)`), from
   `src/app/(store)/search/page.tsx`. Revoking `authenticated` stops that RPC.
   It fails soft -- the caller logs `search.recent_record_failed` and returns --
   so nothing crashes and nothing tells you: recent-search recording just stops
   for signed-in users. This is the same situation that got `supplier_app_context`
   withdrawn from 143. **To restore it:**
   `GRANT EXECUTE ON FUNCTION public.fn_record_recent_search(text) TO authenticated;`

2. **`add_business_days` and `payout_available_at` rely on the default `PUBLIC`
   grant.** `152_payout_machinery.sql` contains no `GRANT` for either, and both
   are plain `STABLE` functions, not `SECURITY DEFINER`. Revoking from `PUBLIC`
   therefore removes the only grant they have. Anything that calls them and is
   not the owner -- including `service_role`, which the cron and repair paths
   run as -- gets `permission denied`. **To restore it:**
   `GRANT EXECUTE ON FUNCTION public.add_business_days(timestamptz, integer) TO service_role;`
   and the same for `public.payout_available_at(timestamptz)`.

**The automated gate does not cover this file.**
`src/__tests__/revoked-functions-have-no-callers.test.ts` finds revokes with
`/REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.(\w+)/`. This migration builds
its statement with `format('... %s ...', f)`, so the literal never appears and
the scanner matches nothing. Both findings above were established by hand.

---

## The rows below are APPLIED

All thirty-four files listed in this README were applied to production through
MCP `apply_migration` on 2026-09-03 and moved to **`migrations/applied/`**. The
rows stay here because this README is still the only written description of what
each migration does, and the number sequence has to stay readable. To find a
file named below, look in `migrations/applied/`.

**Nothing is awaiting approval right now.** A newly written migration goes back
into this directory and is listed as pending again.

`pnpm test` enforces both halves: `pending-migrations-inventory.test.ts` asserts
this directory holds no `.sql`, and that every row below resolves to a file in
`applied/`.

---

Unapplied migrations live here. **Nothing placed in this directory has been run
against any database.** Nothing here may be applied with `db push` — the project
forbids it. The route to production is `apply_migration` through MCP, after Ofir
approves the file.

## This is now the only pending location

`supabase/migrations/` holds applied production migrations only. The three
`PENDING-` files that used to sit there were moved here on 2026-09-01 and
renumbered into the sequence below:

| was | is now |
| --- | --- |
| `supabase/migrations/PENDING-109-recurring-subscriptions.sql` | `135b_recurring_subscriptions.sql` |
| `supabase/migrations/PENDING-110-supplier-coordinates.sql` | `136_supplier_coordinates.sql` |
| `supabase/migrations/PENDING-money-integer-fix.sql` | superseded; the in-place path was deleted 2026-09-01, see DECISIONS |

Every reference to the old paths across `src/`, `apps/`, `docs/`, `scripts/`
and the root `*.md` files was rewritten in the same commit. There is no second
location left to read.

## Numbering

`120` and `121` were each used twice, in two directories, with two different
meanings. That is fixed: every file here was renumbered from **122 upward**,
skipping `128` and `129`, which are taken by
`supabase/migrations/128_wp_publish.sql` and `129_catalogue_cleanup.sql`.
Highest number applied in production is `129`. No number now repeats across the
two directories.

## RESOLVED 2026-09-01: the additive path (138-141) won. 142 is deleted.

Both convert money to integer agorot and they collide.

- **138-141 (recommended)** are *additive*: they add a `<col>_agorot bigint`
  beside each numeric column, `GENERATED ALWAYS AS (round(<col> * 100)::bigint)
  STORED`, so it can never drift from the column it mirrors. Applying them is a
  no-op for the running application, and they are reversible with a
  `DROP COLUMN`.
- **142** converts *in place*, renaming `total_ils` → `total_agorot` and
  changing its type. The moment it lands, every reader that still says
  `total_ils` breaks, and every reader that does not gets a number 100× larger.

They produce **9 identical column names** on the same tables, so applying 142
after 138-141 fails outright with "column already exists":

```
coupon_deals.original_price_agorot     products.compare_at_price_agorot
coupon_deals.platform_price_agorot     products.full_price_agorot
coupons.original_price_agorot          products.kenyon_price_agorot
product_variants.price_agorot          profiles.wallet_balance_agorot
product_variants.price_modifier_agorot
```

and a further 23 columns where the names differ only by an `_ils` infix
(`orders.total_ils_agorot` from 138 vs `orders.total_agorot` from 142), which
would leave the table carrying two agorot columns for one amount.

**Decision, taken 2026-09-01 and logged in `docs/DECISIONS.md`:** the additive
path is the production-safest option, so 138-141 are in the apply order and
**142 is parked**. It is kept, not deleted, because it is the only written
description of the eventual in-place end state, and because the decision to
abandon it belongs to Ofir.

### 142 was verified against production, and it is not a no-op

An earlier version of this file claimed production already stored money as
integer agorot, and that 142 therefore did nothing. **That claim was false.**
Measured against `ixvwfbuvfxxsjiywhbbb` on 2026-09-01, all **41** columns 142
targets are still `numeric` on real tables (`relkind = 'r'`); none is already
an integer, so none was removed from the file:

```
orders.total_ils        orders.subtotal_ils      orders.discount_ils
payments.amount_ils     payments.wallet_applied_ils
order_items.unit_price_ils  order_items.total_price_ils
products.price_ils      wallet_accounts.balance_ils    ... 41 total
```

The columns that *are* already integer agorot — `order_items.face_value_agorot`,
`vouchers.coupon_price_agorot`, `settlement_events.commission_agorot` and the
rest — are **different columns**, added alongside the numeric ones. That dual
representation is what made the earlier claim look true from a distance.

## The manifest

Blast radius is what breaks if the file is applied while the current code is
running. Order is the position in the apply sequence.

| # | File | What it changes | Blast radius | Order | Prerequisite | Rollback |
| --- | --- | --- | --- | --- | --- | --- |
| 122 | `122_deny_all_on_server_only_tables.sql` | Restrictive `using (false)` policy on the 5 server-only tables | **None.** RLS-on-no-policy is already deny; changes no effective permission | 1 | none | `drop policy if exists deny_all_client_roles on public.<each of the 5>;` |
| 123 | `123_products_whatsapp_enabled.sql` | `products.whatsapp_enabled boolean not null default false` + partial index | **None.** Defaults false, so no product changes behaviour | 2 | none | `drop index if exists public.products_whatsapp_enabled_idx; alter table public.products drop column if exists whatsapp_enabled;` |
| 124 | `124_categories_sort_order.sql` | One `UPDATE`: `electronics` `sort_order` 10 → 12 | **Cosmetic.** Fixes a tie that made category order planner-dependent | 3 | none | `update public.categories set sort_order = 10 where slug = 'electronics';` |
| 125 | `125_expire_vouchers_drop_escrow.sql` | Replaces `expire_vouchers()`, dropping its last escrow branch | **Low.** Escrow model already abolished in 085; this finishes it | 4 | migration 085 (applied) | Restore the prior body from `supabase/migrations/085_voucher_scan_audit_and_no_escrow.sql` |
| 126 | `126_percent_range_checks.sql` | `CHECK (0..100)` on 12 unconstrained percent columns | **Low.** Fails at apply time only if a row is already out of range | 5 | none | `alter table public.<t> drop constraint if exists <t>_<col>_range;` (12 statements, listed in the file) |
| 127 | `127_homepage_cms.sql` | `banners`, `homepage_sections`, RLS policies, scheduling windows | **None.** Readers treat absence as normal and fall back to `src/lib/hero-singlefile-data.ts` | 6 | none | `drop table if exists public.banners, public.homepage_sections cascade;` |
| 130 | `130_payment_events.sql` | `payment_events` append-only table, `payment_event_type` enum, no-mutation trigger | **None.** New table, no existing reader | 7 | none | `drop trigger if exists payment_events_no_mutation on public.payment_events; drop function if exists public.payment_events_append_only(); drop table if exists public.payment_events; drop type if exists public.payment_event_type;` |
| 131 | `131_refunds.sql` | `refunds` table, `refund_state` + `refund_ground` enums | **None.** Holds no money truth; `payments` stays authoritative | 8 | 130 (shares the payment vocabulary) | `drop table if exists public.refunds; drop type if exists public.refund_state; drop type if exists public.refund_ground;` |
| 132 | `132_search_index_outbox.sql` | `search_index_outbox`, enqueue trigger on `products`, `claim_search_index_jobs()` | **Low.** Adds a trigger to `products`; every product write now also writes an outbox row | 9 | none | `drop trigger if exists products_enqueue_search_index on public.products; drop function if exists public.enqueue_search_index(); drop function if exists public.claim_search_index_jobs(integer); drop table if exists public.search_index_outbox;` |
| 133 | `133_supplier_branches.sql` | `supplier_branches` table | **None.** Changes no money and no authorisation; a voucher still redeems against `suppliers.id` | 10 | none | `drop table if exists public.supplier_branches;` |
| 134 | `134_order_items_delivered_at.sql` | `order_items.delivered_at`, physical-only constraint, `order_item_cancellation_deadline()` | **Low.** Nullable column; the deadline function is new | 11 | none | `drop function if exists public.order_item_cancellation_deadline(uuid); drop index if exists public.order_items_delivered_at_idx; alter table public.order_items drop constraint if exists order_items_delivery_is_physical_only, drop column if exists delivered_at;` |
| 135 | `135b_recurring_subscriptions.sql` | `recurring` enum member, `subscriptions`, `subscription_charges`, 3 billing columns on `products` | **Medium.** `ALTER TYPE ... ADD VALUE` cannot run inside a transaction block and cannot be rolled back | 12 | none | Tables and columns drop cleanly; **the `recurring` enum member is permanent** — Postgres cannot remove an enum value |
| 136 | `136_supplier_coordinates.sql` | `suppliers.latitude`/`.longitude`, GiST index, pair CHECK | **None.** `supplierLocation()`'s exact branch is dead code until the columns exist | 13 | `cube` + `earthdistance` extensions | `drop index if exists public.suppliers_earth_idx; alter table public.suppliers drop constraint if exists suppliers_latlng_pair, drop column if exists latitude, drop column if exists longitude;` |
| 137 | `137_order_transition_guard.sql` | Status-transition guard triggers on `orders`/`vouchers`/`payments`, immutable `audit_log` | **Medium.** Constrains the service role, which every cron, webhook and repair script runs as. An illegal transition that used to succeed now raises | 14 | 130, 131, 134 (guards reference their statuses) | `drop trigger if exists audit_log_no_delete on public.audit_log; drop trigger if exists audit_log_no_update on public.audit_log; drop trigger if exists vouchers_status_guard on public.vouchers; drop trigger if exists payments_status_guard on public.payments; drop trigger if exists orders_status_guard on public.orders;` (+ the 6 guard functions) |
| 138 | `138_money_agorot_money_path.sql` | Adds a **generated** `_agorot` beside numeric on `orders`, `order_items`, `payments` | **None at apply.** Additive and unwritable. The `>= 0` checks become live on the numeric column's sign | 15 | none | `alter table public.orders drop column if exists subtotal_ils_agorot, drop column if exists total_ils_agorot, drop column if exists discount_ils_agorot;` (+ `order_items`, `payments`) |
| 139 | `139_money_agorot_wallet.sql` | Adds a **generated** `_agorot` on `wallet_accounts`, `wallet_balances`, `wallet_entries`, `wallet_transactions` | **None.** Additive. No `>= 0` check on balances: `wallet_accounts.balance_ils` has a live minimum of −1.80 | 16 | 138 | `alter table public.wallet_accounts drop column if exists balance_ils_agorot;` (+ the other 3 tables) |
| 140 | `140_money_agorot_catalog.sql` | Adds a **generated** `_agorot` on `products`, `product_variants`, `coupon_codes`, `coupon_deals`, `coupons` | **None at apply.** Additive. `price_modifier` stays signed — a variant may be cheaper than its base | 17 | 138 | `alter table public.products drop column if exists price_ils_agorot, drop column if exists coupon_price_ils_agorot, drop column if exists cost_ils_agorot, drop column if exists full_price_agorot;` (+ the other 4 tables) |
| 141 | `141_money_agorot_growth.sql` | Adds a **generated** `_agorot` on `affiliates`, `referrals` | **None at apply.** Additive. Both are cumulative earnings, so both take the non-negative check | 18 | 138 | `alter table public.affiliates drop column if exists total_earnings_ils_agorot; alter table public.referrals drop column if exists bonus_paid_amount_ils_agorot;` |
| 143 | `131_refunds.sql` | `20260901013505` | `131_refunds` | `refunds` table + trigger `refunds_due_by_is_derived` |
| `132_search_index_outbox.sql` | `20260901013525` | `132_search_index_outbox` | `search_index_outbox` + trigger `products_enqueue_search_index` |
| `133_supplier_branches.sql` | `20260901013612` | `133_supplier_branches` | `supplier_branches` + 3 policies |
| `143_revoke_unused_definer_execute.sql` | Revokes `EXECUTE` on 5 SECURITY DEFINER functions from `anon`/`authenticated` | **Medium.** Closes a live RLS bypass in `voucher_success_payload`. `supplier_app_context` was withdrawn from this file — the Expo till calls it | 19 | `src/__tests__/revoked-functions-have-no-callers.test.ts` green | `GRANT EXECUTE ON FUNCTION public.<fn> TO anon, authenticated;` (5 statements, listed in the file) |
| 144 | `144_revoke_authenticated_dml.sql` | Revokes INSERT/UPDATE/DELETE from `authenticated` on the 8 RLS-on-zero-policy tables | **Low.** Defence in depth; RLS already blocks these, but RLS does not cover `TRUNCATE` | 20 | 122 (same 5 tables, policies first) | `GRANT INSERT, UPDATE, DELETE ON public.<t> TO authenticated;` (8 statements, listed in the file) |
| 145 | `145_revoke_check_rate_limit_execute.sql` | Revokes `EXECUTE` on `check_rate_limit` from `anon`/`authenticated` | **HIGH IF MISORDERED.** See below | **21 — LAST** | ⛔ **CODE-FIRST: commit `d5c2739d4`** | `GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO anon, authenticated;` |
| 184 | `184_orders_monthly_partitioning.sql` | Converts `orders` to monthly range partitions on `created_at`; PK becomes `(id, created_at)`, 16 referencing tables gain a trigger-filled twin column and composite FKs | **HIGH.** Structural conversion of the busiest financial table; apply only in a maintenance window, details in the file header | after 137 | pg_cron (installed) | in file header |
| 188 | `188_pin_invoker_search_path.sql` | `SET search_path = ''` on the three functions Supabase's `function_search_path_mutable` lint reports: `set_updated_at`, `fn_cashback_ledger_block_mutation`, `fn_il_phone_digits` | **None, and not the escalation the advisor's name suggests.** All three are `SECURITY INVOKER` (read from `pg_proc.prosecdef`), so the body runs as the caller with the caller's own path and shadowing a name buys nothing; the 61 `SECURITY DEFINER` functions all pin it already. Applied anyway so the count is zero rather than three-with-a-reason. Verified without applying: all three ran inside one `DO` block ending in an unconditional `RAISE`, it parsed, and the pinned `fn_il_phone_digits` returned `972541234567`/`972541234567`/`NULL` for the file's three inputs; `proconfig` re-read afterwards is still `(none)` | any | none | re-run the three `CREATE OR REPLACE` without the `SET search_path` clause (bodies are verbatim in the file) |
| 185 | `185_soft_delete_user_facing_remainder.sql` | `deleted_at` + partial index + RLS select filters on `categories`, `product_images`, `reviews`, `wishlists`; splits `wishlists_owner_all` into four per-command policies | **Low.** Additive column; policies only narrow client reads. Service-role call sites are gated by `src/lib/soft-delete.ts`, whose pending list is flipped to live after apply | any | none | in file header |
| 169 | `169_audit_full_coverage.sql` | `audit_log` before/after/request_id columns, `entity_id` uuid→text, generic trigger v2 on every financial and user table | **✅ APPLIED 2026-09-04** via MCP as `audit_full_coverage_169`, on the explicit instruction of the /goal that requested it. Validated first against production inside a rolled-back DO block (snapshots, header capture, ip parsing all probed), then applied; 34 audit triggers verified after. The file stays here as the record, like 122-147 | any | none | in file header |
| 170 | `170_reporting_tables.sql` | 4 denormalized reporting tables (`report_revenue_daily`, `report_orders_daily`, `report_top_products`, `report_cohort_retention`), nightly `pg_cron` rebuild at 01:30 UTC, 5 admin-only definer RPCs gated on `is_admin()` | **✅ APPLIED 2026-09-04** via MCP as `reporting_tables_170`, on the explicit instruction of the /goal that requested it. Validated first end-to-end inside a rolled-back transaction (full refresh over real orders), then applied; row counts, the cron job and the 42501 deny path for a non-admin were verified after. New tables only, no existing reader | any | none | in file header |
| 171 | `171_search_fts.sql` | Hebrew FTS: `unaccent` extension, generated `search_vector` tsvector (config `simple`) + GIN index on `products` and `coupon_deals`, INVOKER `search_products` RPC (prefix tsquery, ts_rank, anon-callable) | **✅ APPLIED 2026-09-04** via MCP as `search_fts_171`, on the explicit instruction of the /goal that requested it. Validated first inside a rolled-back DO block (Hebrew word match, reversed-order prefix query, punctuation-only input, anon RLS path, GIN plan), then applied; 80 product + 8 deal vectors and both indexes verified after. Additive columns and new functions only | any | none | in file header |
| 172 | `172_rls_zero_policy_tables.sql` | Explicit policies for the ten RLS-on-zero-policy tables: restrictive `deny_all_client_roles` on `rate_limits`/`user_rate_limits`/`search_index_outbox`, `<t>_admin_read` (`is_admin()`) on `payment_webhook_events`, `ai_usage`, `analytics_events` and the 4 report tables, + `SELECT` grant to `authenticated` on the report tables. Fixes the admin webhooks tab, which read `payment_webhook_events` through the request client and silently got zero rows | **✅ APPLIED 2026-09-04** via MCP as `rls_zero_policy_tables_172` (+ `_report_grants`), on the explicit instruction of the /goal that requested it. Verified after apply with the self-seeding three-persona harness `tests/sql/rls_three_personas.sql` run through MCP in a rolled-back transaction: anon/user/admin assertions all held, incl. cross-tenant denial between two users. Only delta: admins gain SELECT on 7 observational tables; the denies were already the default | any | none | in file header |
| 178 | `178_webauthn_credentials.sql` | Passkey (WebAuthn) credentials: `webauthn_credentials` (one row per registered authenticator: base64url credential id as PK, COSE public key, signature counter, transports, device type, backup flag, friendly name; FK to `auth.users` because phone-only accounts have no lazy `profiles` row yet). RLS: select-own + delete-own for `authenticated`, no INSERT/UPDATE policy so writes happen only through the service role after `verifyRegistrationResponse`/`verifyAuthenticationResponse` prove the ceremony. Challenges are not stored: they travel in an HMAC-sealed httpOnly cookie (`src/lib/auth/passkeys/challenge.ts`) | **Low.** One new table; touches nothing existing. Callers tolerate absence: login/register actions and `/account/security` answer "not available yet" on 42P01/PGRST205 (`isMissingPasskeyRelation`) | any | none | in file header |
| 180 | `180_analytics_server_event_names.sql` | `CREATE OR REPLACE` of `fn_ingest_analytics_events`, byte-identical to the deployed body except the name whitelist, which gains the four server names of `SERVER_EVENT_NAMES` (`begin_checkout`, `purchase`, `voucher_redeemed`, `order_refunded`). Until it applies, every server-side money event is silently discarded by the deployed eight-name list (verified against production 2026-09-07); PostHog receives them regardless through the fan-out in `src/server/analytics/track.ts` | **None.** Function replacement only; no table, grant, or policy changes. Unknown names are still skipped, so a rollback loses nothing already stored | any | none | in file header (re-run with the eight-name list) |
| 179 | `179_push_subscriptions.sql` | Web push subscriptions: `push_subscriptions` (one row per browser that granted notification permission: unique https `endpoint`, browser-minted `p256dh`/`auth` keys as base64url text, optional user agent; FK to `auth.users`, same lazy-profiles reasoning as 178). RLS: select-own + delete-own for `authenticated`, no INSERT/UPDATE policy so rows are written only by the service role in `src/server/actions/push.ts` after the caller is authenticated and the subscription shape validated | **Low.** One new table; touches nothing existing. Callers tolerate absence: the subscribe/remove actions and `/account/notifications` answer "not available yet" on 42P01/PGRST205 (`isMissingPushRelation`) | any | none | in file header |
| 181 | `181a_read_only_enum.sql` + `181b_admin_rbac_hardening.sql` | Admin RBAC hardening: `read_only` enum value on `user_role` (observer tier: sees every panel section through the service-role reads in `permissions.ts`, writes nothing); `is_support()` gains the name so read_only inherits support's whole SELECT surface DB-side; `enforce_profile_privilege_columns()` (the deployed 090 guard; 035's function was measured absent from production 2026-09-07) gains the admin-tier ladder: no self role change, admin-tier grants/revocations only by super_admin, and only with an aal2 (MFA-verified) JWT; RESTRICTIVE `profiles_super_admin_mfa` policy so an aal1 super_admin session updates no profiles row through the user client | **Low.** One permanent enum member, two function replacements on their deployed bodies, one restrictive policy. Behavioral edge: a super_admin editing their own profile through the user client needs an aal2 session once this applies; the rbac.ts gate forces enrol+verify at panel entry, so a super_admin's session is aal2 in practice. Until it applies, assigning `read_only` fails loudly at the enum (`invalid input value`), and MFA is enforced app-side only | any | none | in file header |
| 177 | `177_cashback_ledger.sql` | Cashback ledger: `cashback_ledger` (append-only decision record: entry per item-cashback credit, order-count bonus, admin adjustment; integer agorot, signed; RLS own-read + admin-read, no client writes; UPDATE/DELETE blocked by trigger), `fn_cashback_order_bonus` (first purchase 10%, every fifth purchase 5% of the order total, per-user advisory lock, idempotent on `order:<id>:count_bonus`, pays through `fn_wallet_transfer` from `platform:cashback_reserve`), `fn_cashback_admin_adjust` (signed adjustment, re-checks `is_admin()`, idempotent, records `auth.uid()`). Numbered 177 because 174-176 are taken by files on `closeout/v1-final` | **Low.** All new objects; touches no existing table. Callers tolerate absence: finalize logs-and-continues on 42883, `/admin/cashback` shows a not-installed notice | after 046 (applied); attaches the 169 audit trigger only if present | none | in file header |
| 182 | `182_coupon_qr_batches.sql` | Printed QR coupon batches: `coupon_qr_batches` (one print run per discount campaign) and `coupon_qr_codes` (one 8-digit Luhn-checked unit code each, unique, `redeemed_at` as the per-unit single-use gate). RLS: admin-read only on both, no client writes, no shopper read — a code is validated server-side by the cart, never listed. `redeemed_order_id` is a bare uuid, not an FK, because `orders` is headed for partitioning (184, renumbered from 148) | **✅ APPLIED 2026-09-07** via MCP as `coupon_qr_batches_182` (version `20260907163213`), on the explicit instruction of the /goal that requested it. Additive only: two new tables, no existing object touched. The file stays here as the record, like 169-172 | any | 096 (applied; FK to `discount_campaigns`) | `drop table if exists public.coupon_qr_codes; drop table if exists public.coupon_qr_batches;` |
| 183 | `183_order_shipped_notification.sql` | Shipping notification: widens `notification_outbox_kind_check` with `order_shipped` and adds `tg_orders_notify_shipped`, an AFTER UPDATE OF status trigger that enqueues one customer mail on the transition into `fulfilled` (dedupe `order-shipped:<order_id>`). The renderer (`buildOrderShippedEmail`) is already in `src/lib/email/notifications.ts`, so the drain can render rows the moment this applies. After applying, re-measure the constraint and move `order_shipped` into `CHECK_ACCEPTS` in `src/lib/email/outbox-kinds.test.ts` | **Low.** One constraint widened (additive), one new trigger; the trigger body is EXCEPTION-guarded like its 102 sibling, so a failed enqueue warns and never fails the status UPDATE | any | 095, 102, 114 (all applied) | in file header |
| 173 | `173_whatsapp_flow.sql` | WhatsApp Business flow: `whatsapp_contacts` (consent record, opt-in/opt-out), `whatsapp_outbox` (order-status queue drained by `/api/cron/whatsapp`), `whatsapp_inbound_messages` (Twilio replay protection + audit), `support_tickets` + `support_ticket_messages` (first ticket store; RLS: own-read + staff read/update), `fn_il_phone_digits`, consent-gated `fn_enqueue_whatsapp`, trigger `tg_orders_whatsapp_status` on `orders` (paid/fulfilled/cancelled/refunded) | **Low.** All new tables and functions; the only touch on an existing table is the AFTER UPDATE trigger on `orders`, which enqueues at most one row per (order, kind) and only for phones that opted in, so with zero opted-in contacts it is a no-op. Code paths tolerate the tables not existing (webhook 500s to Twilio's retry, cron reports the read error) | any | none | in file header |

## 138-141 add GENERATED columns, and that is what makes step 2 possible

The first draft added a plain `bigint` and filled it once:

```sql
alter table public.orders add column if not exists total_ils_agorot bigint;
update public.orders set total_ils_agorot = round(total_ils * 100) where ...;
```

Nothing kept it in step after that. No trigger, no default, no NOT NULL. The
running application writes `total_ils` and does not know the new column exists,
so **every order placed after the apply would have carried `total_ils_agorot`
NULL** — and step 2 of the cutover, rewriting the readers onto those columns,
is the entire reason the files exist. A customer who had just paid would have
been shown a total of 0.00, and the split would have settled a commission of
zero against it. The one-shot backfill made the migration look finished while
guaranteeing the step that follows it would be wrong.

All 32 columns are now:

```sql
alter table public.orders
  add column total_ils_agorot bigint
    generated always as (round(total_ils * 100)::bigint) stored;
```

which cannot drift: Postgres recomputes it on every insert and update of the
base column, and refuses any write that names it.

**Measured against `ixvwfbuvfxxsjiywhbbb`, PostgreSQL 17.6, not assumed.** The
generated form tracks insert, update and NULL, `-1.80` yields `-180`, and a
write to the generated column is refused with SQLSTATE `428C9`. The real DDL
for `orders.total_ils` and `product_variants.price_modifier` was then run
against the live tables inside a `DO` block that raises at the end, so it rolled
itself back:

```
DRYRUN_OK cols=1 backfill=[18.00->1800, 18.00->1800, 18.00->1800, 817.00->81700]
leftover_columns = 0
```

**Two consequences worth stating rather than discovering later.**

1. The non-negative CHECKs are no longer decorative. On a backfilled column
   nothing re-evaluated them; on a generated column they are validated on every
   write, so they now constrain the numeric column's sign at runtime. Every
   checked column was measured first and none is negative today, so the apply
   validates. The signed wallet columns still get no check.
2. **Step 3 is no longer a plain `DROP COLUMN`.** A generated column depends on
   its base column, so dropping the numeric one requires
   `ALTER TABLE ... ALTER COLUMN <col>_agorot DROP EXPRESSION` first, which
   turns it into an ordinary written column and keeps the stored values. This
   also hardens the exclusion with 142: 142's `ALTER TYPE` on a base column is
   refused outright while a generated column depends on it.

## ⛔ 145 is CODE-FIRST and it is one-way

**Required commit: `d5c2739d4`** — *"docs: מדריך הזנת דיל חדש (CONTENT-OPERATIONS-GUIDE) (#6)"*.
The title says docs; the commit also carries the change that matters here, in
`src/lib/utils/rate-limit.ts`:

```diff
-import { createClient } from '@/lib/supabase/server'
+import { createAdminClient } from '@/lib/supabase/admin'
-  const supabase = await createClient()
+  const supabase = adminClientOrNull()
```

Also required: **`8e26c3754`** (*"feat(rate-limit): a sliding window on Upstash
behind all thirty callsites, with Postgres as the fallback"*), which relocated
the Postgres fallback call into `src/lib/rate-limit/limiter.ts`. It is still the
same `createAdminClient()` call, so `service_role` still reaches the RPC — but
the callsite moved, and a check of the old path alone would now measure nothing.

Both are ancestors of `origin/main` as of 2026-09-01, so the prerequisite is
**merged**. What remains is that main is *deployed*: verify the running
production build contains `d5c2739d4` before applying 145.

**Why the order is one-way.** Apply 145 while a build older than `d5c2739d4` is
live and the RPC starts returning `42501` to a caller that is still `anon`. The
limiter's fail-open branch catches it, logs, and returns "allowed". Every rate
limit in the application — OTP, cart writes, checkout, search — turns off, and
the only symptom is a log line nobody is watching. That is strictly worse than
the hole 145 closes.

## Reference only — not in the apply order

### `the in-place money migration (deleted 2026-09-01)`

**NOT FOR EXECUTION. Superseded by the additive approach in 138-141. Retained as
the written specification of the eventual in-place end state. Do not apply.**

The same note now stands in the file's own header, so a reader who opens the SQL
without this README sees it too.

| # | File | What it changes | Blast radius | Order | Prerequisite | Rollback |
| --- | --- | --- | --- | --- | --- | --- |
| 142 | `the in-place money migration (deleted 2026-09-01)` | Converts 41 money columns in place, numeric ILS → bigint agorot; rebuilds `fn_wallet_transfer`, `fn_pay_referral`, 2 wallet views | **CATASTROPHIC. PARKED — DO NOT APPLY.** Mutually exclusive with 138-141; ~55 code files still read the old ILS names | — | Abandoning 138-141 **and** rewriting every reader first | Inverse rename + `ALTER TYPE ... USING <col> / 100.0`, plus restoring both functions and both views. **Treat as one-way in practice.** |

It is kept, not deleted, for the reason recorded in `docs/DECISIONS.md`: it is
the only written description of the eventual in-place end state, and the
decision to abandon it belongs to Ofir. `src/__tests__/pending-migrations-inventory.test.ts`
counts it among the files on disk, so deleting it fails that test.


## Apply order

```
122 → 123 → 124 → 125 → 126 → 127 → 130 → 131 → 132 → 133 → 134
    → 135 → 136 → 137 → 138 → 139 → 140 → 141 → 143 → 144 → 145
```

`142` is not in the sequence. It is parked and mutually exclusive with 138-141.

## Inventory is enforced by a test

`src/__tests__/pending-migrations-inventory.test.ts` checks both directions:
every `.sql` on disk appears in this manifest, and every `.sql` this manifest
names exists on disk. It also asserts `supabase/migrations/` contains no
`PENDING-` file, so the split location cannot come back.

`src/__tests__/revoked-functions-have-no-callers.test.ts` re-derives the revoke
list from this directory and checks it against every `.ts`/`.tsx` in **both**
`src/` and `apps/`, so revoking a function the Expo till uses fails a test
rather than a till.

## `185_soft_delete_user_facing_remainder.sql` (was 149), added 2026-09-04

Soft delete for the four user-facing tables that still lack it. Measured
against production 2026-09-04 over MCP: `products`, `product_variants`,
`suppliers`, `user_addresses`, `vendors` and `coupon_deals` already carry
`deleted_at` with RLS filters; `categories`, `product_images`, `reviews` and
`wishlists` have no such column at all. This file adds `deleted_at
timestamptz`, the house partial index, and rewrites the client-facing SELECT
policies so a deleted row disappears for shoppers while admin keeps it for
restore. It also closes a live gap: `product_images` were readable for a
soft-deleted product, because the old policy only checked
`products.status = 'active'`.

**The code side ships first and is safe either way.** Service-role readers
bypass RLS, so their filter lives in `src/lib/soft-delete.ts`, which keeps a
live list (filters now) and a pending list (no-op until this file is
applied — filtering on a missing column is a 42703 that kills the whole
query). After apply: regenerate types, and `src/lib/soft-delete.test.ts`
fails on purpose until the four names move to the live list.

## `184_orders_monthly_partitioning.sql` (was 148), added 2026-09-03

Found on disk unlisted on 2026-09-04 and inventoried then; written by a
parallel session. Converts `orders` to a table partitioned by range on
`created_at`, one partition per UTC month, provisioned twelve months ahead by
pg_cron. The primary key becomes `(id, created_at)`; each of the sixteen
referencing tables gains a trigger-filled `created_at` twin and a composite
FK preserving its ON DELETE semantics and constraint name. Global invoice
uniqueness moves to an `orders_invoice_numbers` registry table. Read the file
header in full before considering apply: it is a structural conversion of the
busiest financial table.

## `147_money_agorot_remaining_twins.sql`, added 2026-09-01

Generated `_agorot` twins for the last four money columns that had none:
`orders.discount_ils`, `orders.cashback_applied_ils`,
`order_items.supplier_payout_ils` and `order_items.cashback_earned_ils`.

They are the four that still convert in JavaScript, in
`src/lib/commerce/order-money-columns.ts`, on a value that has already crossed a
JSON boundary as a string. Everything else in the read path already reads a
twin and lets Postgres do the multiply against the numeric source.

`generated always as (round(<col> * 100)::bigint) stored`, like the 26 already
live: it cannot drift, and Postgres refuses any write that names it (428C9), so
no writer changes and the numeric column stays the source of truth.

**Dry run against production, in a transaction that was rolled back:** all four
were created, all four reported `is_generated = ALWAYS`, and the arithmetic is
right on real rows (17.10 -> 1710, 759.05 -> 75905). Confirmed afterwards that
zero columns of these names exist in production. The nonneg checks are safe on
current data, measured: minimums 0.00, 0.00, 17.10, 0.00, no negatives.

**No reader changes with it.** A select naming a column that does not exist
fails 42703 and takes the whole row with it. The reader moves in a separate
commit after this is applied.

## `146_wallet_balance_floor.sql`, added 2026-09-01

`check (user_id is null or balance_ils >= 0)` on `wallet_accounts`. A customer
wallet may not go negative; a house account may, because it is the funding side
of every cashback pair. The reasoning, and the measurements behind it, are in
`docs/DECISIONS.md`. The migration refuses to run if any user-owned account is
negative when it is applied.

## The 138-141 vs 142 question is closed

Ofir chose the additive path. `the in-place money migration (deleted 2026-09-01)` has been
deleted, not archived: the two paths produce nine identically-named columns on
the same tables, and a file left in a directory called `pending/` is a file
somebody may apply. The reasoning is in `docs/DECISIONS.md`.

## APPLIED IN PRODUCTION — do not apply again

Verified 2026-09-01 by querying the live database for each migration's own
effect, not by trusting this list. The version string is from
`supabase_migrations.schema_migrations`.

| File | Production version | Applied as | Verified by |
| --- | --- | --- | --- |
| `123_products_whatsapp_enabled.sql` | `20260901013104` | `123_products_whatsapp_enabled` | `products.whatsapp_enabled` exists |
| `130_payment_events.sql` | `20260901013413` | `130_payment_events` | `payment_events` table + `payment_events_no_mutation` trigger |
| `134_order_items_delivered_at.sql` | `20260901013122` | `134_order_items_delivered_at` | `delivered_at` + `shipped_at` + `order_item_cancellation_deadline()` |
| `136_supplier_coordinates.sql` | `20260901013134` | `136_supplier_coordinates` | `suppliers.latitude` + `.longitude` |
| `146_wallet_balance_floor.sql` | `20260901013143` | `146_wallet_balance_floor` | constraint `wallet_accounts_user_balance_floor` |
| `143_revoke_unused_definer_execute.sql` | `20260821041759` | `revoke_orphan_security_definer_grants_125` | all 5 target functions have zero anon/authenticated grants |
| `144_revoke_authenticated_dml.sql` | `20260831140841` | `126_revoke_authenticated_dml` | all 8 target tables have zero anon/authenticated INSERT/UPDATE/DELETE |
| `145_revoke_check_rate_limit_execute.sql` | `20260831184356` | `127_revoke_check_rate_limit_execute` | `check_rate_limit` has zero anon/authenticated EXECUTE |
| `166_voucher_transition_guard.sql` | `20260903232445` | `voucher_transition_guard_166` | `tg_vouchers_status_guard` trigger + `fn_vouchers_status_guard` body match the file (compared 2026-09-04) |
| `167_order_items_money_constraints.sql` | `20260903232455` | `order_items_money_constraints_167` | all 8 `order_items_*_nonneg` constraints + `order_items_money_conservation` exist, expressions match |
| `168_wallet_ledger_client_readonly.sql` | `20260903232504` | `wallet_ledger_client_readonly_168` | the six write policies are gone; only the two SELECT policies remain, RLS enabled on both tables |
| `172_hide_master_product_test_row.sql` | none — DML, not DDL | applied 2026-09-08 via MCP `execute_sql` | `products` row `9bb347f8-…c895` reads `stock_quantity = 0`; it read `10` immediately before |
| `169_analytics_server_event_names.sql` | `analytics_server_event_names_169` | applied 2026-09-08 via MCP `apply_migration` | rolled-back `DO` probe: five events in, `returned=4`, rows written `begin_checkout, order_refunded, purchase, voucher_redeemed`, unknown name still skipped, `residue = 0` |
| `180_analytics_server_event_names.sql` | same statement | byte-identical duplicate of 169, written by a session that could not see it | applied by the same `CREATE OR REPLACE`; kept rather than deleted so its number stays burned |
| `148_refund_destination.sql` | `20260902182227` | `148_refund_destination` | where a refund's money goes: destination columns on `refunds` |
| `149_audit_log_append_only.sql` | `20260902182235` | `149_audit_log_append_only` | `audit_log` refuses UPDATE and DELETE from the service role too, by trigger |
| `150_account_deletion.sql` | `20260902182251` | `150_account_deletion` | the atomic account-deletion function the privacy page promises |
| `151_analytics_ingest.sql` | `20260902182310` | `151_analytics_ingest` | `fn_ingest_analytics_events`, the function `/api/a` calls (its eight-name whitelist is what 169/180 later widened) |
| `152_payout_machinery.sql` | `20260902182423` | `152_payout_machinery` | supplier payout tables and functions |
| `153_ai_usage.sql` | `20260902182432` | `153_ai_usage` | `ai_usage`, the per-call token and micro-USD cost ledger |
| `154_reviews_wishlist.sql` | `20260902182447` | `154_reviews_wishlist` | `reviews` (verified purchase only) + `wishlists` |
| `155_shipment_tracking.sql` | `20260902182500` | `155_shipment_tracking` | the two physical-fulfilment columns and the email kind |
| `156_analytics_indexes.sql` | `20260902182505` | `156_analytics_indexes` | two partial indexes for the admin analytics windows |
| `157_audit_ip_retention.sql` | `20260902182514` | `157_audit_ip_retention` | IP retention on the now append-only audit trail; runs after 149 |
| `158_revoke_anon_public_on_new_functions.sql` | `20260902213915` | `revoke_anon_public_on_new_functions_158` | the new functions carry no anon/PUBLIC EXECUTE |
| `159_pin_search_path_and_revoke_enqueue.sql` | `20260903004849` | `pin_search_path_and_revoke_enqueue_159` | `search_path` pinned on the definer functions |
| `160_fk_indexes.sql` | `20260903023113` | `fk_indexes_160` | indexes on the unindexed foreign keys |
| `161_enable_pg_cron_pg_net.sql` | `20260903023557` | `enable_pg_cron_pg_net_161` | `pg_cron` 1.6.4 + `pg_net` 0.20.0 installed |
| `163_orders_indexes.sql` | `20260903025918` | `orders_indexes_163` | the `orders` listing indexes |
| `169_audit_full_coverage.sql` | `20260904001341` | `audit_full_coverage_169` | `audit_log_trigger_fn`, `idx_audit_log_request_id` and trigger `audit_orders` all read back from production 2026-09-09 |
| `170_reporting_tables.sql` | `20260904003703` | `reporting_tables_170` | the four `report_*` tables and all six RPCs read back from production 2026-09-09 |
| `171_search_fts.sql` | `20260904005239` | `search_fts_171` | `products_search_vector_gin`, `coupon_deals_search_vector_gin`, `search_products`, `fts_prefix_query`, `fts_unaccent`, `fts_join` all read back 2026-09-09 |
| `172_rls_zero_policy_tables.sql` | `20260904010757` (+ `20260904010826` `_report_grants`) | `rls_zero_policy_tables_172` | all ten policies present, and zero public tables carry RLS with no policy, read back 2026-09-09 |
| `182_coupon_qr_batches.sql` | `20260907163213` | `coupon_qr_batches_182` | `coupon_qr_batches` + `coupon_qr_codes` read back from production 2026-09-09 |
| `186_composite_indexes_top_queries.sql` | applied 2026-09-09 | `composite_indexes_top_queries_186` | all ten index names present and every `indexdef` matches the file; `preflight_186.sql` passed all four blocks first |
| `187_category_name_shekel_order.sql` | applied 2026-09-09 | `category_name_shekel_order_187` | `categories.name_he` for `under-99` went `1506,1491,32,8362,57,57` → `1506,1491,32,8294,57,57,160,8362,8297`; zero rows still match the broken shape |

**`172_hide_master_product_test_row.sql` has no version string on purpose.**
It is a one-row `UPDATE`, not DDL, so it went through MCP `execute_sql` rather
than `apply_migration` and never touched `supabase_migrations`. Its evidence is
the row itself, which is what the Verify block in the file selects.

**`124_categories_sort_order.sql` is a different case.** `categories.sort_order`
exists in production, so the migration must not be run again, but there is **no
row for it in `schema_migrations` under any name**. The effect is present and the
record is not. Treat it as applied; do not expect to find its version string.

**Two of these needed a precise test, not a broad one.** A schema-wide count of
`authenticated` DML grants returns 144 and looks like `144` never ran. It did:
that migration revokes on a named list of eight tables, and against those eight
the count is zero. The 144 remaining grants are on ordinary catalogue and order
tables, which are protected by RLS rather than by revoking the grant. Measuring
the wrong thing here produces a confident, wrong "not applied".

**The fail-open hazard around `145` is closed.** `check_rate_limit` carries zero
EXECUTE grants for `anon` and `authenticated`, and the limiter runs on the
service-role client, so there is no still-anon caller left to fail open.

## Two files were corrected on disk so the repo matches production

Both were rejected at apply time and fixed during the apply. The versions in
this directory now describe what actually ran.

**`131_refunds.sql`.** `refund_due_by` was

```sql
GENERATED ALWAYS AS (requested_at + interval '14 days') STORED
```

which PostgreSQL rejects: a generation expression must be IMMUTABLE, and
`timestamptz + interval` is only STABLE, because the result depends on the
session `TimeZone`. It is now a plain `timestamptz` plus
`refunds_force_due_by()` on `BEFORE INSERT OR UPDATE`, with
`SET search_path TO ''`.

The guarantee is unchanged: nobody can extend the statutory deadline. What
changed is the failure mode. A generated column **refuses** a write to that
column with `428C9`; the trigger **accepts** the write and silently overwrites
the value. The verification note in the file was corrected to match, because it
still told a reader to expect `428C9`.

**`133_supplier_branches.sql`.** The member-write policy named `m.role`. There is
no such column: it is `member_role`, of enum `supplier_member_role`
(`owner`, `manager`, `scanner`). The applied policy also requires `m.is_active`,
and that addition matters more than the rename. Without it, revoking somebody's
access by clearing the flag would leave them able to write branches, because the
membership row still carries its role. Deactivation has to mean deactivation in
the policy, not only in the UI that stops drawing the button.

## `124`, `143`, `144`, `145` are out of the apply order

All four were confirmed applied in production under their old numbers, and they
sit in the APPLIED table above. `check_rate_limit` holds zero `anon` EXECUTE
grants and `authenticated` holds zero DML on the eight deny-all tables. **There
is no fail-open hazard left to sequence around**, which was the only reason the
apply order previously insisted `145` go last.

## 2026-09-01: two drifts between this directory and production, both closed

Found by querying the live database rather than by reading the migration record.

**`135` is two migrations in production, not one.** `schema_migrations` holds
`135a_product_type_recurring` and `135b_recurring_subscriptions`. The repo
carried a single combined file whose header argued, correctly, that PostgreSQL
17 permits `ALTER TYPE ... ADD VALUE` inside a transaction provided the label is
not used in the same one. The argument holds and the shape was still wrong: the
restriction binds the whole transaction, and nobody applying a later statement
can tell from reading it that `'recurring'` must not be referenced. Split into
`135a_product_type_recurring.sql` and `135b_recurring_subscriptions.sql` so the
constraint is structural instead of a promise kept by a comment.

**`138` describes eight columns; production has six.** What ran was a collapsed,
table-driven version of 138-141. These two were never created:

```
orders.discount_ils_agorot
order_items.supplier_payout_ils_agorot
```

The blocks that would create them are still in the file and still correct, so
running it would add them. Whether that is wanted is left open: the reason they
were dropped from the collapsed version was not recorded, and inventing one in a
migration header is how a wrong reason becomes a fact. A banner at the top of
`138` says all of this, so the file cannot be read as a description of
production without also reading the correction.

**The consequence for the application code.** Four money columns have no
generated twin and therefore still convert in JavaScript:

```
orders.discount_ils              orders.cashback_applied_ils
order_items.supplier_payout_ils  order_items.cashback_earned_ils
```

`src/lib/commerce/order-money-columns.ts` carries the same list at the call
site. The two have to change together.
