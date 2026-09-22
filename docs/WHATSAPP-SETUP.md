# WhatsApp setup, for the owner

What this covers: turning on the WhatsApp system that already exists in the
code -- outbound order-status messages, the inbound webhook (opt-in/opt-out,
support tickets, and an automatic order-summary reply), and the admin viewer
at `/admin/whatsapp/messages`. There is nothing left to build for any of this;
it is off today only because the Twilio credentials below are not set.

**Why Twilio, not a direct Meta Cloud API integration.** A request came in for
a from-scratch integration against Meta's Cloud API with its own webhook,
table and admin page. Before building a second system, the code was checked:
the inbound webhook, the opt-in/opt-out consent flow, the outbound message
queue and a support-ticket handoff for free-text messages were already built,
tested and live in the repository -- on Twilio's WhatsApp Business Platform,
which is itself a Meta Cloud API integration underneath. Registering a Twilio
WhatsApp sender walks you through Meta Business Manager as part of the same
flow described below; there is no way to reach Meta's WhatsApp network that
skips it. Building a second, direct integration beside the working one would
have meant two webhooks answering the same question and two places a customer's
message could land, so the two gaps that were genuinely missing -- an inbound
message being unable to say which order the customer meant, and nowhere to
read the conversation history -- were added to the existing system instead
(migration `238`, `/admin/whatsapp/messages`).

## 1. Register with Meta, through Twilio

1. Go to [twilio.com](https://www.twilio.com/) and create an account (or sign
   in to the existing one).
2. In the Twilio Console, open **Messaging > Try it out > Send a WhatsApp
   message** for a sandbox you can test with immediately, or **Messaging >
   Senders > WhatsApp senders** to register a real business number. The real
   sender flow asks you to connect or create a **Meta Business Manager**
   account and to verify the business there -- that verification is the "Meta
   Cloud API registration" step; there is no separate place to do it.
3. Once approved, note three values from the Console:
   - **Account SID** (Console home page, starts with `AC`)
   - **Auth Token** (same page, click to reveal)
   - **WhatsApp-enabled number**, in `whatsapp:+<countrycode><number>` form on
     the page but set below WITHOUT the `whatsapp:` prefix

## 2. Set the environment variables

In Vercel (Project Settings > Environment Variables, Production), or in
`.env.local` for local testing:

```
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_FROM=+14155238886
```

All three or none: with any one missing, outbound sends report `skipped`
(nothing is lost -- see `docs/WHATSAPP.md`) and the inbound webhook answers
401 to everything, closed by default rather than open with no signature to
check.

## 3. Point Twilio at the webhook

In the Console, on the same WhatsApp sender page, find **"When a message
comes in"** and set it to:

```
https://kenyonexpress.co.il/api/webhooks/whatsapp
```

Method: **HTTP POST**. This is a route in the Next.js app already deployed at
that domain -- nothing to create or deploy separately.

If the number is reached through anything other than the production domain
directly (a preview deployment, a proxy), also set:

```
TWILIO_WEBHOOK_URL=https://kenyonexpress.co.il/api/webhooks/whatsapp
```

Twilio signs its request against the URL configured in its own Console, so
this must match that value exactly, protocol included, or every inbound
message is rejected as an invalid signature.

## 4. Approve message templates (for outbound only)

Sending a message the customer did not start (an order-status update) requires
a pre-approved WhatsApp template, not free text. In the Console:
**Messaging > Content Template Builder**, create one template per kind
(`order_paid`, `order_fulfilled`, `order_cancelled`, `order_refunded` -- see
`src/server/whatsapp/messages.ts` for the exact wording each one sends), submit
for WhatsApp approval, and once approved set:

```
TWILIO_CONTENT_SID_VOUCHER_ISSUED=HX...
TWILIO_CONTENT_SID_VOUCHER_EXPIRING=HX...
```

Without a SID for a kind, that kind is silently not sent -- the code treats a
missing template as "not approved yet," not as an error.

The **inbound** side (opt-in/opt-out confirmations, the support-ticket
acknowledgment, the order-summary auto-reply) needs no template approval: a
reply to a message the customer just sent is free-form under WhatsApp's rules.

## 5. Test it

1. Send `הצטרפות` (or `join`) from a phone to the WhatsApp number. Expect a
   reply confirming enrollment.
2. Send any other message, e.g. "מתי ההזמנה שלי מגיעה?". Expect a reply
   acknowledging a support ticket, and -- if that phone number matches an
   account with a recent order -- the order's status and total prepended to
   the same reply.
3. Open `/admin/whatsapp/messages` in the admin panel and confirm both
   messages appear, with the ticket reference and (if matched) the order
   reference shown.
4. Send `הסר` (or `stop`). Expect a confirmation and no further messages sent
   to that number by anything the outbox drains.

## What NOT to do

- Do not create a second Meta Developer app or a second webhook URL for
  WhatsApp. Every inbound message must reach the one webhook above; a second
  one would only ever see whichever messages Meta happened to route to it,
  which is not something either side of that split can predict or control.
- Do not put any of the values above in a `NEXT_PUBLIC_` variable. They are
  read only on the server (`src/server/whatsapp/twilio.ts`, the webhook
  route); a `NEXT_PUBLIC_` prefix ships a value to every visitor's browser.
