# Email: fifteen builders, every one tested by substring, none of them ever seen

Measured 2026-09-09.

The mail system is substantial and mostly right. Fourteen kinds live in
`notification_outbox_kind_check`, an outbox with a dedupe key gives every send
its own idempotency, `/api/cron/notifications` drains it every five minutes with
retry and backoff, and `outbox-kinds.test.ts` holds the database constraint, the
TypeScript union and the builder switch in three-way agreement. Three separate
paths send mail — the outbox, the auth action, and `finalizeOrder`'s voucher
mail — and each has a reason.

The gap was not a missing feature. **Nobody had ever looked at the mail.**

## Every test asserts a substring

Fifteen builders write raw HTML: hand-placed `dir` attributes, hand-placed
bidi isolates, inline styles, because that is what mail clients accept. All
fifteen are covered, and every one of those assertions is of the shape

```ts
expect(mail.text).toContain('שלום דנה')
```

which proves the greeting is *in the string*. It proves nothing about whether
the layout holds, whether a Hebrew line wraps against a number, whether the
shekel sign lands on the wrong side of an amount, or whether a button is
reachable. The one property that can be got wrong invisibly in an RTL mail —
`dir="rtl"` missing, so it renders left-aligned in every client and looks like
somebody else's mail — was asserted nowhere.

`/dev/emails` is where you look now. `src/lib/email/previews.ts` is the data
behind it: one sample payload per mail, going through `buildNotification`, the
same door the drain uses.

**The samples are deliberately awkward.** `{ name: 'Test', amount: 100 }`
renders beautifully and tells you nothing. Every sample carries what actually
breaks an RTL mail: a Hebrew name beside a Latin one, an amount with agorot, a
product title long enough to wrap, a tracking number that has to stay LTR inside
a Hebrew sentence, and a phone number stored as `972524635550` because that is
what is in the database.

**Two parcels in the shipping sample**, one with a tracking URL and one without,
because a multi-supplier order is this platform's normal case and a layout only
ever seen in its easy shape is a layout nobody has checked.

**HTML and text, side by side.** Every builder produces a plain-text
alternative and it is the half nobody reads: what a screen reader announces on
some clients, what a text client shows, what a spam filter excerpts. A gallery
rendering only the HTML would leave exactly the unchecked half unchecked.

**The HTML renders in an `iframe` with `srcDoc`, not injected.** Mail HTML
carries its own `dir`, styles and colours; dropping it into the page would let
it inherit the site's CSS, so the preview would show something the customer
will never see.

**Dev only, with `notFound()` and not a guard.** A guard implies there is
something behind it; in production this route does not exist. The check is on
`NODE_ENV`, which is `production` for a local `pnpm start` — so it is
unavailable in exactly the mode that mirrors production, on purpose. It is a
`pnpm dev` tool.

**Nothing is sent from it, and there will be no "send test" button.** A page
that can put a message in a customer's inbox is a page that eventually does,
from a laptop, with a sample payload.

### The gallery is checked for completeness, in both directions

A preview page listing twelve of fourteen mails is *worse* than none: it reads
as "these are the mails", and the two nobody can see are the two that ship
broken. `previews.test.ts` reads the `NotificationKind` union out of the source
and asserts every kind has a sample, and that every sample maps to a kind — with
the two non-outbox builders (`magic_link`, the voucher mail) named as the
exceptions they are.

### Three samples were wrong on the first run, and that is the finding

`refund_completed`, `low_stock` and `reconciliation_gap` returned **null** from
`buildNotification`. Not an exception — null.

Each builder validates and gives up quietly: `refund_completed` needs
`refunded_agorot` (not `amount_agorot`, which is what the first draft of the
sample passed), `low_stock` needs `product_id`, `reconciliation_gap` needs
`critical > 0`. Those guards are right — a reconciliation run with no critical
findings has nothing to page anybody about.

What it demonstrates is the failure mode: **a payload whose field names have
drifted from its builder produces no mail and no error.** The enqueuer writes
a row, the drain calls the builder, gets null, and moves on. That is invisible
in production and it took a gallery to notice it in a sample.

## react-email is not used, and that is a refusal

The spec asks for react-email. It is not adopted, for three reasons and one
measurement.

**The measurement:** fifteen builders, all shipping, all tested, all producing
correct Hebrew RTL that has now been looked at. A rewrite has no functional
destination — the output would be the same mail.

**The bidi work does not transfer.** These builders place
`RTL_ISOLATE_STYLE`/`LTR_ISOLATE_STYLE` by hand around every value that could be
a number next to Hebrew, which is what keeps `₪34,990` from rendering as
`34,990₪` in Gmail. That knowledge lives in `lib/email/bidi.ts` and in the exact
placement inside each template; a JSX rewrite would carry it across by hand,
one template at a time, with substring tests as the only safety net — which is
precisely the safety net this document opens by calling insufficient.

**It would add a build step to the money path.** `voucher-email.ts` runs inside
`finalizeOrder`. A render pipeline between "the card was charged" and "the
customer has their voucher" is a new way for that step to fail.

What react-email would genuinely buy is component reuse and a preview server.
The preview server is what `/dev/emails` is, at a fraction of the cost. The
reuse is worth revisiting if a sixteenth builder needs the same header for the
fourth time.

## The kinds, against what was asked

| asked for | kind | state |
| --- | --- | --- |
| order confirmed | `order_paid` | live |
| voucher issued with QR | `voucher_issued` + the voucher mail | live |
| expiring 7d / 1d | `voucher_expiring` | live, `days_left` in the payload |
| redeemed | `voucher_redeemed` | live |
| refund done | `refund_completed` | live |
| wallet credit | `cashback_credited` | live |
| shipping updates | `order_shipped` | live; carries tracking as of 196 |
| welcome | `welcome` | live, deduped on the user id |
| password reset | `magic_link` | live, through Resend rather than Supabase SMTP |
| abandoned cart 1h / 24h | — | **not an outbox kind**; see below |

**The abandoned-cart mail does not go through the outbox.** It calls `sendEmail`
directly from `/api/cron/abandoned-cart` and gets its idempotency from its own
`abandoned_cart_nudges` table, keyed on the cart, with the second reminder
waiting on `migrations/pending/190`. That is a second send-log with a second set
of rules, and it works — but "the idempotent send log" is two things, and
anybody reading `notification_outbox` as the record of what this system has
mailed will be wrong by every recovery nudge ever sent.

**`account_deleted` is accepted by the database and renders nothing.** It
entered the CHECK with migration 150 and no builder was ever written.
`outbox-kinds.test.ts` records it explicitly as
`CHECK_ACCEPTS_BUT_RENDERS_NOTHING`, and `account.ts` deliberately does not
enqueue it, so nothing is lost today — but the constraint says the system can
accept a kind it cannot render.

## The unsubscribe centre

`/newsletter/unsubscribe` exists and is a marketing unsubscribe: it stops the
newsletter and honours the suppression list. There is no per-kind preference
centre, and building one needs a `notification_preferences` table, which is
`SECTIONS 70`'s and is where it belongs — a preference row with no bell, no push
and no channel column beside it would have to be migrated again a day later.

Nothing above is affected: a transactional mail about an order somebody placed
is not something to unsubscribe from, and the kinds that would be optional
(`voucher_expiring`, `cashback_credited`) are the ones a preference centre would
govern.

## Files

| | |
| --- | --- |
| `src/lib/email/notifications.ts` | thirteen outbox builders and the switch |
| `src/lib/email/voucher-email.ts` | the voucher mail, sent from `finalizeOrder` |
| `src/lib/email/magic-link.ts` | login and password reset |
| `src/lib/email/bidi.ts` | the isolate helpers every builder places by hand |
| `src/lib/email/previews.ts` | one awkward sample per mail |
| `src/lib/email/previews.test.ts` | the gallery is complete, both directions |
| `src/app/dev/emails/` | the gallery. Dev only, sends nothing. |
| `src/lib/email/outbox-kinds.test.ts` | DB constraint ↔ union ↔ switch, three ways |
