# Shipping: the tracking number was captured, stored, and shown to nobody

Measured 2026-09-09 against production (`ixvwfbuvfxxsjiywhbbb`).

## The chain, and where it broke

```
admin records carrier + tracking   →  order_items.carrier / .tracking_number   (155, applied)
order reaches fulfilled            →  tg_orders_notify_shipped                 (183, applied)
customer gets an email             →  "ההזמנה שלך נשלחה"
the email's button                 →  "למעקב אחרי ההזמנה" → /account/orders
that page rendered                 →  "· נשלח"
```

Nothing else. No carrier, no number, no link.

Every link in that chain works. The columns exist and are applied, the admin
form writes them, the trigger fires, the email sends. The last step renders a
single word, and the effect is that **the mail raises exactly the question the
page it links to cannot answer**. The customer's only remaining move is to write
to support for a string that is already in the database.

That is the shape worth naming: not a broken feature, six working parts and one
missing render. Nothing errors, nothing logs, and every piece passes inspection
on its own.

## What was built

### The customer can see the parcel

`src/server/queries/orders.ts` now selects `carrier` and `tracking_number` and
`/account/orders/[id]` prints them.

`src/lib/shipping/carriers.ts` turns the pair into a link where one is known.
Seven carriers; four carry a tracking URL and three deliberately do not.

**Israel Post, DHL, UPS and FedEx have URLs** because their tracking form is
publicly documented and stable.

**HFD, צ׳יטה and בלדר have names and no URL, on purpose.** A tracking link that
goes to the wrong place is *worse* than no link, because it looks like it
worked: the customer follows it, sees "no such shipment", and concludes the
parcel is lost. Adding one is a two-line change the moment somebody has opened
it and watched it work — and `carriers.test.ts` pins the three at null so
"probably this URL" cannot be guessed in later.

**The number is shown even when no link can be built**, and even when the
carrier string matches nothing in the registry. It is the one fact the customer
opened the page for; withholding it because the presentation is imperfect would
repeat the defect this replaces.

**Matching is on the whole string, not `includes`.** A note like
"נמסר לשליח של דואר ישראל" would otherwise match a carrier and the answer would
depend on list order, which is a coin toss dressed as a lookup.

**The number is URI-encoded before it goes in a URL.** `tracking_number` is free
text an operator typed; interpolating it raw lets a space or an ampersand
rewrite the query string.

### The email carries the numbers

`buildOrderShippedEmail` prints carrier, number and link. Backed by
`migrations/pending/196`, which adds `shipments` to the trigger's payload.

**A list, not a pair, and that is the grain the data is in.** 155 put carrier and
tracking on `order_items` — one per line — and said why: an order-level
shipments table "would fork fulfillment state into two places for the
multi-supplier order that is this platform's normal case". Suppliers ship
separately. An order with three suppliers is three parcels with three numbers,
and a mail printing one of them would be wrong in exactly the case the model was
built for.

**Silent when there is nothing to say.** `jsonb_agg` over zero rows returns NULL
rather than `[]`, which is the wanted behaviour rather than something to correct:
the builder reads a missing array as "this order has no tracking to report" and
the mail reads exactly as it did before.

Proven against production in a rolled-back `DO` block: the trigger fired once and
the payload carried exactly the line with a real number, excluding the line whose
`tracking_number` was whitespace.

### The supplier can mark their own line shipped

`src/server/actions/supplier/shipping.ts`, and the page it appears on used to
explain why it could not exist:

> There is no "mark shipped" button, and its absence is the design.
> ARCHITECTURE-SUPPLIER-PORTAL.md section 5.2 routes every fulfillment
> transition through a Server Action that writes `audit_log`, and section 3.2
> gives suppliers SELECT on `orders` and nothing else. A button here would need
> a write path that does not exist yet; shipping one that quietly used the
> service role would be the audit hole those two sections are written to close.

Correct, and it describes the missing thing rather than forbidding it. This is
that write path.

**The ownership check is the whole security model, so it is in the `WHERE`.**
`requireSupplierRole('manager')` establishes which supplier is calling;
`.eq('supplier_id', session.supplierId)` on both the read and the UPDATE is what
stops them touching anybody else's line. Checking ownership in a preceding
SELECT and then updating by id would leave a window between the two.

**A line that is not theirs is "not found", not "forbidden".** "Forbidden"
confirms the id exists, which lets a supplier enumerate other suppliers' order
lines one guess at a time.

**Both fields are required here**, unlike the admin form where they are
optional. A supplier declaring a parcel shipped without saying who has it leaves
the customer exactly where they were, which is the thing this button exists to
end.

**`manager`, not `scanner`**, matching the page: the orders list carries the
commission percent and the residual owed, so handing the till phone to a shift
worker must not hand them the business terms — or the ability to declare an
order shipped.

**The verdict comes from `planTransition`**, the same pure machine the admin
path uses. A second copy would be a second answer, and they would disagree the
first time either changed. Production has no `item_status` trigger, so that
module plus the action is the enforcement.

**`actor_role` records `vendor`, not `supplier:manager`.** The column holds a
`user_role` value and would have rejected the second; the membership goes in
`metadata`, where it can be read without pretending to be something it is not.

## Delivery is free, everywhere, and that is a decision

```
orders                    no shipping column
cart view                 no shipping line
calculateSettlement       no shipping input
44 active products        requires_shipping = true, all of them
```

Nobody is charged for delivery. That agrees with the site: `TopBar` prints
**"משלוח מהיר חינם"** on every page with no qualifier, and the product page
promises 3-7 business days with no fee beside it.

**What was missing is a place to put a rate.** "Free" is expressed as an
*absence*. An absence cannot be changed carefully: there is nowhere to write
"Eilat costs more", nowhere to write "free over ₪199", and no way to tell
whether free-everywhere was chosen or merely never built.

`src/lib/shipping/zones.ts` and `migrations/pending/197` make the policy a
value, seeded with exactly what the site already does. Five zones.

**`eilat` is separate from `south`, and it is the only split here that is not
arbitrary.** Four hours past the last distribution point, priced apart by every
Israeli courier, and exactly where a flat national rate quietly loses money.

**An unknown zone is refused, not charged the central rate.** Falling back to
the cheapest zone for an address nobody classified is a loss that never
surfaces; refusing surfaces it at checkout, where the address can be fixed.

**The free threshold compares against the subtotal, not the total.** Letting a
discount decide whether shipping is free is two promotions interacting in a way
nobody designed.

**It is not wired into checkout, and that is deliberate.** Charging for delivery
needs rates nobody has set, and it contradicts a sentence printed on every page;
changing that sentence is a business decision, not an engineering one.

**The two are held together by a test.** `zones.test.ts` reads `TopBar.tsx` and
asserts that the banner and the rate table agree. Add a surcharge and it fails
until the banner is edited; edit the banner and it fails until the table agrees.
The contradiction cannot be introduced quietly from either side.

## Pickup points exist as a table and nothing else

`pickup_points` is created **empty**, and stays empty until somebody has an
arrangement with a real shop. A seeded example is the worst thing that table
could contain, because the failure lands on a customer standing outside a locked
door holding an order number.

## What is not done

**No shipping charge reaches an order.** No `shipping_agorot` column, no
settlement line, no cart row. Adding one is a change to the money path and needs
rates plus a decision about the banner.

**No delivery-status emails beyond "shipped".** `order_shipped` is the only
fulfilment kind in `notification_outbox_kind_check`. "Out for delivery" and
"delivered" would each need a kind, a trigger and a template; the `delivered`
transition exists in `planTransition` and writes `delivered_at`, so the data is
there when the mail is wanted.

**No carrier API.** Nothing polls Israel Post or HFD for status; `item_status`
moves when a human says so. Automating it means credentials and a per-carrier
client, and the manual path has to work first.

## Files

| | |
| --- | --- |
| `src/lib/shipping/carriers.ts` | the registry and the link builder |
| `src/lib/shipping/zones.ts` | the rate table, free everywhere today |
| `src/lib/shipping/transitions.ts` | the pure fulfilment machine (existing) |
| `src/server/actions/supplier/shipping.ts` | the supplier's write path |
| `src/app/(supplier)/supplier/orders/MarkShippedForm.tsx` | the button |
| `src/server/queries/orders.ts` | where the customer's tracking comes from |
| `migrations/pending/196_shipped_notification_carries_tracking.sql` | the email half. Not applied. |
| `migrations/pending/197_shipping_zones_and_pickup.sql` | zones and pickup points. Not applied. |
