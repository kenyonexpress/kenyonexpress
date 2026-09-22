# WhatsApp

Verified 2026-09-02, outbound half. Inbound half added 2026-09-23.

## Outbound (click-to-chat, no provider needed)

| Piece | Where |
| --- | --- |
| Phone normalization + wa.me links | `src/lib/whatsapp.ts` (+9 tests): local/international/landline, Hebrew message builders |
| Floating help button | `WhatsAppFloat` in the store/main layouts; hidden when `NEXT_PUBLIC_WHATSAPP_PHONE` is empty |
| PDP share | `WhatsAppShareButton` next to the SKU, prefilled Hebrew message + page URL |
| Per-product toggle | `products.whatsapp_enabled` (123), admin control in `ProductForm.tsx`; supplier chat in `SupplierInfo.tsx` renders only when enabled |
| Order-update link | checkout/return page + admin order page, prefilled status text |
| Contact page + footer | `ContactTopicPicker`, one `wa.me` link per topic from `contact_channels` (236) |
| Click analytics | `whatsapp_click` (with `product_id`) from the PDP share, emitted BEFORE the window opens. Lands when 151 applies -- which is also what turns the rest of the analytics pipeline on; the ingest function did not exist. |

None of this needs a provider account: `wa.me` links open the visitor's own
WhatsApp client. **Content, not code:** `whatsapp_enabled` is false on all 80
products, so no supplier chat renders anywhere yet. Flipping it is an admin
action per product.

**Untracked on purpose:** the floating button is a server component on every
page; hydrating the whole site to count its taps is a worse trade than losing
the number. The PDP share -- the funnel-relevant tap -- is the one counted.

## Outbound, provider-backed (order-status messages)

`whatsapp_outbox` (173), drained by `/api/cron/whatsapp` through Twilio's
WhatsApp Business Platform. `src/server/whatsapp/messages.ts` builds the four
templates (`order_paid`, `order_fulfilled`, `order_cancelled`,
`order_refunded`); `src/server/whatsapp/twilio.ts` sends them and never
throws -- a missing `TWILIO_*` credential reports `skipped`, not a failure.
Consent is re-checked at send time against `whatsapp_contacts`, because an
opt-out that lands between enqueue and drain must still win.

## Inbound

`src/app/api/webhooks/whatsapp/route.ts`, receiving Twilio's webhook.
Signature-verified (`X-Twilio-Signature`, HMAC-SHA1 over the configured URL
plus the sorted form params); without `TWILIO_*` the route is closed, 401 to
everything.

- **Opt-in / opt-out keywords** (`src/server/whatsapp/inbound.ts`) write
  `whatsapp_contacts.status` and reply with a confirmation. This is the only
  way consent is ever granted -- nothing opts a phone in on its behalf.
- **Anything else** opens or joins a support ticket (`support_tickets`,
  `support_ticket_messages`) and replies with the ticket reference.
- **Order match (238, added 2026-09-23):** before replying,
  `src/server/whatsapp/orders.ts` tries to match the sender's phone to their
  most recent order -- against `profiles.phone` first, `user_addresses.phone`
  as a fallback, both normalised in code since the two columns hold whatever a
  form was typed into them. A match prepends the order's status and total to
  the same ticket-ack reply (`orderSummaryReplyText`). No match: the ticket
  reply goes out exactly as it did before this existed. A lookup failure is
  logged and swallowed -- it must never turn a working ticket flow into a 500.
- Every inbound message is recorded in `whatsapp_inbound_messages`
  (`message_sid` unique, so a Twilio retry cannot process twice), including
  the matched `order_id` when there is one.

**Admin viewer:** `/admin/whatsapp/messages` (gated on the `orders` section,
same as `/admin/support`) lists every inbound message, newest first, with its
intent, the ticket it landed in, and the order it matched, if any. Read-only:
the reply already went out synchronously from the webhook.

**Not built, and deliberately not:** a second, direct integration against
Meta's Cloud API. Twilio's WhatsApp Business Platform already routes through
Meta's network and a Meta Business Manager registration
(`docs/WHATSAPP-SETUP.md`); a parallel integration would mean two webhooks
answering the same question with no way to guarantee which one a given
message reaches.
