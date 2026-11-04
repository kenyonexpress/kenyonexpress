# S07: guest checkout (04.11.2026)

**Scope.** Queue item S07. A guest can reach payment without an account, the
email is required, after payment the guest is offered Google sign-in and the
order is attached to that user, the shipping address form shows only when the
cart has a physical product, and the address is saved for the next order.

## What was there before

`/checkout` already rendered for a guest, but the pay button was the sign-in.
`CheckoutForm.handleSubmit` stashed the form in sessionStorage and sent a guest
to Google, and `submitCheckout` answered `יש להתחבר לפני התשלום` to anyone with
no session. A guest could not reach the card without an account first.

An earlier version of this feature (C13/C14, on `main` and `autopilot`) was
never merged into `closeout/v1-final`. `main` has since diverged by about 1,500
lines in these files, so it was not merged. The design was ported, and the code
was written fresh against this branch.

## How it works now

| Requirement | Where | Mechanism |
|---|---|---|
| Guest reaches payment | `src/lib/payments/guest-identity.ts`, `submitCheckout` | With no session, `ensureCheckoutUser` calls `signInAnonymously()` and moves the cookie cart onto the new user with `mergeGuestCart`. The order, the address and the Cardcom token are keyed to that user id, so `orders.user_id NOT NULL` stays as it is and **no migration is needed**. Minting is limited to 20 per IP per hour (`guest_identity`, in `policies.ts` and `RATE-LIMITS.md`). |
| Email required | `submitCheckout`, `src/server/auth/guest-orders.ts` | For an anonymous user the email is required on the server too (`normaliseGuestEmail`), and is written to `profiles.email/full_name/phone`. The voucher, invoice and finalize mails already read their recipient from `profiles.email`. The fraud blocklist checks this email for a guest. The client gate already required `email` on step 1. |
| Google after payment | `return/SaveWithGoogle.tsx`, `src/server/actions/guest-upgrade.ts` | `/checkout/return` shows the prompt only when the viewer is anonymous. That is the session `reconcileOrderReturn` just proved owns the order. The prompt calls `linkIdentity({ provider: 'google' })`, so the id stays the same and nothing has to move. |
| Attach when the Google account already exists | `src/app/auth/callback/route.ts`, `attachGuestOrders` | Supabase sends the user back with `error_code=identity_already_exists`, and the callback starts a plain Google sign-in. On the code leg the callback reads the session **before** the exchange. If that session was anonymous and the new user is different, `orders`, `vouchers`, `user_addresses` and `payment_tokens` move to the account. The proof of ownership is the anonymous session cookie, never an id from the URL. |
| Address only for physical | `validateCartView.requiresAddress`, `CheckoutForm` | This was already true, and it is now pinned for a guest as well (`guest-checkout-form.test.tsx`). `beginCheckout` still refuses a physical cart with no `address_id` (`ADDRESS_REQUIRED`). |
| Address saved for next order | `submitCheckout`, `checkout/page.tsx` | The address is inserted with `is_default: true` on the user who paid, whether that is a guest or an account. A guest coming back in the same browser is the same anonymous user, so the page prefills the address and the email from the profile. After the Google link, the same rows belong to the account. |

The "כבר קניתם כאן בעבר?" notice stays, for returning customers. It now saves
what was already typed before it sends them to Google.

## Production preconditions (measured, not assumed)

```
$ curl -s -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
    https://api.supabase.com/v1/projects/ixvwfbuvfxxsjiywhbbb/config/auth | jq '{...}'
{ "external_anonymous_users_enabled": true, "security_manual_linking_enabled": true,
  "external_google_enabled": true, "security_captcha_enabled": false,
  "rate_limit_anonymous_users": 100 }

-- anonymous users already have a profile row
{"anon_users":319,"anon_with_profile":319,"anon_with_email":0}
```

Both writes were rehearsed on production inside `begin; ... rollback;`:

```
update profiles set email=... (latest anonymous user)          -> {"email_written":1}
update orders set user_id=<account> where user_id=<anon> ...    -> {"orders_moved":1}
```

No trigger or constraint refused either write. Nothing was committed.

## Known gap, left on purpose

When the Google account **already exists**, `attachGuestOrders` does not move
wallet or cashback rows. Those are ledgers with derived balances, and moving
rows under a balance is a money change this item must not make. A guest's
cashback for that order stays on the anonymous user. The normal path
(`linkIdentity`, a new Google account) keeps the id, so nothing is lost there.

## Tests

New, 34 tests in 6 files (the suite went from 7730 at S06 to 7764):

- `src/lib/payments/guest-identity.test.ts` (8): reuse an existing session; mint and merge the cart; refuse when the cart did not move; anonymous sign-in off; the per-IP ceiling is asked before minting and only then; email normalisation.
- `src/server/auth/guest-orders.test.ts` (6): all four tables move with the right owner column; a real account is never a source; a same-id link is a no-op; one failed table does not stop the rest; the contact upsert.
- `src/server/actions/payments/guest-checkout.test.ts` (9): a guest passes the form wrapper and reaches `beginCheckout`; the email is normalised onto the profile; the address is saved on the guest as default; no address for a coupon cart; no or malformed email is refused before any write; a returning guest uses the saved email and no second user is minted; a signed-in customer gets no profile write; the IP ceiling stops minting.
- `src/app/auth/callback/guest-link.test.ts` (5): a refused link restarts Google with the same `next`; an error code without `guest_link=1` is ignored; rows move to a different account, not on a same-id link, and never off a real account.
- `src/app/(store)/checkout/guest-checkout-form.test.tsx` (4): a guest's submit does not go to Google (this fails on the old code, which wrote the stash); no email stops the guest on step 1; the notice keeps what was typed; address fields only for a physical cart.
- `src/app/(store)/checkout/return/save-with-google.test.tsx` (2).

`route.test.ts` gained `getUser` on its client mock, because the callback now
reads the session before the exchange.

## Gates

```
$ pnpm test
 Test Files  650 passed (650)
      Tests  7764 passed | 12 skipped (7776)
exit 0

$ pnpm type-check
$ tsc --noEmit
tsc exit 0

$ pnpm exec biome check <every tracked top-level entry>
Checked 2131 files in 650ms. No fixes applied.     (exit 0)
tokens / copy / asset / raw-html / postgrest-or / cache-invalidation /
rtl-logical / i18n / locale-format / input-dir / docs-index / docs-path-audit: exit 0
i18n gate: clean (603 Hebrew literals in scope, ceiling 603)
```

The first full run fired three inventory gates on the new code. All three were
fixed in the code, and none was waived. `readGuestEmail` now names and logs its
`error` (discarded-read inventory). The `guestSave` keys were added to
`en.json` (locale parity). `guest_identity` is registered in `policies.ts` and
`RATE-LIMITS.md`.

`pnpm lint` as a whole still exits 1, and all of its diagnostics are under the
untracked `.lighthouseci/` and `android/`, the same state S04 and S06 recorded.

## Freeze gate

```
$ git diff --stat design-locked-2026-10-19 -- src/components src/app/globals.css src/app/layout.tsx src/app/page.tsx tailwind.config.ts
 .../turnstile/SupplierApplyChallenge.tsx           | 49 +++++++++++++++
 src/components/turnstile/TurnstileRefresh.tsx      | 71 ++++++++++++++++++++++
 2 files changed, 120 insertions(+)
```

Both files are S05's, and neither existed at the tag. S07 touched nothing under
`src/components`. The edited files are `src/app/(store)/checkout/**`,
`src/app/auth/callback/route.ts` and `src/styles/checkout-page.css`. None of
them is frozen (`/checkout` and `/checkout/confirm` are open under the
04.11 amendment). The new block on the return page is one bordered box that
reuses `.checkout-pay-btn`.
