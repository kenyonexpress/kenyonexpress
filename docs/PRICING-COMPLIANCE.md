# Discount pricing: fifteen claims, and no evidence for any of them

Measured 2026-09-09 against production (`ixvwfbuvfxxsjiywhbbb`).

```
44  active products
15  showing a struck-through "מחיר רגיל" above the price charged
20  products with any price change recorded anywhere (audit_log)
 0  products in BOTH sets
```

The intersection is **empty**. Not "hard to prove" and not "mostly covered":
for every one of the fifteen savings advertised on the site right now, there is
no record anywhere that the struck-through price was ever charged.

Israeli consumer law does not treat an advertised saving as decoration. תקנות
הגנת הצרכן (מכירה מיוחדת) require a special sale to state the price the goods
were actually sold at beforehand, and the enforcement practice around it — the
same shape as the EU Omnibus rule the Israeli guidance tracks — reads
"beforehand" as **the lowest price the trader charged in the 30 days before the
discount began**. `products.full_price` is a number an operator types into a
form. Eight components paint it with a line through it. Nothing between the
form and the shopper has ever asked whether it is true.

## Why `audit_log` is not the answer

It is the obvious place to look and it does not work, for a reason worth
stating because it applies to every change-driven log:

```
555  product rows in audit_log
 21  of them mention kenyon_price at all
 20  distinct products covered
  0  of those products are among the 15 showing a strike-through
```

A change log records the edits that went through the audited path. A bulk price
update, a direct SQL edit or a CSV import writes nothing, and the hole lands
exactly where a dispute would. More fundamentally: the law asks about the price
on **every day** of a window, including the twenty-nine when nobody edited
anything. An edit log cannot answer a question about days.

## What was built

### The rule, as a pure function

`src/lib/pricing/reference-price.ts`. No database, no clock — the window end is
passed in — so the storefront, the admin warning and the tests agree by
construction rather than by three implementations happening to match.

Four verdicts, and the distinction between the middle two is the design:

| verdict | meaning | storefront | admin |
| --- | --- | --- | --- |
| `not_claimed` | no `full_price` | nothing to show | silent |
| `compliant` | reference ≤ lowest price charged in the window | **shown** | silent |
| `unproven` | fewer than 30 days of history | **shown** | **warned** |
| `violating` | reference above the lowest charged, or not above the current price | **suppressed** | **warned** |

**`unproven` is shown, and that is the one judgement call in the whole design.**
Suppressing every unprovable claim today would blank the "מחיר רגיל" line on 15
of 44 products at once, on an absence of evidence rather than evidence of a
false claim. Those prices may well be genuine; nobody was recording. Showing a
claim measured to be **false** is a different act, and that one is refused
unconditionally.

**It is not an amnesty and it is not a flag.** Once 30 days of history exist for
a product, `unproven` is unreachable for it: the verdict becomes `compliant` or
`violating` on the evidence and an unsupported claim starts being suppressed on
its own, with nobody remembering anything. With the snapshot starting the day
193 is applied, the first products cross that line 30 days later.

**Full window coverage is required**, not "some history". A window with holes
cannot produce the lowest price across it — the lowest could be on a day nobody
recorded. Accepting partial coverage would make the check pass most easily
exactly when the history is thinnest, which is day one.

**Equal counts as compliant.** A reference equal to the lowest price actually
charged is the honest claim: the shopper saves exactly what the page says.

### The evidence

`migrations/pending/193_price_history.sql`. One row per product per day, with
the price, the reference claimed that day, and the product's **status** that
day.

**Append-only, enforced by trigger for every role including `service_role`.**
This table exists to contradict a claim somebody wants to make. A history that
can be edited by whoever is under pressure to run a sale is not evidence, it is
a second copy of the claim. UPDATE and DELETE both raise `42501`.

**No unique key on (product, day).** A price can change twice in a day, and
forcing one row per day would make the writer choose which of the two is "the"
price — a writer that chooses is a writer that can be wrong — or make it UPDATE
the earlier row, which breaks append-only. So a day may carry several rows and
the **reader** takes the lowest, which is the price a shopper could actually
have paid. The unique index covers the whole observation instead, so a re-run of
the snapshot is a no-op and a real change is a new row.

**Status is recorded and the reader filters on it.** A draft day is not a day
the product had a price. Without this, a product could be hidden for a month and
come back advertising any "before" price at all, behind a full window of draft
days.

**Verified against production inside a rolled-back `DO` block**, and nothing
survived:

```
seeded=80  rerun_wrote=0  update=BLOCKED  delete=BLOCKED  products_with_null_price=0
```

80 rows for 80 non-deleted products, a second identical run wrote nothing, both
mutations were refused, and no product was skipped for want of a price.

### The writer

`src/app/api/cron/price-snapshot/route.ts`, daily at `0 4 * * *` — 07:00 Israeli
time in summer, 06:00 in winter. It shares `reconcile`'s slot rather than taking
one of its own, and the hour is chosen to be far from midnight in **both**
offsets: a snapshot that landed on the wrong side of a date boundary would leave
a hole in a 30-day window and nothing would report it.

Registered in `scripts/cron-jobs.json`, which
`src/__tests__/cron-schedule-inventory.test.ts` checks against the workflow, the
route directory and `docs/CRON-EXTERNAL.md` in both directions.

It writes **every non-deleted product**, not only the active ones, because
"draft that day" and "the cron did not run that day" are opposite facts and an
absence cannot tell them apart.

### Where the check is asked

`src/app/(store)/product/[slug]/page.tsx`, through `loadProductBySlug`, which
reads the verdict inside the same `use cache` scope as the price beside it and
under the same `CATALOGUE_TAG`.

**The admin is the only place any of this is said out loud.** A shopper cannot
act on a compliance note; an operator can, and is the only one who can — the fix
is to correct `full_price` or to hold the price long enough for the claim to
become true, and both are decisions rather than code. `/admin/products` carries
the warning in amber, below the red "cannot be sold" error rather than beside
it: one stops a sale and one does not, and painting them alike trains an
operator to read both as noise.

## What is not done, named rather than described

**Seven of the eight strike-through surfaces do not ask.** The card grids, the
coupon pages and the OpenGraph image still paint `full_price` unchecked. That is
a real gap, and it is recorded as **data** in
`src/lib/pricing/reference-surfaces.test.ts` rather than as a sentence here: the
test re-derives the list of striking components from the tree and fails if a
file appears or disappears. A gap in a document is forgotten; a gap in a failing
list is not, and the next person to add a strike-through learns there are seven
others before they add an eighth.

The reason is not difficulty. A grid renders up to 24 products from six read
paths (`category-page.ts`, `related-products.ts`, `search-server.ts`,
`supplier-storefront.ts`, `ke-live-deals-data.ts`, `cart/load-products.ts`) and
each selects `full_price` itself; wiring them means one batched verdict read per
path, which is the catalogue-read consolidation this codebase has not done. The
product page went first because it is where the claim is largest and the read
was already cached per slug.

**The cost of the gap, plainly:** a claim the record contradicts is suppressed
on the product page and still painted on the card that led there.

**193 is written and not applied**, per the standing rule. Until it is, every
verdict is `unproven`, so wiring the product page changes nothing a shopper
sees — which is the correct behaviour, not a workaround. The cron answers 200
with a warning rather than 500 in the same state, because a job that fails every
night for an unapproved migration teaches everyone to ignore it.

**Mid-day price changes are sampled, not captured.** One snapshot a day sees the
price at 07:00. The `source` column already carries `'change'` for a future
write on the admin save path; until that exists, the snapshot is the only
writer, and the record is a daily observation rather than a continuous one.

## VAT

Nothing here changes it, and nothing needed to. Israeli law requires the price
shown to a consumer to be the final, VAT-inclusive one, and it already is:
`kenyon_price` is what the card is charged, `VAT_RATE_BP = 1800` is the single
definition of the rate for the whole application (`src/lib/money.ts`), and
`extractVat` derives the net by subtraction so `net + vat === gross` exactly,
with no rounding loss. The invoice module derives its percent from the same
constant rather than restating it. `src/lib/money.test.ts` pins the rate at
1800.

The reference-price check therefore compares gross to gross throughout, in
agorot, and never touches VAT.

## Files

| | |
| --- | --- |
| `src/lib/pricing/reference-price.ts` | the rule, pure |
| `src/lib/pricing/reference-price.test.ts` | 16 cases |
| `src/lib/pricing/price-history.ts` | the batched read, and surviving the table's absence |
| `src/lib/pricing/reference-surfaces.test.ts` | which surfaces check, and which do not |
| `src/app/api/cron/price-snapshot/route.ts` | the daily writer |
| `migrations/pending/193_price_history.sql` | the table. Not applied. |
| `src/lib/product-detail.ts` | where the product page asks |
| `src/app/(admin)/admin/products/page.tsx` | where the operator is told |
