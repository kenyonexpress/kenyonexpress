# S05 - Turnstile on /login, /signup, /suppliers/apply

Queue S05, 04.11.2026. Commit `9684d5a7d` on `closeout/v1-final`.

## What changed

| Route | Where the widget sits | Where the server refuses |
| --- | --- | --- |
| `/login` (password form) | `src/app/(auth)/login/LoginForm.tsx`, inside the password form | `runSignInWithEmail` in `src/server/actions/auth.ts`, after the per-IP limiter and before the schema and the per-account limiter |
| `/signup` (the queue's "/register"; no `/register` route exists) | already in `SignupForm.tsx` | `runSignUpWithEmail`, now through the shared helper |
| `/suppliers/apply` (the queue's "/supplier/apply") | a new gate form in front of the wizard, `src/components/turnstile/SupplierApplyChallenge.tsx` | `runSubmitApplication` in `src/server/actions/supplier-onboarding.ts` checks the pass cookie |

New files:

- `src/lib/turnstile/verify.ts`: `verifyTurnstileForm(formData, ip)` reads `cf-turnstile-response` and returns the Hebrew refusal or nothing. Plus `issueTurnstilePass` / `checkTurnstilePass`: an HMAC cookie `ke_ts_pass` (`<userId>.<expires>.<mac>`, 30 minutes, httpOnly, `path=/suppliers`), keyed off `TURNSTILE_SECRET_KEY`. Talking to Cloudflare stays in `src/lib/fraud/turnstile.ts`. Nothing was duplicated.
- `src/components/turnstile/TurnstileRefresh.tsx`: draws the widget explicitly when a client-side navigation mounted it after api.js had already done its one implicit scan, and resets it after a refused submit, because a token is single-use.
- `src/components/turnstile/SupplierApplyChallenge.tsx`: the gate form.

`src/components/fraud/TurnstileWidget.tsx` (frozen) is used unchanged. The wizard `src/components/supplier/SupplierApplyWizard.tsx` exists at the tag, so it was not touched. Implicit Turnstile writes its token only into the form that encloses it. That is why the supplier challenge is solved in a gate in front of the wizard and carried as a signed cookie. The page decides whether to show the gate (`turnstileEnabled()` and no live pass), and the submit action checks the cookie again, so the server still decides.

## Failure policy

Every call goes through `verifyTurnstile` in `src/lib/fraud/turnstile.ts`, which already defined this:

- **Keys configured, token missing or rejected:** refused with `אימות האבטחה נכשל. רעננו את העמוד ונסו שוב.`
- **Keys not configured (either half missing):** allowed. No widget renders, and the pass check returns true.
- **Cloudflare unreachable or 5xx:** allowed, logged as `turnstile.siteverify_*` at error level. This is a bot control, not authorisation.

**Production has both keys** (`docs/S03-env.md`), so login enforcement goes live with the next deploy of this branch. The Google, passkey and magic-link paths carry no challenge. Google and passkey prove a person by other means, and the magic-link form mounts on demand, after the implicit scan has already run.

## Proof

Freeze gate after the commit (it lists only files that did not exist at the tag):

```
$ git diff --stat design-locked-2026-10-19 -- src/components src/app/globals.css src/app/layout.tsx src/app/page.tsx tailwind.config.ts
 .../turnstile/SupplierApplyChallenge.tsx           | 49 +++++++++++++++
 src/components/turnstile/TurnstileRefresh.tsx      | 71 ++++++++++++++++++++++
 2 files changed, 120 insertions(+)
```

`TurnstileWidget.tsx` and `SupplierApplyWizard.tsx`: `git diff --stat design-locked-2026-10-19 --` on both is empty.

Type-check:

```
$ pnpm type-check
$ tsc --noEmit
tsc exit 0
```

Full vitest:

```
$ node_modules/.bin/vitest run
 Test Files  642 passed (642)
      Tests  7703 passed | 12 skipped (7715)
exit 0
```

New tests (16): `src/lib/turnstile/verify.test.ts` (9), `auth.test.ts` "signInWithEmail Turnstile" (2: no token is refused before the per-account limiter, a forged token is refused), `supplier-onboarding.test.ts` "the Turnstile pass" (5: no pass, another user's pass, a live pass, gate without a token, gate with a verified token sets a bound cookie and redirects).

Lint: `biome check` over every tracked and new file except `.lighthouseci/` and `android/` exits 0 (2117 files). `pnpm lint` as a whole fails only on those two untracked directories, which are not mine, the same as S04. Every node gate (tokens, copy, asset, raw-html, postgrest-or, cache-invalidation, rtl-logical, i18n, locale-format, input-dir, docs-index, docs-path-audit) is clean. The i18n gate first read 605 against its ceiling of 603. The gate title and body moved to `messages/he.json` and `messages/en.json` under `turnstile.*`, and it now reads 603.

## Not done

- No browser run against real Cloudflare keys. Locally there is no key pair, so the widget renders nothing and the path is "not enforced". The enforced path is proven with stubbed `fetch` only.
- The hourly production E2E signs in through the password form. Once this deploys, a headless run without a solved challenge will be refused at login.
