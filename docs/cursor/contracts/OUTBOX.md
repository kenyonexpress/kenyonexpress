# Outbox contract

Queue table: `notification_outbox` (not `message_outbox`). Drain: `GET /api/cron/notifications` Bearer `CRON_SECRET`. Two legs (114): email and push, independent status/attempts/backoff. WhatsApp via `sendOutboxWhatsapp` on the same drain.

---

## Row shape (live columns)

| Column | Meaning |
|---|---|
| `id` | uuid |
| `kind` | CHECK `notification_outbox_kind_check` |
| `recipient_email` | may be empty for push-only future; today mail path needs it |
| `payload` | jsonb, amounts as `*_agorot` integers |
| `dedupe_key` | UNIQUE; also Resend idempotency |
| `user_id` | nullable; 114 |
| `status` / `attempts` / `next_attempt_at` / `sent_at` / `last_error` | email leg |
| `push_status` / `push_attempts` / `push_next_attempt_at` / `push_sent_at` / `push_error` | push leg |

Enqueue: `fn_enqueue_notification` ON CONFLICT DO NOTHING.

---

## Kinds that must agree (three lists)

CHECK constraint, enqueue literals, `buildNotification`. Measured 2026-08-19 then expanded. Canonical test list includes: `order_paid`, `supplier_sale`, `voucher_redeemed`, `voucher_issued`, `voucher_gifted`, `voucher_expiring`, `cashback_credited`, `invoice_dead`, `low_stock`, `reconciliation_gap`, `refund_completed`, `welcome`.

Adding a type: (1) human migration CHECK (2) builder (3) enqueue site (4) `outbox-kinds.test.ts` (5) deploy together. Else 23514 or a parked row with no mail.

---

## Consent

| Kind class | Consent |
|---|---|
| Transactional (paid, voucher, refund, expiry warning) | Account / checkout; not marketing checkbox |
| Marketing (abandoned cart, campaigns) | Confirmed newsletter / `marketing_email`; 30א' |
| Push | `PUSH_ENABLED` + token + template exists |
| WhatsApp marketing | Explicit WA opt-in (W06/W30). Click-to-chat is not opt-in |

Withdrawn: `email_suppressions` wins. Kill switch skips send, keeps row.

---

## Frequency caps

- Abandoned cart: UNIQUE `cart_id` on `abandoned_cart_nudges` (one forever).
- Welcome: `welcome:<uid>`.
- Cashback mail: `cashback:<orderId>` after ledger commit.
- Drain BATCH 50 per run. Backlog across runs.
- MAX_ATTEMPTS 5. Backoff minutes: `2 * 4^(attempts-1)` → 2, 8, 32, 128.
- Then `dead`. Admin requeue. Not a silent drop.

---

## Retry / adapters

| Adapter | Module | Failure |
|---|---|---|
| Email | Resend `sendEmail` | increment email attempts |
| Push | Expo `pushOutboxRow`; kinds without template → `push_status=none` | independent |
| WhatsApp | `src/lib/whatsapp/outbox` | must not rewind email |

Missing Resend key: degrade, do not fail `finalizeOrder`.

---

## What never goes in the payload

PAN, Cardcom tokens, service_role, live `products.platform_percent`, float ILS.

---

## Open questions

| Q | Best answer |
|---|---|
| Abandoned cart kind in CHECK? | Confirm on code branch. If direct Resend, do not add a kind in W05 alone. |

---

## Second pass

Drain is cron, not finalize. Three lists must move together. Marketing vs transactional consent in `CONSENT-MODEL.md`. Unique `cart_id` for abandoned cart is forever. `KILL_SWITCH_NOTIFICATIONS` parks send, does not delete rows.

