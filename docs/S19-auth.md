# S19: sign-in end to end

Queue item S19, 04.11.2026. Scope: password and Google sign-in verified end to
end, passkey registration after the first purchase, and a WhatsApp code
sign-in through Meta Cloud API that falls back to an email code when the
WhatsApp env is missing.

## What production actually has (measured 04.11)

`GET /auth/v1/settings` on `ixvwfbuvfxxsjiywhbbb` with the publishable key:

```
{'anonymous_users': True, 'google': True, 'email': True} signup_disabled False autoconfirm False phone_autoconfirm False sms twilio
```

**The phone provider is off.** `phone` is not in the enabled list, so
`signInWithOtp({ phone })` cannot issue a code. That decided the WhatsApp
design: the code has to be generated and checked by us, and Meta only
delivers it.

## Password: works

A real sign-in against production with the seeded E2E customer
(`e2e/auth-session.ts`):

```
POST /auth/v1/token?grant_type=password  e2e-customer@test.kenyonexpress.local
{'has_access_token': True, 'user_email': 'e2e-customer@test.kenyonexpress.local', 'aal': 'set', 'err': None}
HTTP 200
```

and a wrong password for an unknown address:

```
{"code":400,"error_code":"invalid_credentials","msg":"Invalid login credentials"}
400
```

The `/login` form (`signInWithEmail` in `src/server/actions/auth.ts`) puts
Turnstile, a per-IP and a per-account rate limit in front of that same call.
Those were already covered by `src/server/actions/auth.test.ts` and are
unchanged.

## Google: works up to Google's consent screen

```
GET /auth/v1/authorize?provider=google&redirect_to=https://kenyonexpress.co.il/auth/callback
google authorize: 302 -> https://accounts.google.com/o/oauth2/v2/auth?client_id=94949481849-si5rr7rakmi629tlgpjpongcfqup5f67.apps.googleuser...
```

The provider is enabled and holds a real client id. `signInWithGoogle`
redirects to that URL with `redirectTo = siteUrl() + /auth/callback?next=...`,
and `/auth/callback` exchanges the code (`src/app/auth/callback/route.test.ts`
covers the exchange, the safe `next` and the guest-cart merge). Completing the
Google screen needs a human Google account, so the last hop was not automated.

## WhatsApp code through Meta Cloud API, with the email fallback

New files:

| File | Job |
|---|---|
| `src/lib/auth/whatsapp-cloud.ts` | `whatsappCloudConfig()` / `otpChannel()` read the env. `sendWhatsAppOtp()` POSTs an authentication template to `graph.facebook.com/{v}/{phone_number_id}/messages`, code in the body and in the copy-code button. |
| `src/lib/auth/otp-challenge.ts` | A six-digit code (`crypto.randomInt`) and a stateless challenge: base64url `{subject, expiry}` plus HMAC-SHA256 over payload and code. No table, no migration. The code is never stored. |
| `src/lib/auth/otp-email.ts` | The Hebrew RTL mail for the email leg. Colours come from `OFF_PAGE`, copy from `messages/he.json`. |
| `src/server/actions/otp-sign-in.ts` | `sendSignInCode` and `verifySignInCode`. |
| `src/app/(auth)/login/OtpSignInForm.tsx` | The two-step form: target, then code. |

**Channel choice.** `WHATSAPP_CLOUD_TOKEN`, `WHATSAPP_CLOUD_PHONE_NUMBER_ID`
and `WHATSAPP_OTP_SECRET` (32+ characters) all set means WhatsApp. If any one
is missing, or holds a `[PLACEHOLDER]` value, the channel is email. The login
page reads this on the server and passes it as a prop, so the browser never
offers a channel the server cannot use. If Graph refuses a send at runtime,
the action answers `fallback: 'email'` and the form switches to an email field.

**WhatsApp leg.**
1. Send: limits `phone-otp` (per IP) and `phone-otp-number`, Israeli mobile
   only, then Graph. The challenge goes into an httpOnly cookie
   `ke_otp_challenge` (10 min). The code is sent whether or not the number
   has an account, so this step does not reveal who is a customer.
2. Verify: limits `phone-verify` and `phone-verify-number` (5 per hour per
   number), then the HMAC. The cookie is deleted on success (single use).
3. The account is the single `profiles` row whose phone normalises to the
   same E.164. A magic-link token is minted for its email with the service
   key and redeemed with `verifyOtp({ token_hash, type: 'magiclink' })` on the
   request's own client. That is the same call the magic-link callback makes,
   so the session is an ordinary one.
4. Zero or two-plus matching accounts: no session. The customer is told to use
   email. **A phone number never creates an account**, because a Supabase
   user needs an email to receive the magic-link token.
5. After sign-in, the same follow-through as the other paths: PostHog
   identify, guest cart merge, `phone_verified_*` write (tolerates the
   unapplied 217), and the referral claim.

**Email leg.** Limit `magic` on send. With Resend configured,
`generateLink` provides Supabase's own `email_otp` and we send the branded
mail. Otherwise `signInWithOtp({ email })` sends Supabase's mail. Verify uses
`verifyOtp({ email, token, type: 'email' })` behind the new
`otp-verify-email` policy (5 per hour per address, added to
`src/lib/rate-limit/policies.ts` and `docs/RATE-LIMITS.md`).

**Production today: email.** None of the three WhatsApp variables is set in
`.env.local` (`grep -c` = 0). Turning WhatsApp on needs an approved
AUTHENTICATION template named `login_code` (Hebrew) on the WABA that owns the
phone number id. That is Meta Business Manager work, and env flips the form
without a deploy of new code. Documented in `docs/ENV-REFERENCE.md` and
`.env.example`.

## Passkey after the first purchase

`/checkout/return` already showed `FirstPurchaseBanner` on the first paid
order, but always with `hasPasskeys=false` and only a link away to
`/account/security`. Now:

- The page reads `listPasskeys()` for a signed-in, non-anonymous viewer
  (best-effort; a failure does not cost the confirmation) and passes the real
  `hasPasskeys` to the banner.
- New `src/app/(store)/checkout/return/PasskeyAfterPurchase.tsx` runs the
  registration in place: `beginPasskeyRegistration` -> `startRegistration` ->
  `finishPasskeyRegistration`. It uses the same snooze key as the account-area
  prompt, so "not now" quiets both for 30 days. A cancelled OS prompt counts
  as "not now". Guests are skipped: an anonymous session has no account for a
  credential to open later.

## Tests

New: `otp-challenge.test.ts` (6), `whatsapp-cloud.test.ts` (8),
`otp-sign-in.test.ts` (14: email fallback with env missing, branded mail,
email verify and limit, Graph payload and cookie, landline refusal, runtime
fallback, owner sign-in by minted token, wrong code, other number, no account,
two accounts, per-number limit), `otp-sign-in-form.test.tsx` (3),
`passkey-after-purchase.test.tsx` (5).

## Gates

Run 04.11.2026 on `closeout/v1-final`, from `ed2870d95` plus this item's changes.

```
$ node node_modules/vitest/vitest.mjs run --reporter=dot
 Test Files  667 passed | 1 skipped (668)
      Tests  7993 passed | 13 skipped (8006)
vitest exit 0

$ pnpm type-check
tsc exit 0

$ biome check src e2e scripts docs supabase migrations messages *.ts *.json
Checked 2145 files in 613ms. No fixes applied.
```

The other twelve `pnpm lint` stages (tokens, copy, asset, raw-html,
postgrest-or, cache-invalidation, rtl-logical, i18n, locale-format, input-dir,
docs-index, docs-path-audit) all exit 0. The i18n gate is at
`603 Hebrew literals in scope, ceiling 603`, because all new UI and mail copy
went into `messages/he.json` and `messages/en.json`.

A bare `pnpm lint` exits 1 for one reason only: `biome check .` reads the
untracked `.lighthouseci/*.json` reports (over 1 MiB each) that another
session left in the tree. They are not part of this item and were not
touched.

Design freeze, `git diff --stat design-locked-2026-10-19 -- src/components src/app/globals.css src/app/layout.tsx src/app/page.tsx tailwind.config.ts`:

```
 .../supplier-apply/SupplierCardCheck.tsx           | 53 ++++++++++++++++
 .../turnstile/SupplierApplyChallenge.tsx           | 49 +++++++++++++++
 src/components/turnstile/TurnstileRefresh.tsx      | 71 ++++++++++++++++++++++
 3 files changed, 173 insertions(+)
```

All three are S17 files that did not exist at the tag (`git cat-file -e`
fails for each). S19 itself changes nothing under `src/components`; its UI
files are in `src/app/(auth)/login` and `src/app/(store)/checkout/return`,
both on the open list.

No migration. No production config change.
