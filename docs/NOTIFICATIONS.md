# Notifications: three channels built, one missing, and a publication with nothing in it

Measured 2026-09-09 against production (`ixvwfbuvfxxsjiywhbbb`).

Three of the four channels were already complete. `push_subscriptions` (179,
applied) with VAPID, a service worker and a full dispatch/store/templates
module. The WhatsApp tables (173, applied) with a Twilio client, an outbox and a
cron. `notification_outbox` with dedupe keys, retry and backoff.

Two things were missing and one was a trap.

## Correction, 2026-09-09 (SECTIONS 45): push was NOT complete

The paragraph above says `push_subscriptions` (179, applied) with VAPID, a
service worker and a full dispatch module. Every clause is true and the
conclusion was wrong: **there was no sender.**

`dispatch.ts` is the EXPO transport. It reads `push_tokens` through
`fn_push_targets`, whose whole body is `SELECT ... FROM push_tokens WHERE
t.enabled`. Nothing in the repository could send to a `push_subscriptions` row,
and 179's own header says so in as many words: "there is no sender yet". So a
customer could open `/account/notifications`, grant the permission, see
`התראות פעילות בדפדפן הזה`, and never receive anything. `VAPID_PRIVATE_KEY` sat
in the environment unread for the same reason.

What that cost is worse than a missing feature: the ONE permission the browser
will ever grant was being spent on a channel that could not deliver, and a
denied permission cannot be asked for again.

`src/lib/push/web-push.ts` and `src/lib/push/web-leg.ts` are the sender.
`pushOutboxRow` now attempts both transports for every row and
`combinePushLegs` reduces them to the single outcome the outbox records - any
delivery wins, retry beats skipped, and skipped counts no attempt.

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

**As of 2026-09-09 it is no longer empty, and 198 is applied.** Re-measured:

```
select * from pg_publication_tables where pubname = 'supabase_realtime'
  ->  public.notifications

select relreplident from pg_class where oid = 'public.notifications'::regclass
  ->  f   (FULL)
```

So the bell's subscription fires. The rest of this section is kept because the
trap it describes is real and is the reason the design does not depend on the
answer:

A `postgres_changes` subscription against a table that is not in the publication
**connects, reports `SUBSCRIBED`, and receives nothing.** No error on either
side. The channel looks healthy and is deaf.

That is a failure no test in this repository can see, and it is switchable from
a dashboard by somebody who will never read this file — which is why the
`ALTER PUBLICATION` is part of migration 198 rather than something to remember
afterwards —
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

## SMS was a refusing stub; the reason it refused is now the flag

**BUILT 2026-09-09 (SECTIONS 46).** The section below is kept because its
argument is still the operating constraint. What changed is where the guard
lives.

The stub made "unimplemented" the guard, which meant the code could not be
reviewed, tested or costed until the day somebody needed it in a hurry. The
guard is now `SMS_ENABLED` plus `TWILIO_SMS_FROM`, both absent everywhere
today, so the behaviour is byte for byte what it was -- every send skips with a
reason -- while the code that will run on registration day exists and is
tested against a mocked Twilio.

TWO LOCKS AND NOT ONE, because `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` are
shared with WhatsApp and are already set wherever WhatsApp is configured. With
a credentials-only check, the day somebody sets a `TWILIO_SMS_FROM` for a test
the whole notification queue starts texting real customers from an unregistered
sender -- and the carriers drop those silently, so nothing reports it.

### What Hebrew costs, and why it is a column

An SMS is 160 characters only in GSM 03.38, which is Latin. One Hebrew letter
switches the WHOLE message to UCS-2, where a segment is **70** characters and
**67** per part of a multipart. A 140-character notification reads as "well
under the limit" and is billed as THREE messages. A Hebrew SMS programme costs
two to three times a per-message estimate and the difference is invisible until
the invoice, so `sms_messages.segments` is recorded per send and
`src/lib/sms/templates.test.ts` asserts a segment ceiling per template.

The price is `price_micro` + `price_currency` and NOT agorot. That is a
deliberate exception to the money rule, argued in `migrations/pending/216`: it
is USD, Twilio quotes five decimal places, and agorot would need an FX rate the
row does not have while rounding $0.0075 to 1 agora.

### The opt-out keyword Twilio does not recognise

Twilio intercepts STOP, STOPALL, UNSUBSCRIBE, CANCEL, END and QUIT and blocks
the number. Every one is ENGLISH. An Israeli customer replies **הסר**, which
Twilio forwards as an ordinary inbound message and does nothing about. A shop
relying on the carrier's own handling has an opt-out that works for the
customers who would never have used it and fails for the ones who do.

`sms_opt_outs` is keyed by PHONE and not by user, because an opt-out is a
property of a handset. The check FAILS CLOSED -- the only read in this stack
that does -- because not knowing whether somebody opted out is not permission
to message them.

One exemption, and it is not a loophole: an OTP is something the customer asked
for by pressing a button seconds earlier, and suppressing it would lock somebody
out of their own account over a STOP they sent two years ago.

### The original refusal, unchanged

#### (the original section, as written, because its argument is the operating constraint)

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
**DONE 2026-09-09 for email and push; WhatsApp is still open.**
`src/lib/notifications/preference-store.ts` reads the table once per outbox row
and both legs of `/api/cron/notifications` consult it. An absent table reads as
"no opinion recorded", which is the same answer defaults-on gives, so a stale
schema cache cannot silence every optional notification for everybody.

The email leg settles a switched-off row as `skipped`, not `dead`: the customer
can switch it back on, and no attempt is counted against the row's five. The
push leg returns `skipped` for the same reason - `none` would settle the kind
permanently and make the switch one-way.

The WhatsApp cron is the remaining call site. It is named here rather than
quietly left, because a preference centre that saves a setting nothing reads is
the worst of the three states: it looks finished to the customer and changes
nothing.

## Files

| | |
| --- | --- |
| `src/lib/notifications/preferences.ts` | required vs optional, and the resolver |
| `migrations/applied/198_in_app_notifications.sql` | the table, the RLS, the publication. **Applied** (corrected 2026-09-09). |
| `src/server/queries/notifications.ts` | the bell's reads, surviving 198's absence |
| `src/server/actions/notifications.ts` | mark read, save a preference |
| `src/components/notifications/NotificationBell.tsx` | the badge, server-first |
| `src/components/notifications/PreferenceSwitches.tsx` | one write per switch |
| `src/lib/push/` | VAPID, dispatch, store, templates (existing, applied) |
| `src/lib/whatsapp/` | Twilio client and outbox (existing, applied) |
| `src/lib/sms/twilio.ts` | the shape, refusing until a sender is registered |

---

## 2026-09-09: the centre had no writer, and now has one

**Measured:** the only statements against `notifications` anywhere in the
repository were two `SELECT`s in `src/server/queries/notifications.ts` and one
`UPDATE` of `read_at` in `src/server/actions/notifications.ts`. Nothing had ever
inserted a row.

So everything above was true and the feature was still empty: 198 applied, RLS
right, both indexes present, `REPLICA IDENTITY FULL` set, `notifications` in the
`supabase_realtime` publication, a bell that reads a server-rendered count, an
account page, and a live subscription. A complete, correct, permanently empty
notification centre.

### A fourth leg on the outbox, not a second pipeline

`/api/cron/notifications` already fans one outbox row out to email, push and
WhatsApp. In-app is the fourth. It is not a separate pipeline because two
pipelines over the same events are two chances to disagree about whether an
event happened, and that disagreement always surfaces as a customer who was
emailed about a voucher the site says they do not have.

It runs **before** the push leg's `continue`, which is not a style point: every
branch of the push leg ends in `continue`, so anything after it is reached only
by rows that happen to owe a push.

### The allowlist is the security boundary

`IN_APP_KINDS` in `src/lib/notifications/in-app.ts` is an allowlist, because the
two failure directions are not symmetric. A customer kind missing from it is a
notification nobody gets, which somebody reports. An **operator** kind leaking
through is `reconciliation_gap: settlement short by ₪4,102` in a shopper's bell,
which is an internal finance figure published to a stranger.

`supplier_sale`, `invoice_dead`, `low_stock`, `reconciliation_gap` and
`settlement_gap` are refused by name and by test. `notification_outbox.user_id`
is null for them anyway, and the drain checks that too: two independent refusals
of the same fact.

### Preferences are honoured, through the channel that already existed

`CHANNELS` in `preferences.ts` has always included `in_app`. The leg calls
`mayNotify(kind, 'in_app', rows)`, so a customer who switches a kind off in-app
stops getting it there while their email is untouched. Required kinds ignore the
table, as they do on every other channel.

### Idempotency belongs to the database

`223` adds `notifications.outbox_id`, unique, and the insert is
`ON CONFLICT DO NOTHING`. A row is selected while **either** leg is pending, so
the same row is seen again on later runs; without the constraint the customer
would be notified once per run for as long as the mail kept failing.

Until 223 is applied the leg **does nothing at all** rather than inserting
without the link. A leg that cannot be idempotent is worse than a leg that
waits.

