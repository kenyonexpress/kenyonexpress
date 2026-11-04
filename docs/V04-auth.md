# V04: auth visual (04.11.2026)

Queue item V04. `/login` and `/register` are rebuilt as Electro v7's my-account page:
- the store header and footer
- a breadcrumb and a centred "החשבון שלי"
- WooCommerce's two columns: the form on the reading side and the other door opposite it, with an "או" disc on the rule between them

The sign-in column has the password form, then Google, the passkey, and the code step (OTP).

## What changed

**The (auth) group now has the store's chrome.** It used to be a bare grey screen with a "KenyonExpress" wordmark, which is neither the site's name nor its chrome.
- `src/app/(auth)/layout.tsx` now has the same shape as the legal layout: `CartProvider`, `CartBootstrap`, `SkipLink`, `SiteHeader`, `main`, `SiteFooter`.
- It stays synchronous, so nothing here reads cookies.
- The header and footer are **rendered, never edited**.
- Page titles lost their "— KenyonExpress" suffix. The root template already appends "| קניון אקספרס".

**`AuthFrame` (new, `src/app/(auth)/AuthFrame.tsx`).**
- Draws the breadcrumb ("עמוד הבית › החשבון שלי") and the h1.
- With an `aside` it draws the two columns. Without one it draws a single 560px column.
- Forgot password, reset password, MFA, admin MFA and the signup confirmation use the single column, so every page in the group opens the same way.
- `AuthAside` is the opposite panel: a heading, three things an account gets you, and one yellow button through the other door. It carries `next` across.

**`/login`.** The order follows Electro's `form.login`:
1. "כניסה לחשבון", with the yellow bar under the words only.
2. A welcome line.
3. Email, then password.
4. Turnstile.
5. The yellow "כניסה" button, with "שכחתם סיסמה?" beside it from 576 and under it below.
6. Under one "או היכנסו בדרך אחרת" rule:
   - Google
   - the passkey (only on WebAuthn browsers; its failure still opens the magic link, `passkey-fallback.test.ts` unchanged)
   - the code step (WhatsApp or email, S19)
   - SMS, only when a provider is wired
   - the magic link

The opposite column is "לקוחות חדשים" with a "הרשמה" button to `/register`.

**`/register` (new route).** WooCommerce's name for the page. It renders the same `SignupForm` as `/signup`, which stays because every existing link (header account menu, emails, `next` round-trips) points there. It is noindex with a self canonical, for the reason `/login` explains. The fields are the column's own form, and Google sits under an "או הירשמו עם" rule. The opposite column is "כבר רשומים?" with a "כניסה" button.

**The code step (OTP).** `OtpSignInForm` and `PhoneOtpForm` keep their logic. They now use the same 45px pill inputs, a 6-digit centred code field (`data-code`), an outline send button and a yellow verify button.

**Style.** `src/styles/auth-page.css` (new), imported by the (auth) layout. It uses the V01/V02 vocabulary:
- container 1320 / 15px gutter
- the 42px grey breadcrumb band at 380, transparent from 768
- 45px inputs with radius 22 and #ddd borders, focus #fed700
- bold 18px labels
- a #fed700 primary button that goes ink on hover
- outline alternatives

Every control has `min-height: 44px`. The columns stack below 768, and the rule turns horizontal.

**Copy.** All copy moved to the catalog under `auth.frame.*`, `auth.loginPage.*`, `auth.registerPage.*`, `auth.passkey.*` and `auth.aside.*` (he + en). The i18n ceiling was lowered from 595 to 592.

## Decisions

- **No login modal, by the freeze.** The header's account menu (`src/components/layout/AccountMenu.tsx`) is Electro's header sign-in dropdown, and it links to `/login` and `/signup`. A modal would mean either editing that frozen file, or adding an intercepting `@modal` slot to the store layout, which renders every frozen page. Both are on the frozen side of the 04.11 amendment. The modal entry point is therefore the existing dropdown, unchanged, and it lands on this page.
- **The opposite column is a door, not a second form.** Electro shows the full register form beside sign-in. Two forms would mean two Turnstile widgets and two `id="email"` inputs on one page. So the column carries the heading, the benefits and the button, and the full form lives on `/register`.
- **No asterisks on the sign-in labels.** Playwright's `getByLabel` reads the label's text including an `aria-hidden` "*". The footer newsletter field's aria-label contains "אימייל", so the E2E selectors had to become `exact: true`, and the asterisk would break exact matching. Every field on the form is required anyway.
- **Electro reference.** `refs/electro-my-account.html` is a 5.7 KB Cloudflare challenge page, not the page itself. The layout follows WooCommerce's my-account markup (`u-columns col2-set`, `form.login`, `form.register`), which Electro styles, together with the V01/V02 measurements already taken from Electro's cart and checkout.

## Proof

### Freeze gate

```
$ git diff --stat design-locked-2026-10-19 -- src/components/home src/components/layout src/components/hero src/components/header src/components/category src/components/storefront src/components/product-card src/components/SiteFooter.tsx src/app/globals.css src/app/layout.tsx src/app/page.tsx tailwind.config.ts
(no output, exit 0)

$ git diff --stat -- src/components src/app/globals.css src/app/layout.tsx src/app/page.tsx tailwind.config.ts
(no output)
```

No file under `src/components/` was touched. The item edits only `src/app/(auth)/`, `src/styles/auth-page.css` (new), `messages/`, `e2e/`, `scripts/` and `data/legacy/redirect-map.json`.

### Gates

```
$ pnpm type-check
tsc exit 0

$ pnpm lint
i18n gate: clean (592 Hebrew literals in scope, ceiling 592)
input-dir gate: clean (28 tel/email/url inputs, all carry dir)
rtl-logical gate: clean (no physical direction utility outside an LTR island)
tokens gate: clean (no raw hex, rgb() or arbitrary px in src/)
lint exit 0

$ pnpm test
 Test Files  685 passed | 1 skipped (686)
      Tests  8153 passed | 13 skipped (8166)
test exit 0

$ pnpm build
exit 0   (/login ◐, /register ◐, /signup ◐, /signup/confirm ○)

$ E2E_BASE_URL=http://localhost:3311 pnpm exec playwright test e2e/auth.spec.ts --project=chromium --project=mobile-chrome
  34 passed (7.0s)
```

The `pnpm test` failure on the first run was `legacy-redirects.test.ts` asking for `/register` in `data/legacy/redirect-map.json`'s static route list, which is now there. `e2e/route-audit.spec.ts` gained `page200('/register')`.

### curl on the local production build

```
/login 200
/register 200
/signup 200
/forgot-password 200
/reset-password 200
/signup/confirm 200
/mfa 200
```

### Screenshots and measurements

`docs/V04/`, from `pnpm build` + `pnpm start` on 3311, by `scripts/v04-auth-shots.mjs` (`BASE=http://localhost:3311 node scripts/v04-auth-shots.mjs`). The script measures, inside `.auth-page`:
- horizontal overflow
- text clipped by its own box
- every visible control under 44px

```
login-380 overflowX=0 small=0 clipped=0
register-380 overflowX=0 small=0 clipped=0
otp-380 overflowX=0 small=0 clipped=0
login-768 overflowX=0 small=0 clipped=0
register-768 overflowX=0 small=0 clipped=0
otp-768 overflowX=0 small=0 clipped=0
login-1440 overflowX=0 small=0 clipped=0
register-1440 overflowX=0 small=0 clipped=0
otp-1440 overflowX=0 small=0 clipped=0
```

| File | What |
|---|---|
| `login-380.png`, `-768`, `-1440` | /login as it opens: two columns from 768, stacked with the horizontal "או" at 380 |
| `register-380.png`, `-768`, `-1440` | /register |
| `otp-380.png`, `-768`, `-1440` | /login after opening the code step (full page) |
| `otp-fold-380.png`, `-768`, `-1440` | the same, with the code step in the viewport |

The Turnstile box in the shots reads "סיסמת אתר לא תקינה" because the local `.env.local` site key is not valid for localhost. The widget and its keys are unchanged by this item.

The code step's second screen (entering the 6 digits) is not shot: reaching it means asking the server to send a real code. Its markup and classes are the same as the first screen.
