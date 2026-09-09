# Email deliverability

Section 60 of `~/ke-goals/SECTIONS.md`.

Run the check before reading anything else here:

```
node scripts/email-dns-check.mjs
```

## What is wrong right now, measured 2026-09-09

Four defects, all in DNS, none visible from anywhere in this repository, none
producing an error anywhere. The kind of thing found by a customer not
receiving a coupon they paid for.

### 1. The SPF record for the sending subdomain contains a pasted placeholder

Live:

```
send.kenyonexpress.co.il.  TXT  "v=spf1 include[...].nses.com include:amazonses.com ~all"
```

`include[...].nses.com` is not a valid SPF term. RFC 7208 section 4.6 makes a
syntax error **anywhere in the record** a `permerror` for the whole record, so
this does not merely fail to help: it takes the valid `include:amazonses.com`
beside it down with it. Every message Resend sends has its return-path in this
domain, so every message is evaluated against a record that cannot be evaluated.

### 2. Two DKIM records at one selector, one of them also a placeholder

Live:

```
resend._domainkey.kenyonexpress.co.il.  TXT  "p=MIGfMA0CGsq[...]nUa5ZwIDAQAB"
resend._domainkey.kenyonexpress.co.il.  TXT  "p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCSLiJ..."
```

RFC 6376 leaves the choice between multiple key records to the verifier, which
in practice means some receivers pick the truncated one and every signature
they check fails. The second record is the real key.

### 3. DMARC reports nowhere

Live: `v=DMARC1; p=none;`

`p=none` is the correct **first** state and is not a defect. Having no `rua=` is:
with no reporting address, nobody ever learns whether SPF and DKIM align for
legitimate mail, and `p=none` without `rua` is a record that does nothing at
all. It cannot be moved to `quarantine` safely, because there is no evidence to
move it on.

### 4. Nothing listens to the bounce and complaint webhook

`email_suppressions` has existed since `095_notification_outbox.sql`,
`fn_enqueue_notification` has consulted it before queueing ever since, and it
holds **zero rows** - because Resend reports a bounce or a complaint exactly
once, over a webhook, and nothing was listening. Fixed in code by [60]; see
below.

### And one that is not DNS

The apex domain already sends mail through somebody else. `kenyonexpress.co.il`
has `MX 10 mailgw2.spd.co.il` and an SPF including `relay.mailchannels.net` and
`_spf.elasticemail.com`. Whatever reputation the apex carries is shared with
that history, which is the argument for the dedicated sending subdomain below.

## The records, exactly as they must appear

DNS for this zone is at **Cloudflare** (`ignat.ns.cloudflare.com`,
`tess.ns.cloudflare.com`). This repository cannot change it: the Cloudflare
connector available here exposes Workers, R2, KV, D1 and Hyperdrive, and no DNS
API. These have to be applied by hand.

Set **proxy status to DNS only** for every record below. Cloudflare's proxy does
not apply to TXT or MX, but the toggle appears and turning it on for a
hostname that also has an A record is how a mail subdomain stops resolving.

### SPF, on the sending subdomain

| | |
| --- | --- |
| Type | `TXT` |
| Name | `send` |
| Content | `v=spf1 include:amazonses.com ~all` |
| TTL | Auto |

Replace the existing record; do not add a second one. **Two SPF records is a
`permerror` by itself** (RFC 7208 section 3.2), so adding rather than replacing
turns one defect into two.

`~all` and not `-all`: softfail while the domain is new. `-all` tells a receiver
to reject outright, and the first misconfiguration then costs delivery of live
receipts rather than a spam-folder placement.

### DKIM

| | |
| --- | --- |
| Type | `TXT` |
| Name | `resend._domainkey` |
| Content | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCSLiJVyYJvyWcY6mDZv3g7chG2nVI8v2vq6Oc67XUeShO8kXAytuQND5FXmZtgnxHJuJsLRhzhQZhu1QiEWm4Dvj8V+SlWrGu0gSx6HO7fpaHqCU4odp4vd6NXLaAiNkYHSl05GlXx2UH7jCN8RmlmV6icllIaIw0uUN+qNUaS2wIDAQAB` |
| TTL | Auto |

**Delete the other record at this name**, the one containing `[...]`. The value
above is the key already in the zone, copied from it, so applying this changes
nothing except removing the ambiguity.

If Resend has since rotated the key, take the value from Resend's dashboard
rather than from here, and delete both existing records.

### The bounce MX

| | |
| --- | --- |
| Type | `MX` |
| Name | `send` |
| Content | `feedback-smtp.us-east-1.amazonses.com` |
| Priority | `10` |
| TTL | Auto |

Already correct in the live zone. Listed because it is part of the set and
because deleting it silently stops bounce reporting, which is what fills the
suppression list.

### DMARC

| | |
| --- | --- |
| Type | `TXT` |
| Name | `_dmarc` |
| Content | `v=DMARC1; p=none; rua=mailto:dmarc@kenyonexpress.co.il; fo=1; adkim=r; aspf=r` |
| TTL | Auto |

`rua` is the change. `fo=1` asks for a failure report when **either** SPF or
DKIM fails, rather than only when both do, which is what makes the reports
useful while one of the two is being fixed. `adkim=r` and `aspf=r` are relaxed
alignment, which is what lets a return-path of `send.kenyonexpress.co.il` align
with a From of `kenyonexpress.co.il`; strict alignment would fail every message
Resend sends.

The `rua` mailbox must exist and must be able to receive from strangers. The
apex MX points at `mailgw2.spd.co.il`, so this is created there and not in
Resend.

**Do not move to `p=quarantine` on the same day.** See the warm-up plan.

## The dedicated sending subdomain

[60] asks for one. Resend's current setup uses `send.kenyonexpress.co.il` as the
**return-path** only; the From address is `noreply@kenyonexpress.co.il`, on the
apex, which is also the domain that sends through MailChannels and ElasticEmail
and receives through `spd.co.il`.

The recommendation is therefore to move the From address as well:

```
EMAIL_FROM=KenyonExpress <noreply@mail.kenyonexpress.co.il>
```

after adding `mail.kenyonexpress.co.il` as a domain in Resend and applying the
three records it issues for it. That is one environment variable in Vercel;
`mailFrom()` in `src/lib/email/resend.ts` reads it and `src/lib/growth/resend.ts`
falls through to it.

**It is not done here, and the reason is that it would be done blind.** Adding a
domain in Resend needs the Resend dashboard. The `RESEND_API_KEY` in
`.env.local` on this machine answers `{"statusCode":400,"message":"API key is
invalid"}` to `GET /domains`, so from here it is impossible to see which domains
are verified, add one, or read back the records it issues. Guessing a subdomain
into `EMAIL_FROM` before Resend has verified it does not degrade delivery, it
**stops it**: Resend refuses a send from an unverified domain outright.

What that costs while it is not done: the apex's reputation is shared with two
other senders, and a DMARC policy stricter than `none` applies to all three at
once.

## What the code does now

### The suppression list is written for the first time

`POST /api/webhooks/resend`, verified with the Svix signature Resend signs with
(`src/server/email/svix.ts`, no SDK: it is one HMAC, and a dependency in the
path that decides whether an unauthenticated POST may write the suppression list
is one that has to be audited forever).

**Without `RESEND_WEBHOOK_SECRET` the route answers 401 to everything.** An
unconfigured deploy is a closed one, the same stance `CRON_SECRET` takes on the
cron routes. Accepting unsigned posts would make this an unauthenticated
endpoint that writes the suppression list: anyone could post `email.bounced` for
any address and stop that person receiving the coupon they paid for.

The timestamp is checked in both directions with Svix's 300-second tolerance,
because without it a captured signature is valid forever and a replayed bounce
suppresses an address permanently.

**A soft bounce does not suppress.** A full mailbox, a greylisting deferral and
a receiver having a bad afternoon all arrive as `email.bounced`. Only
`data.bounce.type = Permanent`, or SES's `subType = Suppressed`, suppresses; an
unrecognised shape does not. The default direction costs a bounce we mail again
rather than a customer we silently stop mailing. Soft bounces are still
**counted**, because "this template bounces a lot" is exactly what the counters
are for.

**A complaint always suppresses**, and `suppress_email` ranks reasons so that a
later `manual` or `unsubscribed` cannot overwrite it. A complaint is a receiver
telling us the mail was unwanted; the others are reversible by a person.

### The check now covers every sender

`fn_enqueue_notification` protected outbox mail only. Nine call sites reach
`sendEmail` directly - the coupon delivery from `finalizeOrder`, the magic link,
the weekly digest, the abandoned-cart nudge, the contact form, the supplier lead
- and none of them passes through it, so a hard-bounced address was suppressed
for one kind of mail and mailed by the other six. The check is now in
`lib/email/resend.ts` and `lib/growth/resend.ts`, which is every path out.

**It fails open**, deliberately. If the suppression read itself fails - 207
unapplied, or the database unreachable - the mail is sent. Failing closed would
mean an outage in one table silences the coupon a customer just paid for, which
is a refund and a support ticket; a suppressed address mailed once more during
an outage costs one message. The asymmetry is the argument, and both directions
are logged.

### Open and click tracking that stores nobody

`email_events_daily` is a count per `(day, template, event)`. It answers "is the
coupon mail being opened less than it was" and "is one template bouncing harder
than the others". It cannot answer "did this customer open it", and there is no
column that could be joined to make it answer that.

The normal implementation is a row per message with a recipient, an `opened_at`,
a user agent and an IP, which is a reading-behaviour profile per customer - on a
site whose own privacy page promises search terms are kept "as terms only,
without a user and without an IP address". The webhook does not log the address
either, for the same reason.

`sent` is counted by the sender rather than the webhook, because Resend has no
`email.sent` event: the first thing it reports is `delivered`, so without it
every rate would have no denominator and a template refused at the API would
look like a template nobody opens.

Two tag names are read, `template` and `kind`, because the transactional and
marketing senders tag differently and renaming either would orphan the events
still to arrive for mail already sent.

## The warm-up plan

**The domain has sent no measurable volume.** There is no history to protect and
no reputation to preserve, which makes this a cold start rather than a
migration.

The constraint that shapes it: **most of this site's mail is transactional and
cannot be paced.** A coupon is issued the moment a card is charged, and holding
it back to respect a daily cap means a customer who paid and received nothing.
So the warm-up applies to **marketing sends only**, which are the ones with a
send button.

| Days | Marketing sends per day | What has to be true before moving on |
| --- | --- | --- |
| 1 to 3 | 50 | `node scripts/email-dns-check.mjs` clean. Send to staff addresses only, across Gmail, Outlook and a Walla or Hotmail account. |
| 4 to 7 | 200 | The first `rua` reports have arrived and show SPF and DKIM **aligned**. Bounce rate under 2%. |
| 8 to 14 | 1,000 | Complaint rate under 0.1%. Suppression list filling, which proves the webhook works. |
| 15 to 21 | 5,000 | Same two thresholds held for a full week. |
| 22 onward | No cap | Move DMARC to `p=quarantine`. |

Transactional mail is not capped at any stage.

**The thresholds are Google's published ones**, not invented here: Gmail's bulk
sender rules require a spam complaint rate under 0.10% and say 0.30% is where
enforcement starts. Bounce rate is the industry convention rather than a
published rule.

**Do not move to `p=quarantine` before the reports are clean.** A DMARC policy
stricter than `none` applies to the apex, which also sends through MailChannels
and ElasticEmail; quarantining before those are either aligned or retired means
quarantining somebody else's mail as well as ours.

The daily numbers come from `email_events_daily`:

```sql
select day, template, event, count
from email_events_daily
where day >= current_date - 7
order by day desc, template, event;
```

## What was not done, and why

**The Resend domain is not verified from here.** The API key on this machine is
rejected by Resend, so it is impossible to see which domains are verified, add
one, or read back the records it issues. Everything that needs the dashboard is
listed above rather than guessed at.

**The DNS records are not applied.** They are at Cloudflare and this repository
has no DNS API. `scripts/email-dns-check.mjs` exits 1 today and will exit 0 when
they are, which is the closest thing to applying them that can be built from
here.

**No admin screen for the counters.** The data has one consumer, the SQL above,
and a screen is [62]'s kind of work rather than a deliverability question. It is
named here so it is a deferral rather than an omission.

**No per-message log, on purpose.** See the privacy note above. It is the thing
most email dashboards are built on and it is not being built.
