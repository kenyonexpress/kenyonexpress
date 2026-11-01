# ARCHITECTURE-USER-ACCOUNT.md

The customer account, end to end: every way into it, every screen inside it,
and the policy line under each read.

Status: BINDING. Branch `autopilot`, 2026-09-17.
Scope: code and tests. **No migration**: every table this describes already
exists on the hosted project with RLS on and owner-only policies, measured
through the Supabase MCP on 2026-09-17 (see §6).
Code this describes: `src/server/actions/auth.ts`, `src/server/actions/passkeys.ts`,
`src/server/actions/account.ts`, `src/server/actions/privacy.ts`,
`src/server/queries/account.ts`, `src/server/queries/cashback.ts`,
`src/lib/cashback/tracker.ts`, `src/lib/validations/auth.ts`,
`src/app/(auth)/**`, `src/app/(account)/**`, `src/app/auth/callback/route.ts`,
`src/proxy.ts`.
Migrations already applied: `052` (owner policies on wallet and tokens),
`055` (wallet), `177` (cashback ledger and bonus), `178` (passkeys),
`215` (cashback expiry).

---

## 0. The shape in one table

| Way in | Action | Where the session is minted | Public? |
|---|---|---|---|
| Email + password | `signInWithEmail` | `signInWithPassword` on the SSR client | yes, 10/h per IP and 20/h per address |
| Google | `signInWithGoogle` → `/auth/callback` | `exchangeCodeForSession` | yes |
| Magic link (click) | `sendMagicLink` → `/auth/callback?token_hash=` | `verifyOtp({type:'magiclink'})` in the callback | yes, 5/h per IP |
| Magic link (typed code) | `sendMagicLink` → `verifyEmailOtp` | `verifyOtp({type:'email'})` in the action | yes, 20/h per IP and per address |
| SMS code | `sendPhoneOtp` → `verifyPhoneOtp` | `verifyOtp({type:'sms'})` in the action | yes, when a provider is wired |
| Passkey | `beginPasskeyLogin` → `finishPasskeyLogin` | `generateLink` + `verifyOtp` server-side, no mail | begin yes, finish by assertion |
| Registration | `signUpWithEmail` → `/signup/confirm` | after mail confirmation, in the callback | yes, 5/h per IP |
| Forgot password | `sendPasswordReset` → `/reset-password` → `updatePassword` | recovery session from the mail | yes, neutral reply |
| Change password | `changePassword` | none: re-proves the current one, then `updateUser` | **no**, session required |

Every action in the first column is listed by name in
`auth-coverage.test.ts`'s `PUBLIC_ACTIONS` with its reason. Everything else in
a `'use server'` file must reach `auth.getUser()` or a guard, and the test
walks the call graph to prove it.

## 1. Four places a session is minted, one set of claims made in each

`/auth/callback` is where Google, email confirmation and the clicked magic
link land. It merges the guest cart, claims the referral, and queues the
welcome mail. Three of the sign-in paths never reach it, because `verifyOtp`
establishes the session inside the action itself:

- `verifyPhoneOtp`
- `verifyEmailOtp` (new)
- `finishPasskeyLogin`

Each of those repeats the cart merge and the referral claim, gated on the
merge's return value the same way, so the guest cookie is deleted only when a
merge actually ran. The welcome mail is not repeated: it is keyed
`welcome:<uid>` in the outbox, and a customer who signs in by code has already
been welcomed by whichever path created the account.

## 2. The typed code is the same secret as the link

`trySendBrandedMagicLink` calls `admin.generateLink({type:'magiclink'})` and
gets back both `hashed_token` (which becomes the link) and `email_otp` (six
digits). The branded Hebrew mail now carries both. Clicking verifies the hash
in the callback; typing verifies the digits in `verifyEmailOtp` with
`type:'email'`. GoTrue treats them as one token, so whichever is used first
consumes the other.

The code field on `/login` appears only after a send succeeded, and it posts
the address from the same input the send used, hidden. A second address
field would let the two drift and produce "the code is wrong" for a code that
was fine, the same reasoning `PhoneOtpForm` already documents.

When the branded path cannot run (no Resend key, unknown address), the
Supabase fallback mail goes out instead, and that template does not include
the code. The field still renders, and a code typed against it fails with the
same neutral sentence as a wrong code. That is accepted: the alternative is a
success message that reveals whether the address is registered.

## 3. Change password re-proves the owner

`updateUser({password})` is authorised by the session alone, and a session is
exactly what a shared or stolen device has. So `changePassword`:

1. requires a session, and rate limits on the **user id** (10/h), not the IP;
2. validates through `changePasswordSchema`, which holds the new password to
   the signup rule and refuses one identical to the current;
3. signs in with the current password on `createPublicClient()`, the anon
   client that persists nothing, and revokes the session that check minted;
4. only then updates through the SSR client.

A Google-only or passkey-only account has no password to re-prove. The form
says so and links to `/forgot-password`, which is the one flow that sets a
first password without an old one.

## 4. The account area

`src/proxy.ts` bounces `/account*` without a session before any render.
`(account)/layout.tsx` re-checks in a streamed hole. Every read under it uses
the request-scoped client, so RLS by `auth.uid()` decides what comes back.

| Route | Reads | Writes |
|---|---|---|
| `/account` | wallet summary, orders, vouchers, cashback tracker | none |
| `/account/details` | profiles | `updateProfileDetails`, `deleteAccount` |
| `/account/orders`, `/[id]` | orders, order_items, vouchers | none |
| `/account/wallet` | wallet_accounts, v_wallet_ledger | none, by design |
| `/account/cashback` (new) | v_wallet_ledger, cashback_ledger, orders | none, by design |
| `/account/security` | webauthn_credentials, auth.mfa factors, profiles.role | passkeys, TOTP, `changePassword` |
| `/account/addresses`, `/tokens` | user_addresses, payment_tokens | owner CRUD |
| `/account/privacy` | export route | `deleteMyAccount` |

`/account/security` previously rendered passkeys and the replay toggle only.
`SecurityClient` (TOTP enrolment against Supabase's native MFA) existed with
no page importing it, so the aal2 gate in `lib/auth/mfa.ts` guarded nobody.
It renders there now, with the staff copy driven off `profiles.role`.

## 5. The cashback tracker

Nothing in `src/lib/cashback/tracker.ts` moves money. The database awards
(`fn_cashback_order_bonus`) and expires (`fn_cashback_expire`); the tracker
answers three display questions over the rows the owner can already read:

- **Lifetime earned**: the sum of `v_wallet_ledger` credits with reason
  `order_cashback` or `cashback_bonus`.
- **Live credits and the next to lapse**: debits of every kind consume the
  oldest cashback first, the same customer-favourable reading
  `expirableCashbackAgorot` uses for the sweep, and a credit lapses twelve
  months after it landed (`cashbackExpiresAt`). What survives, with its date,
  is what the page shows; credits past their date are omitted rather than
  shown as "lapsed yesterday" for money the sweep has not yet taken.
- **Next bonus**: ranked the way the SQL ranks, `count(paid orders) + 1`, with
  the rate from `cashbackRateBp`. Zero paid orders means the next order is the
  first at 10%; otherwise the next multiple of five at 5%.

The history table reads `cashback_ledger` directly, which carries the rate
and the basis, so a row can say "10% of ₪120 on order X". Entry types are
labelled from the constraint in 177 and 215; an unknown type falls through
to itself rather than to a wrong label.

Every amount is integer agorot through `money.ts`. The only division in the
module is a percent for a progress bar.

## 6. RLS, measured on 2026-09-17

Queried through the Supabase MCP against `ixvwfbuvfxxsjiywhbbb`:

| Table | RLS | Policies |
|---|---|---|
| `profiles` | on | select and update unified by owner or admin; role frozen on update |
| `wallet_accounts` | on | `wallet_accounts_owner_read` (select only) |
| `wallet_entries` | on | `wallet_entries_select_unified` (select only) |
| `cashback_ledger` | on | owner select, admin select |
| `webauthn_credentials` | on | owner select, owner delete; insert and update service-role only |
| `user_addresses` | on | owner CRUD |
| `payment_tokens` | on | owner select, update, delete |
| `orders` | on | unified per role |

`v_wallet_ledger` is a view over `wallet_entries` and `wallet_accounts`, so
the underlying policies apply. No write policy exists on any wallet table
for any role; money moves only through `fn_wallet_transfer` under the service
role. That is why neither `/account/wallet` nor `/account/cashback` has an
action.

## 7. What is tested

- `src/lib/cashback/tracker.test.ts`: rank, FIFO consumption, expiry
  cut-off, thirty-day window, labels.
- `src/server/actions/auth-email-otp.test.ts`: the OTP action's ceilings,
  the `type:'email'` call, the cart merge and referral claim, off-site
  redirect refusal; the change-password action's session requirement,
  current-password re-proof, revoke of the check's session, schema gate.
- `src/__tests__/auth.validations.test.ts`: both new schemas.
- `src/lib/email/magic-link.test.ts`: the code in both bodies, omitted when
  absent, escaped when hostile, and still no link but the login link.
- `auth-coverage.test.ts`: `verifyEmailOtp` is listed as public with a
  reason; `changePassword` is found guarded by the walker.
- `auth-redirect.test.ts`: still exactly three `authRedirect` uses, on the
  same three paths. Neither new action adds a redirect target.

## 8. Not done, and why

- **Email change** from inside the account. Supabase's double-confirm flow
  needs both the old and the new inbox to click, and the details page says
  the address comes from the identity provider. Left as is.
- **Session list** per device. GoTrue exposes no per-session listing to the
  client; "sign out everywhere" is what exists and it is on the security page.
- **Mandatory MFA** for staff. Enrolment stays user-driven for the reason in
  `lib/auth/mfa.ts`: shipped from an autonomous run, a mandatory gate is how
  the one human with production access gets locked out.
