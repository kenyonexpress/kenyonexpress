# W06 Newsletter

Code-agent spec. Double opt-in already exists (`/newsletter/confirm`, `/newsletter/unsubscribe`, `newsletter_subscribers`, `email_suppressions`).

---

## What the wave builds

1. Honest double opt-in: subscribe action → confirm mail → `confirmed_at`. Unconfirmed never gets abandoned-cart or campaigns.
2. One-click unsubscribe (legal). Suppression row wins over a later subscribe until the human confirms again.
3. Footer + checkout optional tick: marketing vs transactional copy must not share a checkbox.
4. Admin list is staff-only. No CSV dump to content_uploader.

**Out of scope.** WhatsApp marketing lists (W30). Push topics (W31).

---

## Tables

| Table | This wave |
|---|---|
| `newsletter_subscribers` | Insert pending, update confirm, soft-unsub. |
| `email_suppressions` | Unsubscribe / bounce / complaint. |
| `notification_outbox` | Confirm mail kind must already pass `notification_outbox_kind_check`. Do not enqueue a new kind without W45. |
| `consent` / `ke_consent` cookie | Analytics/marketing banners are separate from newsletter confirm. |

---

## RLS

- Anon INSERT of a pending subscriber row only through the server action (rate limited), or a DEFINER RPC. Do not open a public INSERT policy that sets `confirmed_at`.
- SELECT: owner email match or admin. Never list all subscribers as `authenticated`.
- `email_suppressions`: service_role / admin.

---

## Money invariants

None. A newsletter must not contain a live `coupon_price_ils` that checkout will not charge. If a campaign quotes a deal, the link is a PDP slug, not a price in the email.

---

## Tests that must exist before close

| Test | If deleted |
|---|---|
| Unconfirmed email is not in `fn_due_abandoned_carts` | Illegal marketing |
| Unsubscribe writes suppression and is honoured | 30א' |
| Confirm token is a capability, not an existence oracle (same shape as gift tokens) | User enumeration |
| Rate limit on subscribe | List bomb |
| content_uploader 403 on admin subscribers | PII leak |

Existing: `src/server/actions/newsletter.ts`.

---

## Feature flag

`KILL_SWITCH_NOTIFICATIONS` skips the confirm send. Off: pending rows pile up; do not auto-confirm to "unclog".

---

## Docs to update

`DATA-RETENTION.md` (email is personal data), `OUTBOX-CONTRACT.md`, `POST-LAUNCH-ROADMAP.md` if newsletter is still listed as growth.

---

## Edge cases

- Same email, new Google uid: bind on email lowercased, not uid alone.
- Guest later signs in: merge pending confirm.
- Bounce: suppression, do not retry forever (outbox MAX_ATTEMPTS = 5).

---

## Depends on / close

Depends on H1. W05 reads this consent. Close: double opt-in, unsubscribe, suppression, tests.
