# S15: partner redeem

Queue item S15, 04.11.2026. Task: `/partner/redeem` for the coupon-partner
role. The partner scans the QR or types the 8 digits. Each attempt has an
idempotency key, every attempt goes to `redemption_events`, and a second
redeem is refused. Tests.

## What already existed (read before writing anything)

| Piece | Where | State before S15 |
|---|---|---|
| Coupon partner | `supplier_members` (`owner`/`manager`/`scanner`), `requireSupplierMember` | The only authorization signal. `profiles.role` has no partner value and is a routing hint only. |
| Single-use burn | `redeem_voucher` RPC (production) | Works. A SECURITY DEFINER function that derives the business from `auth.uid()`. It does a conditional UPDATE on `status = 'issued'`, replays on `voucher_redemptions.idempotency_key` (unique index), and enforces one success per voucher (unique index). It accepts the **10-symbol short code only**. |
| 8-digit code | `vouchers.partner_pin` (254) | Unique per business among issued vouchers only, so a redeemed voucher's pin can be reused later. **Nothing could redeem by it.** |
| Supplier scanner | `/supplier/scan`, `/api/supplier/vouchers/redeem` | Works for QR and short code. The idempotency key is optional. |
| `redemption_events` | `vouchers_redemption_events` + `redeem_voucher_locked` (production only, **in no repo file**) | Table with 0 rows. The wrapper takes a per-code advisory lock, calls `redeem_voucher`, and logs one event with `input_kind` (`qr`/`code`/`pin`). **No code called it.** |

## Found: the live wrapper had never run once

`redeem_voucher_locked` passes `p_ip inet` to `redeem_voucher(..., p_ip text, ...)`.
In `pg_cast`, inet to text has `castcontext = 'a'` (assignment only), and a
function call does not apply assignment casts. Run as a real supplier member,
in a rolled-back transaction, before the fix:

```
ERROR:  42883: function public.redeem_voucher(text, text, text, inet, text) does not exist
```

That is why the events table was empty. Migration **255** fixes it with
`p_ip::text`. It also normalises the code before the lock and the event read,
and writes the table down as it is live.

## What S15 built

1. **`/partner/redeem`** (`src/app/partner/redeem/`). New route, new folder,
   no frozen file touched. It is guarded by `requireSupplierMember`: signed out
   goes to `/login?next=/partner/redeem`, signed in without a membership goes
   to `/supplier/access-denied`. It is `noindex`. It has one field, a button,
   and a camera button when `BarcodeDetector` exists. On success it shows the
   balance to collect via `formatAgorot` (integer agorot, whole shekels).
   Copy lives in `messages/*.json` under `partnerRedeem`.
2. **Input** (`src/lib/vouchers/partner-input.ts`). Exactly 8 digits (spaces
   and hyphens ignored) is a pin. Otherwise the existing scanner parser
   applies: a KEV1 token, a `/redeem/<token>` URL, or a 10-symbol code. A pin
   and a code cannot collide.
3. **Domain** (`src/server/domain/vouchers/partner-redeem.ts`). A pin resolves
   to a code **only among the caller's own active businesses**. The issued row
   wins, otherwise the newest row, which is why a second redeem says "כבר מומש"
   and not "לא נמצא". A QR is HMAC-verified before any DB call. The burn goes
   through `redeem_voucher_locked` on the **user-scoped** client, never the
   service role. Attempts that never reach the RPC (bad signature, unknown
   pin, garbage) get their own `vouchers_redemption_events` row. A failed
   membership or pin read throws (500). It is never answered as "not found".
4. **API** (`POST /api/partner/redeem`). Same-origin check, then session,
   then rate limit, then a body with **`idempotency_key` required** (8 to 128
   characters). It shares the `voucher-redeem` limiter bucket with the
   supplier route, so the pin space cannot be walked through the uncounted
   endpoint. A replay runs no side effect. On a new success it runs: expire
   the wallet pass, one `voucher_redeemed` event, and fraud velocity signals.
5. **Idempotency in the page.** One key per attempt, held in a ref. A network
   failure or a 5xx keeps the key, so pressing again replays the same attempt.
   Any 2xx/4xx answer ends the attempt. Editing the field or a new camera scan
   mints a new key. The button is disabled in flight.
6. **Camera** on `/partner/redeem` via `CAMERA_PATHS`
   (`src/lib/security/frame-policy.ts`). Everywhere else stays `camera=()`.

### Fixed on the way

`/api/supplier/vouchers/redeem` sent **two** `voucher_redeemed` events per
scan: the same `trackServerEvent` block was pasted twice. The duplicate is
removed. A new test fails on the old code (`expected 1 times, but got 2
times`) and passes now.

## Decisions made alone

1. **"Coupon partner" = an active `supplier_members` row**, any member role.
   No new role was added to `user_role`. The RPC already authorizes on
   membership, and a second signal would be a second thing to keep in sync.
2. **Pin resolution in the app, not in SQL.** Production needed only the one
   cast fix. The resolution runs on the service role but is filtered by the
   caller's memberships, which are read through the caller's own session.
   The burn's authorization is still the RPC's.
3. **Migration 255 applied** under the queue rule ("apply one at a time via
   supabase db query --linked -f"), after a BEGIN/ROLLBACK rehearsal. It is a
   CREATE OR REPLACE of a function nobody could call, plus a no-op
   `CREATE TABLE IF NOT EXISTS`. The ACL is unchanged.
4. **Signed-out visitors get a streamed redirect, not a proxy 307.** The page
   is partial-prerender, so the guard redirects inside Suspense
   (`NEXT_REDIRECT;replace;/login?next=%2Fpartner%2Fredeem;307` plus a meta
   refresh). The form never renders without a session, and the API refuses
   with 401 regardless. `src/proxy.ts` was not widened for one route.
5. **No full browser E2E as a partner.** The production RPC was proven
   directly as a real member (below), the adapter and domain by unit tests,
   and the page by curl against `pnpm start`.

## Files

| File | Change |
|---|---|
| `migrations/pending/255_redeem_voucher_locked_fix.sql` | New. Applied. |
| `migrations/pending/README.md`, `APPLY-ORDER.md`, `src/__tests__/pending-migrations-inventory.test.ts` | 255 rows. |
| `src/lib/vouchers/partner-input.ts` + test | New. |
| `src/server/domain/vouchers/partner-redeem.ts` + test | New. |
| `src/app/api/partner/redeem/route.ts` + test | New. |
| `src/app/partner/redeem/page.tsx`, `PartnerRedeemClient.tsx` | New route. |
| `messages/he.json`, `messages/en.json` | `partnerRedeem` block (the i18n ceiling stays 603). |
| `src/lib/security/frame-policy.ts` + test | `/partner/redeem` in `CAMERA_PATHS`. |
| `src/app/api/supplier/vouchers/redeem/route.ts` + test | Duplicate event removed, test added. |
| `data/legacy/redirect-map.json` | `/partner/redeem` in `static_routes` (the legacy-redirects gate lists every static route). |
| `docs/INDEX.md`, `README.md` | Index row, document count 296 to 297. |

## Proof

### Production before the fix: the wrapper cannot be called

```
$ supabase db query --linked -f /tmp/s15proof.sql      # BEGIN ... DO ... RAISE (rolled back)
ERROR:  42883: function public.redeem_voucher(text, text, text, inet, text) does not exist
```

### Migration 255 applied

```
$ supabase db query --linked -f migrations/pending/255_redeem_voucher_locked_fix.sql
{ "rows": [] }

$ supabase db query --linked -f /tmp/s15chk.sql
  "acl": "{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}",
  "anon_x": false,
  "ev": 0,
  "fixed_live": true
```

### Production after the fix: pin redeem, replay, double redeem refused

A real active supplier member's identity (`request.jwt.claims`, role
`authenticated`). Production has 0 issued vouchers, so a copy of the newest
voucher at a business with an active member is made `issued` with pin
`98765432`. The block calls `redeem_voucher_locked` three times: key 1, key 1
again, then key 2. It ends in `RAISE`, so everything rolls back.

```
S15PROOF {"first": "success", "first_replayed": "false",
          "same_key_retry": "success", "retry_replayed": "true",
          "new_key_second": "already_redeemed",
          "status_after": "redeemed", "pin_len": 8, "events_before": 0,
          "events": [{"outcome": "success", "replayed": false, "input_kind": "pin"},
                     {"outcome": "success", "replayed": true, "input_kind": "pin"},
                     {"outcome": "already_redeemed", "replayed": false, "input_kind": "pin"}]}
```

Residue check afterwards: `events_after: 0`, `issued: 0`, and no row with
code `S15PRF0001`.

`seo_redirects` rows for `/partner%` on production: `0`, so the new route is
not shadowed by a 410.

### Targeted

```
$ npx vitest run src/lib/vouchers/partner-input.test.ts src/server/domain/vouchers/partner-redeem.test.ts \
    src/app/api/partner src/app/api/supplier/vouchers/redeem src/lib/security/frame-policy.test.ts \
    src/__tests__/pending-migrations-inventory.test.ts src/lib/seo/legacy-redirects.test.ts
```

Domain cases (`partner-redeem.test.ts`, 10):

- A pin redeems through the user client, logged as `pin`.
- A second redeem with a new key is `already_redeemed`, by pin and by QR.
- The same key replays success.
- Another business's pin is `not_found` with no RPC call.
- No membership resolves nothing.
- The issued row wins over a redeemed one with the same pin.
- A forged QR is refused before the RPC and logged.
- A signed QR redeems as `qr`.
- A failed membership read throws.
- Garbage is logged under a kind the CHECK accepts.

Route cases (`route.test.ts`, 8):

- The idempotency key is required (400).
- No session gets 401.
- A cross-site request gets 401 before the session is read.
- The shared `voucher-redeem` bucket returns 429.
- A success runs each side effect once.
- A replay runs no side effect.
- A double redeem gets 409 with `redeemed_at`.
- An infrastructure failure gets 500.

### Live server (`pnpm build` exit 0, `PORT=3311 pnpm start`)

```
├ ƒ /api/partner/redeem
├ ◐ /partner/redeem

GET /partner/redeem (signed out)        -> 200 shell, NEXT_REDIRECT;replace;/login?next=%2Fpartner%2Fredeem;307
                                           + <meta http-equiv="refresh" content="1;url=/login?next=%2Fpartner%2Fredeem">
Permissions-Policy: camera=(self), microphone=(), geolocation=(), payment=(self)
POST /api/partner/redeem (no session)   -> 401 {"outcome":"unauthorized","message":"אין הרשאת שותף"}
```

### Full gates

```
$ pnpm test
 Test Files  658 passed | 1 skipped (659)
      Tests  7907 passed | 13 skipped (7920)
test exit 0

$ pnpm type-check
$ tsc --noEmit
tsc exit 0

$ npx biome check src scripts migrations messages data next.config.ts docs
Checked 2067 files in 673ms. No fixes applied.
biome exit 0
```

The rest of `pnpm lint`, run gate by gate, exit 0:

```
tokens gate: clean (no raw hex, rgb() or arbitrary px in src/)
copy gate: clean (no Latin marketing sentence in a rendered component)
asset gate: clean (no template or vendor product imagery under public/images)
raw-html gate: clean (every dangerouslySetInnerHTML is jsonLdScript or allowlisted)
postgrest-or gate: clean (every .or() interpolation is sanitized or session-derived)
cache-invalidation gate: clean (every write to a cached table invalidates it, every cached scope carries a tag)
rtl-logical gate: clean (no physical direction utility outside an LTR island)
i18n gate: clean (603 Hebrew literals in scope, ceiling 603)
locale-format gate: clean (116 inline 'he-IL' in 64 files, at the ceiling)
input-dir gate: clean (25 tel/email/url inputs, all carry dir)
docs-index-gate: OK. 297 documents, all listed; 2 out-of-docs row(s) resolve.
docs-path-audit: OK. 160 known dangling references, no change.
```

A bare `pnpm lint` exits 1 because of 107 biome errors, **all** in the
untracked `.lighthouseci/` (Lighthouse JSON from 25 to 27.10, not from this
session). The tracked tree has 0, as shown above. That folder was not deleted:
it is not this item's, and deleting files is not done on a guess.

### Design freeze gate

```
$ git diff --stat design-locked-2026-10-19 -- src/components src/app/globals.css src/app/layout.tsx src/app/page.tsx tailwind.config.ts
 .../turnstile/SupplierApplyChallenge.tsx           | 49 +++++++++++++++
 src/components/turnstile/TurnstileRefresh.tsx      | 71 ++++++++++++++++++++++
 2 files changed, 120 insertions(+)
```

Both files were added after the tag (`--diff-filter=M` lists 0 files), and
neither is from S15. No file under the frozen list was touched.
