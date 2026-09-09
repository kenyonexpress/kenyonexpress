# Notifications: three channels built, one missing, and a publication with nothing in it

Measured 2026-09-09 against production (`ixvwfbuvfxxsjiywhbbb`).

Three of the four channels were already complete. `push_subscriptions` (179,
applied) with VAPID, a service worker and a full dispatch/store/templates
module. The WhatsApp tables (173, applied) with a Twilio client, an outbox and a
cron. `notification_outbox` with dedupe keys, retry and backoff.

Two things were missing and one was a trap.

## `notification_outbox` cannot back a bell

It is an **email queue**. An address, a payload, a dedupe key, drained by a
cron, and a row leaves it when the mail is sent. It is a record of what we tried
to **send**, not of what a customer has been **told**.

Reusing it for an in-app centre would produce an "unread" count that clears when
a cron runs rather than when somebody reads something. So `notifications` is its
own table: per user, with `read_at`, and kept after reading.

A customer on the site had no way to see that their voucher was redeemed unless
they happened to open the mail.

## The publication was empty, and that is the trap

```
select * from pg_publication_tables where pubname = 'supabase_realtime'  ->  0 rows
```

A `postgres_changes` subscription against a table that is not in the publication
**connects, reports `SUBSCRIBED`, and receives nothing.** No error on either
side. The channel looks healthy and is deaf.

Nothing in this codebase subscribes to anything today, so it is not a live bug.
It is the bug the bell would have had, and it is why the `ALTER PUBLICATION` is
part of migration 198 rather than something to remember afterwards —
`REPLICA IDENTITY FULL` with it, because Supabase evaluates the `user_id=eq.`
filter against the WAL record and the default identity carries no `user_id` on
an UPDATE.

**The badge does not depend on it.** The count is rendered by the server, so it
is right on first paint and right after every navigation, with realtime adding
live increments on top. A bell whose badge came only from a live subscription
would have read zero forever, for everyone, and looked like a working feature
with nothing to show.

## What a customer may and may not switch off

The design decision worth stating: **`REQUIRED_KINDS` is checked before the
preferences table is read**, and there is no row, no switch and no read for
those kinds.

A preference table with one row per kind per channel invites exactly one
mistake — letting a customer switch off the mail carrying the coupon they just
paid for. The support ticket is "I bought it and nothing arrived", and the
answer is a setting they turned off six weeks earlier and do not remember.

**What makes a kind required is not "important".** It is whether the message
*is* the thing the customer bought, or is the record of money moving:

| required | why |
| --- | --- |
| `order_paid` | the receipt |
| `voucher_issued` | the coupon *is* the product |
| `voucher_gifted` | the recipient never asked and has no preference to consult |
| `refund_completed` | the only proof the money came back |

Everything else is optional, per channel. `order_shipped` is the closest call
and is optional: it is not the product and not money, it is a service update
about a parcel that is coming either way.

**Operator alerts are in neither list.** `invoice_dead`, `low_stock` and
`reconciliation_gap` go to a fixed operator address, not to a user, so a
per-user preference for them would be a row nobody owns. `isPreferenceKind`
refuses them rather than defaulting them to enabled, because a setting that
appears to exist and governs nothing is worse than no setting.

**Default on.** A missing row means the customer has never opened the settings
page — which is all of them, since the table is empty. Treating silence as "do
not contact me" would stop every expiry reminder in the system.

**No switch is ever rendered greyed out.** A disabled control labelled "cannot
be turned off" reads as a broken control and invites the conversation the design
avoids. The page says it in a sentence instead.

**Saved one switch at a time, not on a form submit.** A settings page with a
save button is a page where somebody changes three things, closes the tab, and
keeps getting the mail they turned off.

## Security, proven rather than described

The client may mark a notification read and change nothing else, and that is
enforced by a **column grant** rather than a policy predicate:

```sql
GRANT UPDATE (read_at) ON public.notifications TO authenticated;
```

An UPDATE policy scoped to the owner alone would let a customer rewrite the
title of their own notification — harmless until one is quoted in a support
conversation.

Verified against production inside a rolled-back `DO` block:

```
in_publication=1  absolute_href=REFUSED  mark_read=ALLOWED
rewrite_title=REFUSED  other_users_visible=0
```

The table joined the publication; an absolute `href` was refused by the CHECK
(an absolute URL there would let a writer point the bell at another origin, and
the bell is a link a customer trusts because it is inside their account); the
owning customer could mark read but not rewrite a title; another user's rows
were invisible.

**Both the reads and the writes go through the request-scoped client, not the
service role.** The RLS policy is `user_id = auth.uid()`, so the session *is*
the filter. Reading through the admin client and adding `.eq('user_id', …)` in
TypeScript would move that filter into application code, where forgetting it
once shows one customer another customer's notifications.

## The bell is in the account area, not the storefront header

Measurable rather than aesthetic. `SiteHeader` is under the pixel-parity gate,
which must stay under 11% at 380, 768 and 1440; adding an element changes the
header's geometry at every width, and the first thing that would report is a
gate about a design reference rather than about notifications.

The account area is also where a bell is worth having: it is the only place a
customer is signed in by construction, and the count is a property of a session.

## SMS is a refusing stub, and the reason is not difficulty

Twilio's SMS endpoint is the same `Messages` resource the WhatsApp client
already posts to, with a different `From`. The HTTP call is fifteen lines.

What is missing is what makes those lines legal to run. **Israel requires a
registered sender**, and a message from an unregistered one is dropped by the
carriers without a bounce: Twilio reports `delivered`, the phone never rings,
and nothing on either side says so. That is worse than not sending, because it
is invisible and it spends the customer's trust in the channel silently.

`TWILIO_SMS_FROM` is a **separate** variable from `TWILIO_WHATSAPP_FROM`, so
configuring WhatsApp cannot silently enable SMS from a number not approved to
send it.

SMS earns its place when there is a message that must arrive on a phone with no
data connection — a redemption code at a counter with no reception is a real
case, and nothing currently sends one.

## What is not done

**Nothing writes a `notifications` row yet.** The table, the RLS, the bell, the
page and the preference resolver are all in place; what is missing is the line
in each enqueue path that also writes an in-app row. That is deliberate
sequencing: adding writers before 198 is applied would put `42P01` handling into
`finalizeOrder` and the voucher sweep, on the money path, for a table that does
not exist.

**The preference resolver is not yet consulted by the senders.**
`mayNotify` is pure, tested and unused. Wiring it means a read per send in the
notification drain, the push dispatcher and the WhatsApp cron — three call
sites, each of which needs its own decision about what to do when the read
fails, and none of which can be tested end to end until there are preferences to
read.

Both are named here rather than described as done, because a preference centre
that saves a setting nothing reads is the worst of the three states: it looks
finished to the customer and changes nothing.

## Files

| | |
| --- | --- |
| `src/lib/notifications/preferences.ts` | required vs optional, and the resolver |
| `migrations/pending/198_in_app_notifications.sql` | the table, the RLS, the publication. Not applied. |
| `src/server/queries/notifications.ts` | the bell's reads, surviving 198's absence |
| `src/server/actions/notifications.ts` | mark read, save a preference |
| `src/components/notifications/NotificationBell.tsx` | the badge, server-first |
| `src/components/notifications/PreferenceSwitches.tsx` | one write per switch |
| `src/lib/push/` | VAPID, dispatch, store, templates (existing, applied) |
| `src/lib/whatsapp/` | Twilio client and outbox (existing, applied) |
| `src/lib/sms/twilio.ts` | the shape, refusing until a sender is registered |
