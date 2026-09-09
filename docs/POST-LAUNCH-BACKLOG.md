# Post-launch backlog

Everything deliberately deferred, with the measurement or the argument behind
each. Section 63.

**This is not a list of what is missing.** It is a list of decisions, each of
which could be reversed by somebody who disagrees with the reasoning. The
difference matters: a backlog of things nobody chose is a backlog nobody
prioritises.

---

## Database

### The 19 multiple-permissive policy warnings

Postgres evaluates two permissive policies and ORs them, and the advisor counts
that as a performance defect. It is one, at scale.

Merging them is a rewrite of access control on 19 tables, including
`cashback_ledger`, `payment_events` and `payout_statement_lines`. The largest
table in this database is 44 rows, so the cost being avoided is planning time on
a query nobody notices, and the risk being taken is a money-adjacent policy
rewritten by somebody who cannot exercise it. Deferred until either the tables
are big enough to measure the cost or the policies are being touched anyway.

### The 8 unindexed foreign keys

`208_drop_redundant_indexes.sql` drops 14 indexes and argues that this database
is 60% index by size with 253 indexes never scanned. Adding eight more, on
tables with no rows, to satisfy an INFO advisory would contradict it in the same
directory. Worth adding when a cascade delete becomes slow, which is observable.

### The 23 SECURITY DEFINER execute warnings

Cannot be cleared. `is_admin()` is called by 93 RLS policies and an RLS
expression runs as the calling role, so `authenticated` must hold EXECUTE.
`SECURITY INVOKER` is worse: these functions read `profiles`, which is itself
behind a policy that calls them. Recorded so the next person does not spend an
afternoon rediscovering it.

### `media_ingest_queue` has RLS on and no policy

INFO, and it is the intended state: RLS with zero policies denies everything to
`anon` and `authenticated`, which is what a server-only queue wants. The advisor
cannot tell that apart from an oversight.

---

## Performance

### Lazy-loading Sentry

131.9 kB gzipped, 34% of first-load JavaScript on every route. Moving it off the
critical path would lose what `instrumentation-client.ts` exists for: it runs
before React hydrates, which is what catches an error thrown during hydration -
the class of bug that otherwise shows a blank page and reports nothing.

A real trade, for somebody who decides that pre-hydration capture is worth less
than 131.9 kB. Not a defect.

### The icon repeated 64 times on the homepage

63,680 bytes of duplicate inline SVG, 10.7% of the document. Replacing it with a
`<symbol>` and 64 `<use>` elements saves **55,133 bytes raw and 1,111 bytes
gzipped**, because gzip already deduplicates the repeated string. Two percent of
the wire cost, against editing the markup of the one page whose fidelity was a
gate and which `scripts/compare.mjs` can no longer measure.

Worth doing if the parse and DOM cost on a low-end phone is ever measured and
found to matter. Not worth doing on the raw number.

### k6

There is no load test and never has been. `docs/ARCHITECTURE-TESTING.md` lists
it as `T-12`. It is in `docs/LAUNCH-READINESS.md` as a red line rather than here,
because "we have never measured what this does under load" is a gap and not a
decision.

---

## Internationalisation

### 662 Hebrew literals still in components

Measured and gated: `scripts/i18n-gate.mjs` refuses an increase and
`HEBREW_LITERAL_CEILING` only goes down. Extracting all of them in one change
would be an unreviewable diff, and an automated pass produces
`common.string_417` keys - a catalog nobody maintains.

### The admin panel is not translatable, by decision

499 of the 1,292 rendered Hebrew strings, 39% of the total. A second language
exists for shoppers; the operator runs this shop in Hebrew. Translating the
admin panel would double the catalog to serve nobody. Reversible, with its own
budget.

### The legal pages are not translatable, by decision

A translated copy of the terms is a **second legally binding document**, and
which governs becomes a question for a court rather than for a developer. The
pages say in their own text that the Hebrew is the original.

### No middleware, so no locale prefix resolves

That is the literal reading of "routing prepared but only he-IL active".
Writing it would put every route in the application through a middleware to
serve one locale. Step 5 of the nine in `docs/I18N.md`.

---

## Content

### Scheduled publishing for content pages

`201_scheduled_price_changes.sql` is the pending migration that would give this
repository a scheduler, and it is unapplied. A second one for page bodies means
a second cron and a second late-job failure mode. Publish is a button.

### No preview of an unpublished page at its public URL

The editor renders the draft through the same component the page uses. Serving a
draft at `/page/<slug>` to an admin would mean the storefront read could see
drafts, and that filter would then be the only thing between an unfinished page
and the public. The RLS policy is a better place for that decision than an `if`.

### No image upload in the homepage banner console

Slides carry measured geometry a form deliberately cannot set, so a create form
needs the image pipeline, the alt-text rule from 049, and a mapping from
position to authored slide. `banners` holds zero rows, so nothing is blocked.

### No admin screen for the email counters

`email_events_daily` has one consumer, the SQL in
`docs/EMAIL-DELIVERABILITY.md`. A screen is a feature, not a deliverability
question.

---

## Homepage merchandising

### `featured`, `city_deals` and `banner_row` have no component

Three of 127's seven section kinds were created and never built. They stay in
the CHECK - dropping a value is how a row somebody added last month stops being
updatable - and the console does not offer them, so an operator cannot add a
section that is stored, active, scheduled and invisible.

### `ending_soon` matches zero products

`offer_valid_until` is null on all 44 active products. The rule is built because
the column is the right signal and the operator fills it. The console prints the
live match count so this is visible before publish rather than after.

### No A/B testing and no per-audience sections

Both would make the section list per-request, which takes the home page dynamic.
The home page is the LCP-critical page and is prerendered.

---

## Deferred features with their own sections

`89 PRODUCT-PHASES`, `90 SUBSCRIPTIONS-PHASE2`, `91 COURSES-PHASE2`,
`92 CABINS-BOOKING-PHASE2` are queued work, not backlog. Each ships behind a
feature flag that is off.

---

## Things that look like backlog and are not

- **The 253 unused indexes.** Unused at 44 rows means untested, not useless.
  Dropping them optimises for a scale the business is trying to leave.
- **`/cart` scoring 69 on Lighthouse SEO.** The page is `noindex` and Lighthouse
  counts that as a failed audit. Correct behaviour.
- **`experimental.inlineCss`.** Tried, measured, reverted: TTFB went from
  360-460 ms to 1,140-4,930 ms. The note is in `next.config.ts` so it is not
  tried a third time.
