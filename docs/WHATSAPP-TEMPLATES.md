# WhatsApp: Twilio Business templates (STEP 17)

Status: ✅ code complete, awaiting Meta approval of the six templates below.
Updated: 2026-10-01.

## What this is

Post-purchase support over WhatsApp, and nothing else. Three things run:

1. **Order status updates** to the customer: paid, cancelled, refunded
   (fired by the applied 173 trigger on `orders.status`), shipped (fired by
   the fulfilment board at ship time, pending migration 252 for the outbox
   CHECK) and delivered (fired app-side as `order_fulfilled` when the last
   parcel lands, under the 173 trigger's own dedupe key, so the board path
   and the per-line path collapse to one message).
2. **Delivery notifications**: `order_shipped` carries carrier and tracking
   per line; `order_fulfilled` is the delivery confirmation.
3. **Customer-initiated support chat routed to Ofir**: every inbound message
   the webhook files as a ticket is forwarded, the moment it lands, as a
   WhatsApp alert to the store's published number and as an email to
   `CONTACT_TO`. Replies go out from `/admin/support`.

There is **no marketing template** and there will not be one on this consent.
`whatsapp_contacts.status = 'opted_in'` records consent for order updates,
granted only by the customer writing `הצטרפות` to the number. A marketing
template needs a separate opt-in the table does not record.
`src/server/whatsapp/templates.test.ts` refuses a catalogue entry named after
any marketing kind.

## Why templates

WhatsApp delivers free text only inside the 24-hour customer-service window
that the customer opens by writing to the business. Every proactive message
outside it must be a Content Template Meta approved in advance, sent by
`ContentSid` with positional variables; Twilio refuses anything else with
error 63016.

The drain (`/api/cron/whatsapp`) therefore, per row:

| Template SID configured | Customer wrote in last 24h | What goes out |
|---|---|---|
| yes | any | the template |
| no | yes | free text (`buildWhatsAppText`) |
| no | no | nothing; row stays `pending`, no attempt burned, `last_error` names the missing variable, next look in 60 minutes |

The webhook's TwiML replies and the admin's replies to an open ticket are
inside the window by definition and stay free text.

## The templates to submit

Twilio Console → Messaging → Content Template Builder → Create. Language
`he`, category **UTILITY** for all six. Paste the body exactly; the
placeholders are positional `{{1}}`, `{{2}}`, `{{3}}`. When Meta approves a
template, put its SID (`HX...`) in the named variable on Vercel
(Production and Preview) and redeploy. The catalogue in
`src/server/whatsapp/templates.ts` is the source; this table is rendered from
it and a test keeps the two identical.

### order_paid → `TWILIO_CONTENT_SID_ORDER_PAID`

```
שלום {{1}}, התשלום התקבל והזמנה {{2}} נקלטה. סך ההזמנה: {{3}}. נעדכן כאן כשההזמנה תצא לדרך. להסרה מעדכוני וואטסאפ השיבו: הסר
```

| Variable | Carries | Sample |
|---|---|---|
| 1 | שם הלקוח | דנה |
| 2 | מספר הזמנה (8 תווים) | 3B6E6F1E |
| 3 | סך ההזמנה בשקלים | ₪129.90 |

### order_shipped → `TWILIO_CONTENT_SID_ORDER_SHIPPED`

```
שלום {{1}}, הזמנה {{2}} יצאה לדרך. מעקב: {{3}}. להסרה מעדכוני וואטסאפ השיבו: הסר
```

| Variable | Carries | Sample |
|---|---|---|
| 1 | שם הלקוח | דנה |
| 2 | מספר הזמנה (8 תווים) | 3B6E6F1E |
| 3 | חברת שילוח ומספר מעקב, או "יעודכן" | דואר ישראל RR123456789IL |

### order_fulfilled (delivered) → `TWILIO_CONTENT_SID_ORDER_FULFILLED`

```
שלום {{1}}, הזמנה {{2}} נמסרה. תודה שקניתם ב-KenyonExpress. אם משהו לא תקין, השיבו כאן ונטפל. להסרה מעדכוני וואטסאפ השיבו: הסר
```

| Variable | Carries | Sample |
|---|---|---|
| 1 | שם הלקוח | דנה |
| 2 | מספר הזמנה (8 תווים) | 3B6E6F1E |

### order_cancelled → `TWILIO_CONTENT_SID_ORDER_CANCELLED`

```
שלום {{1}}, הזמנה {{2}} בוטלה. אם לא ביקשתם זאת, השיבו כאן ונבדוק. להסרה מעדכוני וואטסאפ השיבו: הסר
```

| Variable | Carries | Sample |
|---|---|---|
| 1 | שם הלקוח | דנה |
| 2 | מספר הזמנה (8 תווים) | 3B6E6F1E |

### order_refunded → `TWILIO_CONTENT_SID_ORDER_REFUNDED`

```
שלום {{1}}, בוצע זיכוי על הזמנה {{2}}. ההופעה בדף החשבון תלויה בחברת האשראי. להסרה מעדכוני וואטסאפ השיבו: הסר
```

| Variable | Carries | Sample |
|---|---|---|
| 1 | שם הלקוח | דנה |
| 2 | מספר הזמנה (8 תווים) | 3B6E6F1E |

### support_inbound (to Ofir) → `TWILIO_CONTENT_SID_SUPPORT_INBOUND`

```
פנייה חדשה בוואטסאפ מ-{{1}} (פנייה {{2}}): {{3}}
```

| Variable | Carries | Sample |
|---|---|---|
| 1 | מספר הטלפון של הלקוח | 972501234567 |
| 2 | מספר הפנייה (8 תווים) | A1B2C3D4 |
| 3 | תוכן ההודעה, עד 300 תווים | ההזמנה שלי לא הגיעה |

Until this one is approved the alert is free text, which reaches Ofir only
while his own number has a window open with the Twilio sender: write one
message to the sender from that phone, and each reply keeps it open. The
email leg does not depend on any of this.

## Variable rules the code enforces

Meta rejects a parameter with a line break, a tab, or more than four
consecutive spaces; Twilio rejects an empty one. `variable()` in
`templates.ts` flattens whitespace, substitutes a fallback for empty (the
greeting becomes `לקוחות יקרים`, the total becomes `-`), and caps at 300
characters. Money arrives in agorot and only `formatAgorot` renders it.

## Routing to Ofir

`src/server/whatsapp/forward-to-owner.ts`, called by the webhook after the
ticket row is written, for every `message`, `refund_request` and any
`order_status` question the lookup could not answer:

- **WhatsApp** to `SUPPORT_FORWARD_WHATSAPP_TO`, default the published store
  number `972524635550` (the floating button). `off` silences this leg. Never
  sent to the customer's own number.
- **Email** to `CONTACT_TO` (the contact-form address), subject
  `וואטסאפ: <label> <ref> מ-<phone>`, with a link to `/admin/support/<id>`.

Both legs are best-effort; a failure is logged (`whatsapp.forward_*_failed`)
and the customer still gets the ticket acknowledgement.

## Answering from the admin

`/admin/support` (section `orders`, support role can read, admin writes)
lists open and pending tickets with the thread. A reply is sent as free text
and is allowed only while the customer's window is open (their last message
under 24 hours ago); outside it the form says so and the answer must wait
for the customer's next message, because a template for arbitrary replies
cannot exist. Every reply is written to `support_ticket_messages` as
`outbound` with Twilio's message SID and moves the ticket to `pending`.
Closing writes `closed_at`.

## Environment

```
TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM   existing, all or nothing
TWILIO_WEBHOOK_URL                                            existing
TWILIO_CONTENT_SID_ORDER_PAID
TWILIO_CONTENT_SID_ORDER_SHIPPED
TWILIO_CONTENT_SID_ORDER_FULFILLED
TWILIO_CONTENT_SID_ORDER_CANCELLED
TWILIO_CONTENT_SID_ORDER_REFUNDED
TWILIO_CONTENT_SID_SUPPORT_INBOUND
SUPPORT_FORWARD_WHATSAPP_TO                                   optional, default store number, `off` to silence
```

## Checklist for Ofir

1. Submit the six templates above in the Content Template Builder.
2. Paste each approved SID into its variable on Vercel; redeploy.
3. From the phone on the floating button, send one message to the Twilio
   sender so the free-text alerts reach it until `support_inbound` is
   approved.
4. Apply pending 252 so `order_shipped` rows can be enqueued at all.
5. Watch `/admin/queues` and `whatsapp_outbox.last_error` for
   `awaiting approved template`: that is a row waiting for step 2.
