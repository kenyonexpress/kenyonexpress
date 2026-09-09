# Product phases

Which product types the shop is currently selling, and the switch that decides.
Section 89.

## The measurement that inverted the default

[89] assigns coupons to phase 1 and physical products, courses, subscriptions
and cabins to phase 2, with phase 2 off until the admin turns it on after ten
sales. Read off production on 2026-09-09:

```
type      status   count            orders total          4
coupon    draft       15            of which sold         2
physical  active      44            vouchers              0
physical  draft       21
```

**Every active product on this site is `physical`**, which the section puts in
phase 2. There is not one active coupon to put in its place: all fifteen are
drafts. And the condition for turning phase 2 on is ten sales, against two.

Applying phase 1 as written would hide 44 of 44 active products, leave an empty
shop, and leave it that way until a threshold five times away was crossed.

**That does not make the feature wrong. It makes the default wrong**, so the
implementation separates two things the section says in one breath:

| column | meaning |
| --- | --- |
| `phase` | which phase a type belongs to. The section's answer, recorded as **advice**. Nothing reads it to decide anything. |
| `is_enabled` | whether it is sellable right now. **Seeded true for every type.** |

Applying `210_product_phases.sql` changes nothing a shopper sees. Turning a
switch off is a decision an operator makes at `/admin/phases`, where the count
of what it will hide is printed next to the switch.

## Where it is enforced

| place | behaviour | fails |
| --- | --- | --- |
| `getShopProducts`, `getCategoryProducts` | `.in('type', enabled)` | **open** |
| `/product/[slug]` | `notFound()` for a disabled type | **open** |
| `addToCart` | refuses, live read | **closed** |

### Why the listing path fails open

If the config cannot be read - 210 unapplied, database unreachable - every type
is treated as sellable and the catalogue is unchanged.

Failing closed would mean a transient error empties the shop, and **an empty
shop is indistinguishable from a shop with nothing to sell**: no error page, no
alert, just a catalogue saying "no products match". That is the exact failure
`lib/catalogue-read.ts` was written about, where one transient failure was
cached as an empty shop for an hour.

### Why the cart path does not

The catalogue may list a withdrawn type for up to a cache period, and that is an
accepted cost. Adding one to a cart is the point at which the shop would take
money for it, so `assertTypeSellable` reads live and **a failed read refuses**.
Refusing one add to cart costs a shopper a retry; selling something the operator
withdrew costs a refund and an apology.

It also closes the hole that hiding alone would leave: a direct product URL, a
stale tab and a cart from before the switch all arrive there.

### The one place nothing fails open

**A type with no row is not sellable.** 210 seeds a row per `product_type` enum
value, and sections 91 and 92 seed their new types **disabled** before the enum
has them, so a type with no row is one nobody has approved. Listing it would put
a new product type on sale the moment somebody added it to the enum - the
opposite failure from an empty shop, and a worse one.

A failed read is still "no opinion" and still lists everything. The distinction
is between "the config says nothing about this type" and "there is no config".

## The schema

`phase_config`, keyed by `product_type` as **text** rather than as the enum.
Sections 91 and 92 add course and cabin types, and a text key lets a row be
seeded for a type **before** the enum has it - which is the order those sections
need, since the phase must be off before the type exists.

`enabled_at` is set on the first enable and never moved: "since when has this
been sellable" is a different question from "when was this row last edited",
which `updated_at` answers. Disabling keeps the date rather than clearing it.

`set_phase_enabled` is a function rather than an update from the client, because
that first-enable rule is a read-then-write the client cannot express.

It **does not** refuse to disable a type that has active products. That refusal
belongs on the screen, where the operator can see the count and decide, not in
the database, where it would be a rule nobody could override on the day they
need to pull a whole category off the site.

## A table and not an environment variable

`lib/admin/feature-flags.ts` states plainly that there is no flags table,
because "an agent cannot apply a migration, so a deploy-free admin toggle does
not exist". That is true of the four operational kill switches, which belong to
a deploy.

This is not that. [89] asks for a toggle the **admin** flips after ten sales,
and an environment variable is not something an admin flips - it is a redeploy,
which on this project is a step nobody has managed since 31.08.

## The console

`/admin/phases`, admin only. It prints, per type: the phase, the switch, the
number of **active** products, the total including drafts, and the note.

Above the table it prints the sales count against the section's threshold of
ten, and the sentence that matters most: every active product is `physical`, so
turning phase 2 off empties the shop.

The confirmation is the count, not a dialog. The button reads
`הסרה ממכירה (יסתיר 44 מוצרים)`. A generic "are you sure?" would not have told
the operator that.

## What was not done

**Nothing is auto-enabled at ten sales.** The section says the admin toggles
after ten sales, and that is what is built: the screen prints the count and the
threshold, and a person decides. A job that flipped it automatically would put
a product type on sale without anybody choosing the day.

**No per-product override.** The switch is per type. A single product is
withdrawn by setting its status, which already works.

**Courses, subscriptions and cabins have no rows yet.** They are not
`product_type` values. Sections 90, 91 and 92 add them, and each seeds its own
row disabled.
