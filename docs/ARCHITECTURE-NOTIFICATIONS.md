# ARCHITECTURE: Notifications (Transactional + Reminders)

Status: design draft. Not applied. This document describes the transactional
and reminder notification system for KenyonExpress (Hebrew RTL marketplace,
Next.js + Supabase Postgres, payments via Cardcom).

Scope of this doc:

1. Supplier new-order notification (email + SMS).
2. Customer order confirmation and coupon issuance email (QR link to
   `/account/coupons`).
3. Coupon expiry reminder (N days before `coupon_codes.expires_at`).
4. Webhook / delivery retry queue (outbox pattern, backoff, claim-batch,
   idempotent send).
5. Template system (RTL Hebrew, variables, per-channel, versioning,
   marketing vs transactional split under Israeli spam law 30א).
6. Provider abstraction (email + SMS) and consent / suppression handling.

Marketing journeys (abandoned cart, winback, promotions) live in the companion
document `ARCHITECTURE-NOTIFICATIONS-MARKETING.md` and are out of scope here
except where the shared transport (outbox, templates, consent) is defined.

## 0. Relationship to existing schema

This design is fresh, but it builds on structures already sketched in the
unapplied draft migrations:

- `029_accounts.sql` (draft) introduced `notifications_outbox`,
  `user_notification_preferences`, the enum `notification_status`
  (`queued`, `sent`, `failed`, `cancelled`), and
  `fn_enqueue_coupon_expiry_reminders()`.
- `031_notifications.sql` (draft) extends the outbox with delivery mechanics
  (attempts, backoff, worker claim, provider echo), adds
  `notification_templates`, `notification_events`, `consent_events`,
  `channel_suppressions`, and `notification_delivery_events`.

Neither migration is applied to any live database. The DDL below is the
canonical, self-contained target: if you apply it as one unit, you get the
transactional core. Names match the drafts so the two can be reconciled into a
single ordered migration set later.

Live tables this system reads from (already applied on the DB):

| Object | Origin | Notes |
| --- | --- | --- |
| `orders` (id, user_id, status, paid_at) | commerce | `status` becomes `paid` in `finalizeOrder` |
| `order_items` (id, order_id, supplier_id, product_id, product_type, quantity, item_status) | commerce | `product_type` in (`coupon`, `physical`) |
| `coupon_codes` (id, user_id, supplier_id, order_item_id, code, qr_token, status, expires_at) | migration 008 | `status` in (`issued`, `used`, `expired`, `refunded`) |
| `suppliers` (id, name, contact_email, contact_phone, status) | commerce | fulfillment party |
| `auth.users` | Supabase auth | customer identity + email |

## 1. Architecture overview

The system is event sourced at the domain boundary and queue driven at the
transport boundary. Three layers:

```text
  domain write (finalizeOrder, coupon issuance, expiry sweep)
        |
        v
  notification_events        append-only facts, no PII, deduped
        |
        | fan-out (fn_fanout_notification_events)
        v
  notifications_outbox       one row per (recipient, channel, message)
        |
        | claim-batch worker (cron every 1 min)
        v
  provider abstraction       EmailProvider / SmsProvider / (WhatsApp)
        |
        v
  provider webhooks -> notification_delivery_events -> suppression / consent
```

Why two stages (events then outbox) instead of writing outbox rows directly:

- The domain transaction (`finalizeOrder`) must never fail because a template
  is missing or a preference lookup is slow. It writes one small event row and
  commits. Fan-out is a separate, retryable step.
- One event fans out to many outbox rows (customer email + supplier email +
  supplier SMS) with different channels, recipients, and consent rules.
- Events are the audit trail. Outbox rows are ephemeral delivery attempts.

For low-volume transactional messages the fan-out can also be done inline in
the same server action right after the domain commit. The event table remains
the source of truth and the reconciliation point; the cron fan-out then only
catches events that inline fan-out missed (worker crash between commit and
enqueue). Both paths are idempotent on `notifications_outbox.dedupe_key`.

## 2. Trigger points

### 2.1 Order paid (`finalizeOrder`)

File: `src/server/payments/finalize.ts`, function `finalizeOrder`.

`finalizeOrder` is the single choke point where an order transitions
`pending -> paid` (guarded by `paid_at IS NULL`, so replays are no-ops). It
already: marks the payment `succeeded`, issues coupon codes for `coupon` items,
sets escrow holds, and updates `orders.status = 'paid'` / `paid_at = now()`.

Immediately after the successful order update, and inside the same logical unit
of work, emit one domain event per fact:

- `order_paid` for the order (drives the customer confirmation email).
- `coupon_delivered` for each `coupon_codes` row just issued (drives the coupon
  email with QR link).
- `supplier_new_order` for each distinct `supplier_id` across the order items
  (drives the supplier email + SMS).

The emit is done through `fn_emit_notification_event`, which is idempotent on
`dedupe_key`, so a replayed `finalizeOrder` produces no duplicate events.

Trigger alternative: a database `AFTER UPDATE` trigger on `orders` firing when
`status` goes to `paid` (see `trg_orders_notification_events` in the 031 draft).
The application-side emit is preferred for the transactional set because
`finalizeOrder` already holds all the derived facts (coupon ids, supplier ids)
in memory and can write a richer, correctly deduped payload without a second
round of queries inside a trigger. The DB trigger stays as a safety net for
paths that update order status outside `finalizeOrder`.

### 2.2 Coupon expiry sweep (cron)

A scheduled sweep enqueues reminders N days before `coupon_codes.expires_at`
for rows still in `status = 'issued'`. See section 6.

## 3. Supplier new-order notification

When a paid order contains at least one item whose `supplier_id` belongs to a
supplier, that supplier is notified so they can prepare fulfillment (physical)
or expect redemption (coupon).

### 3.1 Channel selection

| Condition | Email | SMS |
| --- | --- | --- |
| `suppliers.contact_email` present and not suppressed | yes | |
| `suppliers.contact_phone` present (E.164) and not suppressed | | yes |
| Both present | yes | yes (SMS is a short nudge, email carries detail) |
| Supplier `status <> 'active'` | no | no |

Supplier notifications are transactional (operational, tied to a transaction
the supplier is party to). They are NOT marketing. They are not gated by
`user_notification_preferences` (suppliers are not `auth.users` in the customer
sense) and not gated by anti-spam law 30א opt-in. They ARE gated by
`channel_suppressions` (a hard bounce or STOP reply still suppresses the
address) and by a per-supplier operational preference row if one exists.

One outbox row per (supplier, channel). Grouping: one email per supplier per
order (all of that supplier's items in one message), not one per item.

### 3.2 Payload

Event `supplier_new_order` payload (ids and facts only, no PII in the event
row; recipient contact is resolved at fan-out from `suppliers`):

```json
{
  "order_id": "0b2f...",
  "supplier_id": "a91c...",
  "order_short_code": "KX-24193",
  "placed_at": "2026-07-23T10:14:00+03:00",
  "item_count": 2,
  "items": [
    {
      "order_item_id": "77aa...",
      "product_id": "c010...",
      "product_type": "physical",
      "title_he": "מגבת חוף כותנה",
      "quantity": 1
    },
    {
      "order_item_id": "88bb...",
      "product_id": "c044...",
      "product_type": "coupon",
      "title_he": "ארוחה זוגית",
      "quantity": 1
    }
  ]
}
```

Notes:

- No customer name, phone, address, or payment detail in the event payload.
  Physical shipping details are fetched by the supplier through the
  authenticated supplier portal, not embedded in email or SMS. The email
  contains a deep link to the supplier order view.
- `title_he` is denormalized into the payload at emit time so the message can
  render even if the product is later edited or soft deleted.

### 3.3 Email content (transactional, RTL Hebrew)

- `template_key = 'supplier_new_order'`, `channel = 'email'`, `locale = 'he'`.
- Subject: `הזמנה חדשה בקניון אקספרס • {{order_short_code}}`
- Body lists the supplier's items (title, quantity, type badge coupon/physical),
  the placed time, and a primary button linking to the supplier order view
  (`/supplier/orders/{{order_id}}`). No customer PII in the body.

### 3.4 SMS content (transactional, RTL Hebrew)

- `template_key = 'supplier_new_order'`, `channel = 'sms'`, `locale = 'he'`.
- Body (short, single segment where possible):

```text
קניון אקספרס: הזמנה חדשה {{order_short_code}} ({{item_count}} פריטים). פרטים בפורטל הספקים.
```

SMS is a nudge, not the record. It never carries the deep link token (SMS links
are frequently reformatted by carriers and are a phishing vector); it directs
the supplier to log in.

## 4. Customer order confirmation and coupon issuance

### 4.1 Order confirmation email

- Event: `order_paid`. `template_key = 'order_paid'`, `channel = 'email'`,
  `locale = 'he'`.
- Recipient: `auth.users.email` for `orders.user_id`.
- Transactional. Sent regardless of marketing consent. Still checks
  `user_notification_preferences.order_updates_email` (default true) because the
  customer may have turned off operational email, and still checks suppression.
- Subject: `אישור הזמנה {{order_short_code}} • קניון אקספרס`
- Body: order summary (line items, quantities, totals in ILS), payment
  confirmation, a link to `/account/orders/{{order_id}}`. For orders that
  contain coupon items, a note that coupon codes were issued and a link to
  `/account/coupons`.

### 4.2 Coupon issuance email (with QR)

Coupon delivery is a separate message from the order confirmation so that each
coupon can carry its own QR and expiry, and so a partial refund of one coupon
does not muddy the order confirmation record.

- Event: `coupon_delivered` (one per issued `coupon_codes` row).
- `template_key = 'coupon_delivered'`, `channel = 'email'`, `locale = 'he'`.
- Recipient: `auth.users.email` for `coupon_codes.user_id`.
- Transactional.

QR handling. The QR encodes the existing `coupon_codes.qr_token` (already
generated in `finalizeOrder`). The email does NOT embed the live token as a
scannable image in the message body, because email images are cached by mail
clients and forwarded. Instead:

- The email shows the human readable `code` and a prominent button
  `הצג את הקופון והברקוד` linking to `/account/coupons` (authenticated). The
  scannable QR is rendered in the authenticated account page from `qr_token` at
  view time.
- Optionally, a signed short lived deep link
  `/account/coupons?c={{coupon_code_id}}` opens directly to that coupon after
  login.

Coupon email variables:

```json
{
  "customer_first_name": "דנה",
  "product_title_he": "ארוחה זוגית",
  "supplier_name": "מסעדת הים",
  "code": "KX-7F3Q-8H2M",
  "face_value_ils": 180.0,
  "expires_at": "2026-10-23T20:59:00+03:00",
  "coupons_url": "https://kenyonexpress.co.il/account/coupons",
  "coupon_deeplink": "https://kenyonexpress.co.il/account/coupons?c=88bb..."
}
```

### 4.3 RTL Hebrew email template (transactional example)

Stored in `notification_templates.body_html`. The wrapper enforces RTL. Rules:
`dir="rtl"` on the root, `text-align: right`, logical spacing, and a Hebrew
first font stack. Bidi isolation (`&#8207;` RLM or `<bdi>`) wraps any Latin or
numeric token (codes, order numbers) so they do not reorder inside RTL runs.

```html
<!-- template_key=coupon_delivered channel=email locale=he version=1 -->
<div dir="rtl" style="text-align:right;font-family:'Assistant','Rubik',Arial,sans-serif;color:#1a1a1a;max-width:600px;margin:0 auto">
  <h1 style="font-size:20px">הקופון שלך מוכן, {{customer_first_name}}!</h1>
  <p>רכשת: <strong>{{product_title_he}}</strong> אצל {{supplier_name}}.</p>
  <p>קוד הקופון: <bdi style="font-weight:700;letter-spacing:1px">{{code}}</bdi></p>
  <p>שווי: {{face_value_ils}} ש"ח • בתוקף עד <bdi>{{expires_at}}</bdi></p>
  <p style="margin:24px 0">
    <a href="{{coupon_deeplink}}"
       style="background:#0a7d55;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;display:inline-block">
      הצג את הקופון והברקוד
    </a>
  </p>
  <p style="font-size:13px;color:#666">
    לצפייה בכל הקופונים שלך:
    <a href="{{coupons_url}}" style="color:#0a7d55">האזור האישי</a>
  </p>
</div>
```

Transactional templates have no unsubscribe footer requirement under 30א, but a
`מרכז ההעדפות` link and the sender identity are still included for trust.

## 5. Coupon expiry reminder

### 5.1 Rule

For each `coupon_codes` row where `status = 'issued'`, `deleted_at IS NULL`, and
`expires_at` falls inside a reminder window, enqueue a reminder on the channels
the customer allows. Windows (configurable):

- 7 days before expiry: email (and in-app), if
  `user_notification_preferences.coupon_expiry_email` / `_inapp`.
- 48 hours before expiry: email + in-app.

These are transactional (a customer asset the customer already paid for is about
to lapse), so they are NOT 30א marketing. They are still gated by the
`coupon_expiry_*` preference flags (the customer can opt out of the reminder
itself) and by suppression.

### 5.2 Scheduling (cron / sweep)

A Supabase scheduled function (pg_cron, or an external cron hitting an internal
route with a service token) calls `fn_enqueue_coupon_expiry_reminders()` once
per hour. The function is idempotent: `dedupe_key` is
`coupon_expiry_7d:{coupon_id}` and `coupon_expiry_48h:{channel}:{coupon_id}`, so
running it every hour cannot enqueue the same reminder twice.

```sql
-- Runs hourly. Returns count enqueued. Idempotent on dedupe_key.
SELECT public.fn_enqueue_coupon_expiry_reminders();
```

The enqueue function (definition in the DDL section) inserts directly into
`notifications_outbox` with `kind = 'coupon_expiry_7d' | 'coupon_expiry_48h'`,
`is_marketing = false`, and a payload of `{coupon_code_id, expires_at}`. The
fan-out worker then resolves recipient and template and sends. Because expiry
reminders have a fixed recipient (the coupon owner) they skip the
`notification_events` stage and write outbox rows directly; the dedupe key still
gives exactly-once enqueue.

Sweep cron cadence and windows:

```text
pg_cron: '0 * * * *'  ->  SELECT fn_enqueue_coupon_expiry_reminders();
pg_cron: '*/1 * * * *' ->  worker claims and sends due outbox rows
```

## 6. Delivery: outbox pattern, retry, idempotent send

### 6.1 State machine of a notification (outbox row)

```text
                 fan-out / enqueue
                        |
                        v
                    [ queued ] <-------------------------+
                    /   |    \                            |
      consent/     /    |     \  claim + send attempt     | admin requeue
      suppress    /     |      \                          | (from dead)
      fails      /      |       \                         |
                v       |        v                        |
          [ skipped ]   |    provider result              |
          (terminal)    |     /        \                  |
                        |    /          \                 |
                 domain |  success     failure            |
                 cancel |   |            |                |
                        |   v            v                |
                        | [ sent ]   attempts+1           |
                        |  (delivery   |     \            |
                        |   webhooks   |      \ attempts>=5|
                        |   update     |       \          |
                        |   delivered_ | backoff  [ dead ]-+
                        |   at)        | next_attempt_at (terminal until
                        v              |                    admin requeue)
                  [ cancelled ]        +--> back to [ queued ]
                  (terminal)
```

States (enum `notification_status`, extended):

- `queued`: enqueued, due at `scheduled_for`, retriable at `next_attempt_at`.
- `sent`: provider accepted the message. Delivery webhooks may later set
  `delivered_at`, or move the address into suppression on bounce/complaint, but
  the outbox row stays `sent`.
- `failed`: reserved / not a resting state in this design; a transient failure
  keeps the row `queued` and bumps `attempts` + `next_attempt_at`. (Kept in the
  enum for compatibility with 029.)
- `dead`: retries exhausted (`attempts >= 5`). Dead-letter. Admin requeue only.
- `skipped`: consent or suppression rejected the message at send time. This is a
  success of the consent system, not a delivery error, and is excluded from
  failure metrics.
- `cancelled`: domain event invalidated the message before send (order refunded,
  coupon refunded, account deletion), or the reminder is no longer relevant.

### 6.2 Claim / send loop (worker)

The worker runs every minute:

1. `SELECT * FROM fn_claim_notification_batch('worker-<id>', 50)` atomically
   locks up to 50 due `queued` rows (`FOR UPDATE SKIP LOCKED`), stamping
   `locked_at` / `locked_by`. Rows locked more than 10 minutes are considered
   abandoned and reclaimable (worker crash recovery).
2. For each claimed row:
   - Resolve recipient address (email / phone) and the active template version.
   - Check consent (marketing only) and `channel_suppressions`. If blocked,
     `fn_mark_notification_skipped(id, reason)`.
   - Render the template with the payload variables.
   - Call the provider with an idempotency key (see 6.4).
   - On provider accept: `fn_mark_notification_sent(id, provider,
     provider_message_id, template_id, to_address)`.
   - On transient error: `fn_mark_notification_failed(id, error)` which bumps
     `attempts`, sets `next_attempt_at`, and flips to `dead` at the 5th attempt.

### 6.3 Exponential backoff

`next_attempt_at = now() + LEAST(5min * 2^attempts, 6h)`, so retries land at
roughly 5m, 10m, 20m, 40m, 80m, capped at 6h, `dead` after 5 attempts.

```sql
next_attempt_at = now() + LEAST(
  make_interval(mins => (5 * power(2, attempts))::int),
  interval '6 hours'
);
```

### 6.4 Idempotent send

Three independent guards ensure exactly-once user-visible delivery:

1. Enqueue idempotency: `notifications_outbox.dedupe_key` is UNIQUE. Replayed
   domain events (`finalizeOrder` re-run, cron overlap) cannot create a second
   row for the same logical message.
2. Send idempotency: every provider call carries a stable idempotency key
   derived from the outbox row id (for example `outbox:{id}`). If the worker
   crashes after the provider accepted but before `fn_mark_notification_sent`
   commits, the next claim re-sends with the same key and the provider
   deduplicates (Resend, most SMTP relays, and SMS aggregators support an
   idempotency header or a client-supplied message id).
3. Status guard: `fn_mark_notification_sent` and `fn_mark_notification_failed`
   both include `AND status = 'queued'` in their WHERE clause, so two workers
   racing the same row (should not happen given SKIP LOCKED, but defensively)
   cannot both transition it.

Webhook replay idempotency: `notification_delivery_events` has UNIQUE
`(provider, external_event_id)`; `fn_ingest_delivery_event` does
`ON CONFLICT DO NOTHING` and returns NULL on replay, so a redelivered provider
webhook is a no-op.

## 7. Template system

### 7.1 Model

One row in `notification_templates` per
`(template_key, channel, locale, version)`. Exactly one version is `is_active`
per `(template_key, channel, locale)` (partial unique index). Activation is
atomic via `fn_activate_template(id)` (deactivate siblings, activate target).

Channels: `email`, `sms`, `whatsapp`, `inapp`, `push`. Locales: `he` (default),
`en`.

Content columns:

- `subject`: email subject / in-app title.
- `body_text`: SMS body, in-app body, email plaintext part.
- `body_html`: email HTML (RTL rules from section 4.3).
- `whatsapp_template_name`: WhatsApp bodies live at Meta (pre-approved); we store
  only the registered template name and pass variables at send.
- `variables`: jsonb array of expected placeholder names, used for validation.

### 7.2 Variables and rendering

Placeholders are `{{snake_case}}`. The renderer:

- Rejects a render if a required variable in `variables` is missing from the
  payload (fail closed, mark the row failed, alert), so we never send `{{code}}`
  to a customer.
- HTML-escapes every value before substitution in `body_html`.
- Wraps Latin / numeric values in bidi isolation for RTL correctness.
- Formats `_ils` money and `expires_at` timestamps in `Asia/Jerusalem` with
  Hebrew locale formatting at render time, not at enqueue time.

### 7.3 Versioning

- Never edit an active version in place. Editing means inserting a new
  `version = max+1` for that `(template_key, channel, locale)` and calling
  `fn_activate_template` when ready.
- `notifications_outbox.template_id` records the exact version used at send, so
  a message can always be reproduced and audited even after the active version
  changes.
- Rollback is re-activating a prior version id.

### 7.4 Marketing vs transactional (Israeli spam law 30א)

Section 30א of the Communications Law (חוק התקשורת, סעיף 30א) governs
`דבר פרסומת` (advertising messages) by email, SMS, fax, and automated calling.
The split:

- Transactional messages (order confirmation, coupon issuance, coupon expiry
  reminder, supplier new-order, delivery status) relate to a transaction the
  recipient is party to and are NOT advertising. They do NOT require prior
  opt-in. `is_marketing = false`.
- Marketing messages (promotions, abandoned cart nudges, winback, newsletters)
  ARE advertising and require prior explicit opt-in (`is_marketing = true`,
  gated on a positive `user_notification_preferences.marketing_*` flag plus a
  `consent_events` opt_in record), a clear sender identity, and a functioning
  unsubscribe (`הסרה`) that is honored on the next send.

Enforcement points:

- Every template row carries an implicit class through the `template_key` and
  the `is_marketing` flag set on the outbox row at enqueue.
- The worker refuses to send any `is_marketing = true` row unless the recipient
  has a current opt-in; otherwise `fn_mark_notification_skipped`.
- Quiet hours and frequency caps apply to marketing only (defined in the
  marketing doc). Transactional messages ignore them.
- A spam complaint webhook is treated as an immediate, logged, automatic
  unsubscribe from all marketing (`fn_ingest_delivery_event` calls
  `fn_unsubscribe_marketing`).

## 8. Provider abstraction and consent / suppression

### 8.1 Provider interfaces

Two narrow server-side interfaces so providers are swappable and testable. No
provider SDK is imported outside these adapters.

```ts
// src/server/notifications/providers/types.ts
export type SendResult =
  | { ok: true; providerMessageId: string }
  | { ok: false; retryable: boolean; error: string }

export interface EmailProvider {
  readonly name: string // 'resend' | 'ses' | ...
  send(input: {
    to: string
    subject: string
    html: string
    text: string
    idempotencyKey: string // stable per outbox row: `outbox:${id}`
    replyTo?: string
  }): Promise<SendResult>
}

export interface SmsProvider {
  readonly name: string // 'sms_il' | 'twilio' | ...
  send(input: {
    to: string // E.164, e.g. +9725...
    body: string
    idempotencyKey: string
    sender: string // approved alphanumeric sender id
  }): Promise<SendResult>
}
```

Adapters map provider errors onto `retryable`:

- Retryable: 429, 5xx, timeouts, connection resets. Worker keeps the row
  `queued` and backs off.
- Non-retryable: 4xx validation (bad address, unsubscribed at provider). Worker
  marks the address suppressed and the row `dead` (no point retrying a
  structurally invalid send).

A WhatsApp provider follows the same shape but sends a template name plus
variables rather than free body.

### 8.2 Consent

Consent state lives on `user_notification_preferences` (the current answer),
history lives on `consent_events` (append-only legal evidence for 30א: who, when,
which channel, which topic, opt_in or opt_out, source, wording version, ip,
user agent). Setting consent goes through SECURITY DEFINER functions
(`fn_set_marketing_consent`, `fn_unsubscribe_marketing`) that update the
preference and append the evidence row atomically. `consent_events` has no
UPDATE or DELETE path for anyone.

### 8.3 Suppression

`channel_suppressions` is the hard block list keyed UNIQUE `(channel, address)`:

- `hard_bounce`: provider reported the email address does not exist. Suppress
  the email address. Future sends to it are `skipped`.
- `complaint`: recipient marked the message as spam. Suppress the address AND
  auto opt-out of all marketing (a complaint is an unsubscribe).
- `stop_reply`: SMS/WhatsApp `הסר` / STOP reply. Suppress the phone.
- `manual`: admin action.

The worker checks suppression for every send (transactional included: we never
send to a hard-bounced address). Suppression is enforced at send time, not
enqueue time, so a suppression that lands after enqueue still stops the message.

Provider webhooks are the input edge: the provider posts a signed delivery
event to an internal route, the route verifies the signature (service role),
then calls `fn_ingest_delivery_event(provider, external_event_id, outbox_id,
event, payload)`. That single function deduplicates, stamps `delivered_at`,
writes suppression on bounce/complaint, and triggers the marketing opt-out on
complaint.

## 9. Postgres DDL

Self-contained target DDL. Idempotent (safe to re-run). Assumes the base
`notifications_outbox` and `user_notification_preferences` from the 029 draft
already exist; the `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` blocks upgrade
them to the transactional-core shape. `public.is_admin()` and
`public.set_updated_at()` are assumed present (earlier migrations).

### 9.1 Enum

```sql
-- notification_status base: 'queued','sent','failed','cancelled' (029).
-- Add terminal states for the retry queue. ADD VALUE IF NOT EXISTS is idempotent.
ALTER TYPE public.notification_status ADD VALUE IF NOT EXISTS 'dead';
ALTER TYPE public.notification_status ADD VALUE IF NOT EXISTS 'skipped';
```

### 9.2 Templates

```sql
CREATE TABLE IF NOT EXISTS public.notification_templates (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key           text        NOT NULL,   -- 'order_paid','coupon_delivered','supplier_new_order','coupon_expiry_7d',...
  channel                text        NOT NULL CHECK (channel IN ('email','inapp','push','sms','whatsapp')),
  locale                 text        NOT NULL DEFAULT 'he' CHECK (locale IN ('he','en')),
  version                int         NOT NULL CHECK (version > 0),
  is_marketing           boolean     NOT NULL DEFAULT false,
  subject                text,       -- email subject / inapp title
  body_text              text,       -- sms / inapp / email plaintext
  body_html              text,       -- email html (dir="rtl")
  whatsapp_template_name text,       -- Meta-registered name
  variables              jsonb       NOT NULL DEFAULT '[]'::jsonb, -- required placeholders
  is_active              boolean     NOT NULL DEFAULT false,
  notes                  text,
  created_by             uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_templates_key_version_uq
    UNIQUE (template_key, channel, locale, version)
);

-- Exactly one active version per (template_key, channel, locale).
CREATE UNIQUE INDEX IF NOT EXISTS notification_templates_one_active_idx
  ON public.notification_templates (template_key, channel, locale)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS notification_templates_key_idx
  ON public.notification_templates (template_key, channel);

DROP TRIGGER IF EXISTS set_updated_at ON public.notification_templates;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.notification_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Atomic version switch: deactivate siblings, activate target. Admin only.
CREATE OR REPLACE FUNCTION public.fn_activate_template(p_template_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tpl public.notification_templates%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin only'; END IF;
  SELECT * INTO v_tpl FROM public.notification_templates
    WHERE id = p_template_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'template not found'; END IF;
  UPDATE public.notification_templates SET is_active = false
    WHERE template_key = v_tpl.template_key AND channel = v_tpl.channel
      AND locale = v_tpl.locale AND is_active = true AND id <> p_template_id;
  UPDATE public.notification_templates SET is_active = true WHERE id = p_template_id;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_activate_template(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_activate_template(uuid) TO authenticated;
```

### 9.3 Domain events (fan-out source)

```sql
CREATE TABLE IF NOT EXISTS public.notification_events (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type   text        NOT NULL,  -- 'order_paid','coupon_delivered','supplier_new_order',...
  entity_type  text        NOT NULL,  -- 'order','order_item','coupon_code','supplier'
  entity_id    uuid        NOT NULL,
  user_id      uuid        REFERENCES auth.users(id) ON DELETE CASCADE, -- null for supplier-directed
  payload      jsonb       NOT NULL DEFAULT '{}'::jsonb,  -- ids + facts, no PII
  dedupe_key   text        NOT NULL UNIQUE,
  occurred_at  timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notification_events_unprocessed_idx
  ON public.notification_events (occurred_at) WHERE processed_at IS NULL;

CREATE OR REPLACE FUNCTION public.fn_emit_notification_event(
  p_dedupe text, p_event_type text, p_entity_type text,
  p_entity_id uuid, p_user_id uuid, p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.notification_events
    (dedupe_key, event_type, entity_type, entity_id, user_id, payload)
  VALUES (p_dedupe, p_event_type, p_entity_type, p_entity_id, p_user_id,
          COALESCE(p_payload,'{}'::jsonb))
  ON CONFLICT (dedupe_key) DO NOTHING
  RETURNING id INTO v_id;
  RETURN v_id;  -- null on replay
END;
$$;
REVOKE ALL ON FUNCTION public.fn_emit_notification_event(text,text,text,uuid,uuid,jsonb)
  FROM PUBLIC, anon, authenticated;
```

### 9.4 Outbox extensions (retry queue)

```sql
ALTER TABLE public.notifications_outbox
  ADD COLUMN IF NOT EXISTS event_id            uuid REFERENCES public.notification_events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS template_key        text,
  ADD COLUMN IF NOT EXISTS template_id         uuid REFERENCES public.notification_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_marketing        boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS attempts            int         NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  ADD COLUMN IF NOT EXISTS next_attempt_at     timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS locked_at           timestamptz,
  ADD COLUMN IF NOT EXISTS locked_by           text,
  ADD COLUMN IF NOT EXISTS provider            text,
  ADD COLUMN IF NOT EXISTS provider_message_id text,
  ADD COLUMN IF NOT EXISTS delivered_at        timestamptz,
  ADD COLUMN IF NOT EXISTS to_address          text;  -- snapshot at send time

-- Widen channel CHECK (029 shipped without 'whatsapp').
DO $$ BEGIN
  ALTER TABLE public.notifications_outbox DROP CONSTRAINT IF EXISTS notifications_outbox_channel_check;
  ALTER TABLE public.notifications_outbox ADD CONSTRAINT notifications_outbox_channel_check
    CHECK (channel IN ('email','inapp','push','sms','whatsapp'));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Claim path index: due queued rows.
CREATE INDEX IF NOT EXISTS notifications_outbox_due_idx
  ON public.notifications_outbox (next_attempt_at)
  WHERE status = 'queued'::public.notification_status;
```

### 9.5 Claim + transition functions

```sql
-- Atomically lock up to p_limit due rows; reclaim rows locked > 10 min.
CREATE OR REPLACE FUNCTION public.fn_claim_notification_batch(p_worker text, p_limit int DEFAULT 50)
RETURNS SETOF public.notifications_outbox
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  UPDATE public.notifications_outbox o
     SET locked_at = now(), locked_by = p_worker
   WHERE o.id IN (
     SELECT i.id FROM public.notifications_outbox i
      WHERE i.status = 'queued'::public.notification_status
        AND i.scheduled_for <= now()
        AND i.next_attempt_at <= now()
        AND (i.locked_at IS NULL OR i.locked_at < now() - interval '10 minutes')
      ORDER BY i.scheduled_for
      LIMIT p_limit
      FOR UPDATE SKIP LOCKED)
  RETURNING o.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_mark_notification_sent(
  p_id uuid, p_provider text, p_provider_message_id text DEFAULT NULL,
  p_template_id uuid DEFAULT NULL, p_to_address text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.notifications_outbox
     SET status = 'sent'::public.notification_status, sent_at = now(),
         provider = p_provider,
         provider_message_id = COALESCE(p_provider_message_id, provider_message_id),
         template_id = COALESCE(p_template_id, template_id),
         to_address = COALESCE(p_to_address, to_address),
         locked_at = NULL, locked_by = NULL, error = NULL
   WHERE id = p_id AND status = 'queued'::public.notification_status;
END;
$$;

-- Exponential backoff 5min*2^attempts capped 6h; dead after 5 attempts.
CREATE OR REPLACE FUNCTION public.fn_mark_notification_failed(p_id uuid, p_error text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.notifications_outbox
     SET attempts = attempts + 1, error = p_error, locked_at = NULL, locked_by = NULL,
         status = CASE WHEN attempts + 1 >= 5 THEN 'dead'::public.notification_status ELSE status END,
         next_attempt_at = now() + LEAST(
           make_interval(mins => (5 * power(2, attempts))::int), interval '6 hours')
   WHERE id = p_id AND status = 'queued'::public.notification_status;
END;
$$;

-- Consent / suppression rejected at send time. Not a delivery error.
CREATE OR REPLACE FUNCTION public.fn_mark_notification_skipped(p_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.notifications_outbox
     SET status = 'skipped'::public.notification_status, error = p_reason,
         locked_at = NULL, locked_by = NULL
   WHERE id = p_id AND status = 'queued'::public.notification_status;
END;
$$;

-- Admin-only dead-letter requeue.
CREATE OR REPLACE FUNCTION public.fn_requeue_dead_notification(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin only'; END IF;
  UPDATE public.notifications_outbox
     SET status = 'queued'::public.notification_status, attempts = 0,
         next_attempt_at = now(), locked_at = NULL, locked_by = NULL, error = NULL
   WHERE id = p_id AND status = 'dead'::public.notification_status;
  IF NOT FOUND THEN RAISE EXCEPTION 'notification not found or not dead'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_claim_notification_batch(text,int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_mark_notification_sent(uuid,text,text,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_mark_notification_failed(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_mark_notification_skipped(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_requeue_dead_notification(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_requeue_dead_notification(uuid) TO authenticated;
```

### 9.6 Preferences (extends 029 table)

```sql
-- 029 base columns (for reference): order_updates_email, coupon_expiry_email,
-- coupon_expiry_inapp, marketing_email, marketing_sms (all boolean).
ALTER TABLE public.user_notification_preferences
  ADD COLUMN IF NOT EXISTS order_updates_sms       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS coupon_delivered_email   boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS order_updates_whatsapp   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS coupon_expiry_whatsapp   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS marketing_whatsapp       boolean NOT NULL DEFAULT false;
```

### 9.7 Consent, suppression, delivery events

```sql
-- Append-only legal evidence for anti-spam law 30א. State lives in
-- user_notification_preferences; history lives here (no UPDATE/DELETE).
CREATE TABLE IF NOT EXISTS public.consent_events (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel         text        NOT NULL CHECK (channel IN ('email','sms','whatsapp','all')),
  topic           text        NOT NULL CHECK (topic IN ('marketing','order_updates','coupon_expiry','wallet')),
  action          text        NOT NULL CHECK (action IN ('opt_in','opt_out')),
  source          text        NOT NULL CHECK (source IN
                    ('account_page','checkout','unsubscribe_link','sms_reply',
                     'whatsapp_reply','complaint_webhook','admin')),
  wording_version text,
  ip              inet,
  user_agent      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS consent_events_user_idx
  ON public.consent_events (user_id, created_at DESC);
ALTER TABLE public.consent_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "consent_events: owner select" ON public.consent_events;
CREATE POLICY "consent_events: owner select" ON public.consent_events
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Hard block list. UNIQUE (channel, address). Writes via service role only.
CREATE TABLE IF NOT EXISTS public.channel_suppressions (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  channel    text        NOT NULL CHECK (channel IN ('email','sms','whatsapp')),
  address    text        NOT NULL,  -- email or E.164 phone
  user_id    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  reason     text        NOT NULL CHECK (reason IN ('hard_bounce','complaint','manual','stop_reply')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT channel_suppressions_channel_address_uq UNIQUE (channel, address)
);
ALTER TABLE public.channel_suppressions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "suppressions: admin select" ON public.channel_suppressions;
CREATE POLICY "suppressions: admin select" ON public.channel_suppressions
  FOR SELECT TO authenticated USING (public.is_admin());

-- Provider webhook ledger. UNIQUE (provider, external_event_id) = replay guard.
CREATE TABLE IF NOT EXISTS public.notification_delivery_events (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider          text        NOT NULL,  -- 'resend' | 'sms_il' | 'meta_whatsapp'
  external_event_id text        NOT NULL,
  outbox_id         uuid        REFERENCES public.notifications_outbox(id) ON DELETE SET NULL,
  event             text        NOT NULL CHECK (event IN
                      ('delivered','bounced','complained','opened','clicked','read','failed')),
  payload           jsonb       NOT NULL DEFAULT '{}'::jsonb,
  received_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_delivery_events_dedup UNIQUE (provider, external_event_id)
);
CREATE INDEX IF NOT EXISTS notification_delivery_events_outbox_idx
  ON public.notification_delivery_events (outbox_id);
ALTER TABLE public.notification_delivery_events ENABLE ROW LEVEL SECURITY;

-- Single ingest path: dedup + side effects (delivered_at, suppression,
-- complaint => automatic marketing opt-out). Called by the webhook route
-- (service role) AFTER provider signature verification.
CREATE OR REPLACE FUNCTION public.fn_ingest_delivery_event(
  p_provider text, p_external_event_id text, p_outbox_id uuid,
  p_event text, p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_outbox public.notifications_outbox%ROWTYPE; v_address text;
BEGIN
  INSERT INTO public.notification_delivery_events
    (provider, external_event_id, outbox_id, event, payload)
  VALUES (p_provider, p_external_event_id, p_outbox_id, p_event, COALESCE(p_payload,'{}'::jsonb))
  ON CONFLICT (provider, external_event_id) DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN RETURN NULL; END IF;          -- replayed webhook: no-op
  IF p_outbox_id IS NULL THEN RETURN v_id; END IF;
  SELECT * INTO v_outbox FROM public.notifications_outbox WHERE id = p_outbox_id;
  IF NOT FOUND THEN RETURN v_id; END IF;
  v_address := COALESCE(v_outbox.to_address, p_payload->>'address');
  IF p_event = 'delivered' THEN
    UPDATE public.notifications_outbox SET delivered_at = COALESCE(delivered_at, now())
      WHERE id = p_outbox_id;
  ELSIF p_event IN ('bounced','complained') AND v_address IS NOT NULL THEN
    INSERT INTO public.channel_suppressions (channel, address, user_id, reason)
    VALUES (v_outbox.channel, v_address, v_outbox.user_id,
            CASE WHEN p_event = 'bounced' THEN 'hard_bounce' ELSE 'complaint' END)
    ON CONFLICT (channel, address) DO NOTHING;
    IF p_event = 'complained' THEN
      PERFORM public.fn_unsubscribe_marketing(v_outbox.user_id, 'all', 'complaint_webhook');
    END IF;
  END IF;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_ingest_delivery_event(text,text,uuid,text,jsonb)
  FROM PUBLIC, anon, authenticated;
```

### 9.8 Coupon expiry enqueue (transactional reminder)

```sql
-- Hourly cron. Idempotent on dedupe_key. Gated on the coupon_expiry_* prefs.
CREATE OR REPLACE FUNCTION public.fn_enqueue_coupon_expiry_reminders()
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int := 0; v_batch int;
BEGIN
  -- 7-day email reminders
  WITH ins AS (
    INSERT INTO public.notifications_outbox (user_id, kind, channel, payload, dedupe_key, is_marketing)
    SELECT c.user_id, 'coupon_expiry_7d', 'email',
           jsonb_build_object('coupon_code_id', c.id, 'expires_at', c.expires_at),
           'coupon_expiry_7d:' || c.id::text, false
      FROM public.coupon_codes c
      JOIN public.user_notification_preferences p ON p.user_id = c.user_id
     WHERE c.status = 'issued'::public.coupon_status
       AND c.deleted_at IS NULL
       AND c.expires_at BETWEEN now() AND now() + interval '7 days'
       AND p.coupon_expiry_email
    ON CONFLICT (dedupe_key) DO NOTHING
    RETURNING 1)
  SELECT count(*) INTO v_batch FROM ins;
  v_count := v_count + COALESCE(v_batch,0);

  -- 48-hour reminders: email + in-app
  WITH ins AS (
    INSERT INTO public.notifications_outbox (user_id, kind, channel, payload, dedupe_key, is_marketing)
    SELECT c.user_id, 'coupon_expiry_48h', ch.channel,
           jsonb_build_object('coupon_code_id', c.id, 'expires_at', c.expires_at),
           'coupon_expiry_48h:' || ch.channel || ':' || c.id::text, false
      FROM public.coupon_codes c
      JOIN public.user_notification_preferences p ON p.user_id = c.user_id
      CROSS JOIN (VALUES ('email'),('inapp')) AS ch(channel)
     WHERE c.status = 'issued'::public.coupon_status
       AND c.deleted_at IS NULL
       AND c.expires_at BETWEEN now() AND now() + interval '48 hours'
       AND ((ch.channel = 'email' AND p.coupon_expiry_email)
         OR (ch.channel = 'inapp' AND p.coupon_expiry_inapp))
    ON CONFLICT (dedupe_key) DO NOTHING
    RETURNING 1)
  SELECT count(*) INTO v_batch FROM ins;
  v_count := v_count + COALESCE(v_batch,0);

  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_enqueue_coupon_expiry_reminders() FROM PUBLIC, anon, authenticated;
```

## 10. Application flow (finalizeOrder emit)

Sketch of the emit block added at the end of `finalizeOrder`, after the order is
marked paid. All emits are idempotent on `dedupe_key`, so this is replay-safe and
does not need to be in the same transaction as the payment update.

```ts
// src/server/payments/finalize.ts (after order status -> 'paid')
// 1. customer order confirmation
await admin.rpc('fn_emit_notification_event', {
  p_dedupe: `order_paid:${order.id}`,
  p_event_type: 'order_paid',
  p_entity_type: 'order',
  p_entity_id: order.id,
  p_user_id: order.user_id,
  p_payload: { order_id: order.id, order_short_code: shortCode },
})

// 2. one coupon-delivered event per issued code
for (const coupon of issuedCoupons) {
  await admin.rpc('fn_emit_notification_event', {
    p_dedupe: `coupon_delivered:${coupon.id}`,
    p_event_type: 'coupon_delivered',
    p_entity_type: 'coupon_code',
    p_entity_id: coupon.id,
    p_user_id: order.user_id,
    p_payload: { coupon_code_id: coupon.id, order_item_id: coupon.order_item_id },
  })
}

// 3. one supplier event per distinct supplier in the order
for (const supplierId of distinctSupplierIds) {
  await admin.rpc('fn_emit_notification_event', {
    p_dedupe: `supplier_new_order:${order.id}:${supplierId}`,
    p_event_type: 'supplier_new_order',
    p_entity_type: 'supplier',
    p_entity_id: supplierId,
    p_user_id: null,
    p_payload: { order_id: order.id, supplier_id: supplierId, /* items[] */ },
  })
}
```

The fan-out worker (or an inline fan-out call right after this) reads unprocessed
`notification_events`, resolves recipient + active template + channel(s), applies
consent and suppression, and inserts `notifications_outbox` rows with a
per-recipient-per-channel `dedupe_key` (for example
`order_paid:email:{order_id}`). The claim-batch worker then delivers them.

## 11. Operational notes

- Cron: `fn_enqueue_coupon_expiry_reminders()` hourly; fan-out and claim-batch
  worker every minute. On Supabase, pg_cron or an external scheduler hitting an
  internal route authenticated with the service role.
- Metrics: send rate, `dead` count (alert if > 0), average `attempts`, delivery
  rate (`delivered_at` set / `sent`), skipped-by-consent count, suppression
  growth. `failed` metrics exclude `skipped`.
- Dead-letter: `status = 'dead'` rows surface in an admin view; requeue via
  `fn_requeue_dead_notification` after fixing the cause.
- PII: `notification_events.payload` holds ids and denormalized display facts
  only. Recipient email / phone is resolved at fan-out and snapshotted onto
  `notifications_outbox.to_address` only at send.
- Account deletion (029 flow) cancels queued outbox rows
  (`status = 'cancelled'`) and cascades `consent_events` /
  `user_notification_preferences`; suppression rows keep `user_id NULL` so a
  hard-bounced address stays blocked after the account is gone.
```
