# C105 Web push (F14): PWA subscription flow, VAPID, triggers

Most of F14 shipped in C10/C11/C14 (see `docs/C10-web-push.md`, `C11-WEB-PUSH-SETUP.md`, `C14-PUSH.md`). C105 audited it against the spec and closed the remaining gaps.

## Flow
1. `PushPrompt` / `BrowserPushToggle` ask permission, register `public/sw.js`, subscribe with `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.
2. `POST|DELETE /api/push/subscribe` and `POST /api/push/unsubscribe` store or remove the row in `public.push_subscriptions` (migration 290, applied; RLS select/delete own, writes via service role; endpoint must be https).
3. A notification_outbox row is drained by `/api/cron/notifications` -> `src/lib/push/dispatch.ts` -> `sendWebPush` (`src/lib/push/web-push.ts`). 404/410 from the push service deletes the dead subscription.
4. `public/sw.js` shows `{ title, body, url, tag }`; same-origin URLs only.

## VAPID
- Env: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (optional, defaults to `mailto:support@kenyonexpress.co.il`). Present in `.env.local` and Vercel production.
- Missing keys: `node scripts/gen-vapid.mjs` prints a fresh pair via `web-push`. It writes nothing; paste into `.env.local` and the hosting env. Rotating the pair invalidates existing subscriptions.
- Without keys the sender is inert and reports `VAPID keys not configured`; nothing throws.

## `src/lib/push.ts`
Facade, safe for client import. `PUSH_TRIGGERS` maps the five product triggers to outbox kinds; `pushContentFor(trigger, payload, siteUrl)` builds the copy; `isPushSubscribable()` gates the prompt.

| Trigger | Outbox kind | Source |
|---|---|---|
| expiry T-7 | `voucher_expiring` (days_remaining 7) | `enqueue_expiring_voucher_notices({7,1})` via pg_cron `push-expiry-reminders` -> `/api/push/send` |
| expiry T-1 | `voucher_expiring` (days_remaining 1) | same, title "הקופון שלך פג מחר" |
| order status change | `order_status_changed` | outbox enqueue on status transition |
| invoice ready | `invoice_ready` | outbox enqueue when invoice is issued |
| security alert | `security_alert` | outbox enqueue (new sign-in, password change, passkey added) |

All five kinds are in `PUSHABLE_KINDS` and templated in Hebrew in `src/lib/push/templates.ts`.

## Verification
- `src/lib/push.test.ts` plus the existing `src/lib/push/*` and `src/app/api/push` suites: 61 tests pass.
- `tsc` and biome clean on the new files.
- Not verified: end-to-end delivery to a real browser, and the production enqueue side of the order/invoice/security kinds. Neither was available in this session.
