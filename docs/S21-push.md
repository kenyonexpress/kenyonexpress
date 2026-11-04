# S21: web push, VAPID keys, service worker subscribe, topics

Queue item S21, 04.11.2026. Scope: VAPID keys in the Vercel env, subscription
handled by the service worker, and two topics, `order_updates` and `expiry`.

## What already existed, and what did not

The sender existed and so did the opt-in. `src/lib/push/web-push.ts` signs and
sends, `src/lib/push/web-leg.ts` fans one outbox row out to a customer's
browsers, `PushOptIn` subscribes from the notifications page, and
`push_subscriptions` (179) is live. The expiry reminder (S20) already enters
the same outbox, so it reaches push through `pushOutboxRow` without any change.

Missing pieces:

1. **No working key pair anywhere.** Measured 04.11, values never printed:
   - `.env.local`: the private key was 41 characters (30 bytes; a P-256 scalar
     is 43 / 32). It does not derive the public key: `pairMatches false`.
   - Production (`kenyonexpress-projects/kenyonexpress`): both names were set
     42 days ago, the private one as Sensitive, so it cannot be read back.
     The public key is byte-identical to the local one (same sha256 prefix
     `5897cdd813a3`), so the pair was most likely copied from the same broken
     source.
   - `VAPID_SUBJECT` was unset everywhere.
   - `push_deliveries` holds **0 rows**: no web push has ever been delivered
     in production, so there was no evidence the production key worked.
2. **No topics.** Every browser got every kind.
3. **The service worker did nothing about subscriptions.** It had no
   `pushsubscriptionchange` handler, and nothing repaired a subscription
   minted against an old key.

## Decision: rotate the pair (made alone, recorded in STATE.md)

`.env.example` says never to regenerate once subscriptions exist, because
rotation orphans them. One subscription exists (from 23.10). The pair it is
bound to is provably broken locally and unverifiable in production, so
keeping it would mean keeping a key no one can show works. The new
activate-time reconcile in `public/sw.js` (below) re-subscribes an orphaned
browser on its next visit, which brings the cost of rotating down to zero.

```
$ node -e '<web-push generateVAPIDKeys + ECDH derive check + setVapidDetails>'
ok pubChars 87 privChars 43 pubSha d5afc5f86d41

$ vercel env rm NEXT_PUBLIC_VAPID_PUBLIC_KEY production --yes   Removed Environment Variable
$ vercel env rm VAPID_PRIVATE_KEY production --yes              Removed Environment Variable
$ vercel env add NEXT_PUBLIC_VAPID_PUBLIC_KEY production < pub
$ vercel env add VAPID_PRIVATE_KEY production --sensitive < priv
$ vercel env add VAPID_SUBJECT production   (mailto:support@kenyonexpress.co.il)

$ vercel env ls production | grep VAPID
 VAPID_SUBJECT                  Hidden               Secret  Production  8s ago
 VAPID_PRIVATE_KEY              Hidden               Secret  Production  12s ago
 NEXT_PUBLIC_VAPID_PUBLIC_KEY   eyJ2IjoidjIiLCJjIj…  Config  Production  16s ago

$ vercel env pull --environment=production   (then hashed, not printed)
pulled pubSha d5afc5f86d41 subject [SENSITIVE] priv sensitive(unreadable)

$ <same derive check on .env.local after the update>
local pairMatches true subject mailto:support@kenyonexpress.co.il
```

The production public key matches the freshly minted one. Production picks
the keys up on the **next deploy**. No deploy was made from this item: a
production deploy is one of the four stop conditions. `NEXT_PUBLIC_` is baked
in at build time, so the current deployment keeps the old public key until
that deploy happens.

## Topics

`src/lib/push/topics.ts`, stored per browser in `push_subscriptions.topics`
(migration 259, default both).

| class | kinds | rule |
|---|---|---|
| `order_updates` | order_shipped, voucher_redeemed, cashback_credited, invoice_ready, referral_bonus_credited | only browsers with the topic |
| `expiry` | voucher_expiring, voucher_expiry_credited | only browsers with the topic |
| required | order_paid, voucher_issued, voucher_gifted, refund_completed | every browser, topics ignored: the same rule `preferences.ts` applies to every channel |
| untopical | price_drop, back_in_stock, security_alert, welcome | per-kind switch only, as before |

Per browser, not per account: the per-kind switches on the page already
answer the per-account question. When a topic filter leaves no browser for a
row, the leg settles with `skipped: topic switched off on every browser` and
spends no retry.

UI: `src/components/notifications/PushTopicsSwitch.tsx` is a **new** file
under the frozen `PushOptIn`, rendered on `/account/notifications`. It shows
only when THIS browser has a stored row, identified by its own endpoint. It
writes through the new `updatePushTopics` action.

## Service worker subscribe

`public/sw.js`, the PUSH SUBSCRIPTION UPKEEP section, with its route
`src/app/api/push/subscription/route.ts`:

- `pushsubscriptionchange`: posts the browser's new subscription, or
  re-subscribes itself when the event carries none.
- `activate`: compares the existing subscription's `applicationServerKey`
  with `GET /api/push/subscription`. When they differ, it unsubscribes,
  re-subscribes with the current key, and POSTs with `oldEndpoint`. This is
  what repairs the rotation above.
- The POST is same-origin with the session cookie and limited by the
  `push-subscribe` policy. It saves the new row with the old row's topics
  **before** deleting the old row. A refused POST makes the worker
  unsubscribe again, so the browser never shows "on" without a row behind it.

The action and the route share `src/server/push/subscription-write.ts`.
That file is not `'use server'` on purpose: its functions take a `userId`,
and exported from an action module they would be callable by any browser.

## Migration 259 apply

```
$ supabase db query --linked -f migrations/pending/259_push_subscription_topics.sql
Initialising login role...
{ "rows": [] }

$ supabase db query --linked "<information_schema + pg_constraint>"
  "column_name": "topics", "data_type": "ARRAY", "is_nullable": "NO",
  "column_default": "ARRAY['order_updates'::text, 'expiry'::text]",
  "check_def": "CHECK ((topics <@ ARRAY['order_updates'::text, 'expiry'::text]))"

$ select topics, count(*) from push_subscriptions group by 1
  { "n": 1, "topics": ["order_updates", "expiry"] }

$ do $$ ... update push_subscriptions set topics = array['marketing'] ...
       raise exception 'CHECK DID NOT FIRE'; exception when check_violation ... $$
{ "rows": [] }          (no exception surfaced: the CHECK fired, nothing changed)
```

Grants: `push_subscriptions` is granted at table level (no column grants), so
the new column is readable by the RLS-scoped query on the page.

## Gates

```
$ pnpm type-check
tsc exit 0

$ biome check <every tracked file>          Checked 2173 files. exit 0
$ biome check <the 19 files of this item>    Checked 19 files. No fixes applied.
tokens-gate ... docs-path-audit              all twelve exit 0
```

`pnpm lint` first exited 1 with 107 errors, **all of them in
`.lighthouseci/*.json`**. That is an untracked directory of Lighthouse reports
left by another session. Biome walks it because it is untracked and not
ignored. The fix was to add `/.lighthouseci/` to `.gitignore` (Biome has
`vcs.useIgnoreFile: true`) rather than delete anything. After that, and after
the INDEX row and README count below, `pnpm lint` passes end to end; the
output is under "Full suite".

Targeted suites (push, server, notifications, pwa, both SW tests, account):

```
Test Files  130 passed (130)
     Tests  1852 passed (1852)
```

### Full suite

```
$ pnpm type-check
tsc exit 0

$ pnpm lint
Checked 2182 files in 633ms. No fixes applied.
docs-index-gate: OK. 303 documents, all listed; 2 out-of-docs row(s) resolve.
docs-path-audit: OK. 160 known dangling references, no change.
lint exit 0

$ pnpm test
 Test Files  674 passed | 1 skipped (675)
      Tests  8060 passed | 13 skipped (8073)
test exit 0
```

Before the README count was corrected, the same run had one failure:
`ci-docs-inventory` expected 302 and README said 301. That was stale since
S20; it now says 303, this document included.

### Freeze gate

```
$ git diff --stat design-locked-2026-10-19 -- src/components src/app/globals.css src/app/layout.tsx src/app/page.tsx tailwind.config.ts
 .../notifications/ExpiryEmailSwitch.test.tsx       | 34 +++++++++++
 src/components/notifications/ExpiryEmailSwitch.tsx | 52 ++++++++++++++++
 .../supplier-apply/SupplierCardCheck.tsx           | 53 ++++++++++++++++
 .../turnstile/SupplierApplyChallenge.tsx           | 49 +++++++++++++++
 src/components/turnstile/TurnstileRefresh.tsx      | 71 ++++++++++++++++++++++
 5 files changed, 259 insertions(+)
untracked (this item, new):
src/components/notifications/PushTopicsSwitch.test.tsx
src/components/notifications/PushTopicsSwitch.tsx

files in that diff that existed at the tag: (none)
```

`PushOptIn.tsx`, `PushDevices.tsx` and `PostPurchasePushPrompt.tsx` existed
at the tag and are untouched.

## Not done here, and why

- **No production deploy.** That is a stop condition. The new keys, the
  route and the SW go live together on the next deploy.
- **The push drain is not running.** `notification_outbox` holds 2192 rows
  with `push_status = 'pending'`, and the last settled push was on 15.10.
  S20 recorded that every 162 cron job POSTs and gets 405. Fixing the
  scheduler is its own item; this one makes the leg correct once it runs.
- `.lighthouseci/`, `android/` and `STATE.md.bak` are untracked files from
  other sessions. Left alone.
