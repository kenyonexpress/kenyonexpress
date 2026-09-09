# COST-MODEL.md

What the platform pays, what an order costs, and the two places a cost
dashboard lies.

Measured 2026-09-09 against production (`ixvwfbuvfxxsjiywhbbb`) and against
`src/lib/env.ts` at HEAD.

---

## The headline: nothing here is fetched

**Not one billing credential exists in this project.** `src/lib/env.ts`
declares twenty-seven variables and none of them can read an invoice:

| Provider | Would need | Present? | Note |
| --- | --- | --- | --- |
| Vercel | `VERCEL_API_TOKEN` | no | and there is no project link either — the CLI is installed and unauthenticated, so a token alone would still need team and project ids |
| Supabase | `SUPABASE_MANAGEMENT_TOKEN` | no | **not** the service role key, which is scoped to the database and cannot see an invoice |
| Upstash | `UPSTASH_MANAGEMENT_API_KEY` | no | **`UPSTASH_REDIS_REST_TOKEN` IS set and is not this.** It grants access to the DATABASE, not the account |
| Cloudflare | `CLOUDFLARE_API_TOKEN` | no | R2 bills storage plus two operation classes, so one number is three figures added up |
| Twilio | — | **measured locally** | migration 216 stores the real per-message price from the delivery receipts |
| Resend | — | **never** | Resend publishes no usage or billing API at all |

So the manual entry on `/admin/billing` is **the working path, not a
fallback**, and the page says so per provider rather than presenting typed
figures as measurements. `src/lib/costs/providers.ts` is the registry; adding a
credential later is a one-line change there plus a client.

**The Upstash row is the one worth remembering.** Reaching for the token that
happens to exist produces a client that 401s forever, and the natural
conclusion is that the variable is wrong rather than that it is the wrong
*kind* of credential.

---

## Trap 1: extrapolating a subscription

The obvious month-end projection is `spent_so_far / day × days_in_month`. On
day 3 of a month where Vercel and Supabase have already charged their whole
monthly subscription, that says the month will cost **ten times** the bill.

An alert fires, somebody investigates, finds nothing, and learns to ignore the
alert. That is the only lasting effect.

So every cost line carries a `kind`:

- **fixed** — a subscription. Charged once, already whole, **never
  extrapolated**.
- **variable** — per-request, per-message, per-gigabyte. Accrues through the
  month and is the only part a projection may extend.

A provider whose split is unknown is treated as fixed, because that
under-alerts rather than crying wolf. One provider can legitimately carry both
— a Vercel Pro seat is fixed and its bandwidth overage is not — which is why
`kind` is part of the uniqueness in `infra_costs`.

---

## Trap 2: cost per order at low volume

Production has **four orders, total**, as of 2026-09-09.

Dividing a monthly platform bill by four produces a large, precise,
authoritative-looking number that says nothing about what one more order costs,
because almost none of it moves when an order is placed. One more sale moves it
by 25%.

Two different numbers answer two different questions:

| number | question it answers | useful at low volume |
| --- | --- | --- |
| **marginal cost per order** = variable ÷ orders | what does one more order cost | **yes** |
| total cost per order = all spend ÷ orders | what does the shop cost, per order | no |

`/admin/billing` prints the marginal figure as the headline at any volume and
**refuses to headline the total below thirty orders a month**, showing it as a
parenthetical instead. Thirty is a judgement written as one constant
(`MEANINGFUL_ORDER_FLOOR`): at thirty, one more sale moves the figure by about
3%, which is noise rather than signal.

---

## Unit economics per order type

The variable cost of an order is the messages it sends plus the requests it
serves. The messages are the part that differs by type, and the only one this
system can price exactly today.

| order type | messages it triggers | notes |
| --- | --- | --- |
| **coupon** (`voucher_issued`) | order receipt (email), coupon email, optional push, optional SMS | the SMS is the only one with a per-unit price. It carries the CODE, which is the one message SMS is genuinely better at: a customer at a counter with no data connection can read it |
| **physical** | order receipt, shipment notice on dispatch | `order_shipped` is optional per channel, so a customer who switched it off costs one message less |
| **subscription** (recurring) | one invoice per charge | the charge repeats monthly, so its message cost repeats with it — the only order type whose cost is not once |
| **course / cabin** | receipt plus access mail | no SMS path today |
| **refund** (any type) | `refund_completed` email, optional SMS | a refund costs money to make and money to announce |

**A Hebrew SMS is not one message.** Hebrew sits outside GSM 03.38, so every
body switches the whole message to UCS-2, where a segment is **70** characters
and **67** per part of a multipart — not 160. A 140-character notification
reads as "well under the limit" and is billed as **three**. Budget an Israeli
SMS programme at two to three times a naive per-message estimate;
`src/lib/sms/segments.ts` computes it before the send, and
`src/lib/sms/templates.test.ts` holds each template to a segment ceiling so one
extra word cannot silently add 50% forever.

**Everything else is fixed at this volume.** Four orders a month do not move a
Vercel plan, a Supabase plan or an Upstash free tier. That is the real finding
of this document: the shop's cost is currently a subscription, and the lever
that matters is the plan, not the per-order efficiency.

---

## Money units, and why this file breaks the agorot rule

The standing project rule is money = agorot, integer. Two cost columns break
the *unit* half of it deliberately, and neither breaks the *integer* half:

- `sms_messages.price_micro`
- `infra_costs.amount_micro`, `infra_budgets.amount_micro`

Both are **integer millionths** of an explicit `currency`, because:

1. **It is not shekels.** Vendors bill in USD. Storing agorot means applying an
   FX rate at write time — a rate frozen at the moment of a text message,
   unauditable, and wrong the next day.
2. **Agorot cannot hold it.** Twilio's unit price has five decimal places.
   $0.0075 rounds to 1 agora: a 30% error on the unit, multiplied by every
   message ever sent.

These are **vendor costs**, not the customer money path. Nothing here is
charged to anybody and `src/lib/money.ts` is untouched. The report that turns
micro into shekels applies a rate it states, at the time it states it —
`projectMonth` refuses to convert and **drops** foreign-currency lines with a
`mixedCurrency` flag, because a converted total looks authoritative and is
wrong by however far the rate has moved.

---

## The trend, and the two things it refuses to draw

Twelve months, stacked bars for fixed against variable, and a line for the cost
per order. Two decisions in it are worth stating because both look like
omissions:

**A month nobody recorded is drawn as zero, not skipped.** The gap is the
information. A trend that silently omits the empty months draws a smooth line
across a hole and invites the reader to believe spending was continuous; it also
makes the axis lie about spacing, because the points either side of the hole end
up adjacent.

**A month with no orders has no cost-per-order point, and the line breaks
there.** `perOrderMicro` is null rather than zero and `connectNulls` is off. A
line joined across the gap would descend smoothly through a month in which the
bill was paid and nothing was sold — which is the opposite of what happened, and
reads as "orders were free that month".

With no `infra_costs` rows the page does not draw twelve empty columns either.
A chart of zeroes is not a trend: it looks like a year of no spending, and what
is true is that no figure has been entered. The page says that instead.

## Threshold alerts: a banner, and deliberately not a pager

The breach check runs where the numbers are entered. `checkBudget` compares the
**projection** against the budget — not what has already been billed, because an
alert that arrives after the money left is a receipt — and the page shows it in
red at the top.

It is not also mailed, and that is a decision rather than an omission. Every
figure except SMS is typed in by hand on this same page, so the person who would
receive the alert is the person who just entered the number that triggered it.
The one cost that accrues unattended is SMS, summed from the delivery receipts;
if that ever grows to where it alone can breach a monthly budget, the check
belongs in a daily cron with its own outbox kind, and `settlement_gap` in
`/api/cron/settlement-reconcile` is the pattern to copy — including its
degradation when the kind is not yet in `notification_outbox_kind_check`.

---

## Where each piece lives

| | |
| --- | --- |
| `src/lib/costs/model.ts` | projection, budget verdict, per-order economics. Pure |
| `src/lib/costs/providers.ts` | the registry, and what each provider would need |
| `src/server/queries/costs.ts` | the month's ledger, budget, order count, measured SMS spend, and the twelve-month trend |
| `src/components/admin/billing/CostTrendChart.tsx` | the trend. RTL is set on the axes, not by a stylesheet |
| `src/server/actions/admin/costs.ts` | manual entry. Parses money by digits, never through a float |
| `src/app/(admin)/admin/billing/page.tsx` | the page |
| `migrations/pending/219_infra_costs.sql` | `infra_costs` + `infra_budgets`. **Written, not applied** |
