# V07: mobile shell check of the open routes (04.11.2026)

Queue item V07. Every route open under the 04.11 amendment was checked at 380 and 768 for six things: horizontal scroll, overlap, 44px tap targets, inputs hidden by the keyboard, safe-area insets and a blocking install prompt. Everything found was fixed.

The routes are:
- /cart, and the cart drawer opened over it
- /checkout, and the order confirmation (`/checkout/confirm` → `/checkout/return`)
- /login and /register
- all 17 /account pages
- /supplier/apply
- /terms-and-conditions, /privacy-policy, /refund_returns and /accessibility

That is 28 routes at 2 widths, so 56 measured pairs.

**Result: 21 failing pairs before, 0 after.** Both sides were measured with the same script on a fresh `pnpm build` + `pnpm start`. The before side was built from HEAD with the fixes set aside, and the fixes were restored byte for byte afterwards (`git diff` compared identical). Screenshots are in `docs/V07/before/` and `docs/V07/after/`, with `report.json` in each.

## How it is measured

`scripts/v07-mobile-shell.mjs` (new):

```
PORT=3311 pnpm start &
BASE=http://localhost:3311 OUT=docs/V07/after node scripts/v07-mobile-shell.mjs
```

The context is a touch device (`hasTouch`, `isMobile` at 380), signed in as the E2E fixture customer by a minted SSR cookie, as in V05 and V06. Per route and width:

| check | how |
|---|---|
| overflow | `scrollWidth - innerWidth` on the document |
| covered | every control in the page root is scrolled to mid-screen and hit-tested at its centre with `elementFromPoint`. The same is done at the foot of the page for the lower half of the screen, where a bottom bar sits over the last row. Fixed bars are also checked for overlapping each other. |
| small | controls under 44px, or 24px for a link inside running text. Controls inside the frozen header, top bar, footer and tab bar are counted apart (`smallChrome`) and not failed, because those files are frozen. |
| keyboard | the viewport is shortened by a keyboard's height (336px at 380, 400px at 768). Every field in `main` is then focused and must land on screen and not under a fixed bar. This is the resizes-content model, where fixed bars ride up with the keyboard. It is the worst case of the browsers' models. |
| safe-area | Chromium's `Emulation.setSafeAreaInsetsOverride` with an iPhone's 47px top and 34px bottom. No control inside a bottom-fixed bar may sit in the inset, no two fixed bars may overlap, and the page foot is checked again. |
| install | a synthetic `beforeinstallprompt` after a scroll. Where the banner appears, it must not cover a control or another bar. |

## What was wrong, and the fix

**1. The checkout pay bar covered the tab bar on notched phones (380).**
- `viewport-fit=cover` gives the page the bottom 34px. The tab bar pads itself with `env(safe-area-inset-bottom)`, so on an iPhone it is 4rem plus the inset tall.
- The sticky pay bar was parked at `bottom: var(--reserve-tabbar)`, a plain 4rem, so it covered 26px of the tab bar's icons.
- At 768 there is no tab bar, and the bar's "לתשלום" button sat in the home-indicator strip (bottom 1014 of 1024, inset line at 990).
- **Fix** (`src/styles/checkout-page.css`): under 768 the bar sits at `--reserve-tabbar + inset`. From 768 it stays on the bottom edge and pads its contents by the inset. The page's foot reserve and the lifted WhatsApp button add the inset too.

**2. The WhatsApp button overlapped the tab bar by 6px on notched phones.** This happened on cart, checkout, the confirmation and the four legal pages at 380, for the same reason as 1: `bottom-[5.25rem]` is computed off the 4rem bar.
- **Fix** (`src/styles/mobile-shell.css`, new, imported last in `app.css`): the button, its sheet and `body`'s bottom reserve add `env(safe-area-inset-bottom)` on the open routes.
- The rules are scoped with `body:has(:is(.cart-page, .checkout-page, .auth-page, .account-content, .supplier-apply, .legal-page))`, so home, category and product keep their output.

**3. The install banner sat on the tab bar and the WhatsApp button.**
- On the four legal pages at 380 it overlapped the tab bar by 44px and the WhatsApp button by 33px. At 768 it overlapped the button by 56px.
- Its `bottom` offset counts the consent banner and not the tab bar. It also showed on /login and /register, where a bottom bar rides up with the keyboard.
- **Fix** (`src/components/pwa/InstallPrompt.tsx`): these six paths join `HIDDEN_ON` with checkout, cart, account and supplier. The banner keeps its browse moment on the storefront.
- `install-prompt.test.tsx` gains a case per path.

**4. Controls under 44px.**

| where | before | fix |
|---|---|---|
| checkout, saved-card rows (`token_id` radios) | 24px tall | `.checkout-cards__option` gets min-height 44px, as the method row has |
| /account/notifications, "everything in the app" switch | 48x28 | the button is the 44px target and the 28px track is an inner span, so it paints the same (`EverythingInAppToggle.tsx`) |
| /account/subscriptions, empty-state "לדילים באתר" link | 74x20 | `inline-flex min-h-touch-min` (`SubscriptionList.tsx`) |
| /account/affiliate, channel input | 42px | `min-height: 44px` (`account.css`) |
| /account/wishlist, "העבר לעגלה" and "הסר" | 36 and 38px | `min-h-touch-min`, plus `min-w-touch-min` on "הסר" (`WishlistItemActions.tsx`) |

**Clean before and after, with nothing to fix:**
- horizontal overflow: 0 on all 56 pairs
- the keyboard check: every field on every route stayed visible and uncovered, including 10 on /supplier/apply and 4 on /register
- the cart drawer
- the confirmation's inline install copy, which is in flow and not fixed

## Decisions

- **Header, top bar, footer and tab bar are not changed.** They are on the frozen list. The script reports their small controls (about 25 per page, mostly 21px footer links and 23x40 header icons) under `smallChrome` and does not fail on them. The overlap fixes move only the open routes' own elements, the WhatsApp button and `body`'s reserve, and only on open routes.
- **The install banner is hidden on these routes, not moved.** Moving it above the tab bar means changing the root layout's banner on every page, home included, which is frozen. The legal documents and the sign-in forms are not browsing moments, which is the same reasoning the component already applies to checkout and account.
- **`body`'s reserve gains the inset on open routes, as prevention.** The foot check found nothing covered there before, because the footer is outside the page root it hit-tests. On a notched phone, though, the footer's last row sat under the inset strip, since `globals.css` reserves 4rem for a bar that is 4rem plus the inset tall.
- **Keyboard model.** Chrome on Android and Safari on iOS shrink the visual viewport and leave fixed bars at the layout bottom, behind the keyboard. Shrinking the layout viewport instead makes fixed bars ride up over the fields, so a pass here is a pass in both.

## Proof

### Freeze gate

```
$ git diff --stat design-locked-2026-10-19 -- src/components/home src/components/layout src/components/hero src/components/header src/components/category src/components/storefront src/components/product-card src/components/SiteFooter.tsx src/app/globals.css src/app/layout.tsx src/app/page.tsx tailwind.config.ts
(no output, exit 0)

$ git diff --stat -- src scripts
 src/app/app.css                                    |  1 +
 src/components/account/SubscriptionList.tsx        |  5 ++++-
 .../notifications/EverythingInAppToggle.tsx        | 18 ++++++++++++------
 src/components/pwa/InstallPrompt.tsx               | 19 ++++++++++++++++++-
 src/components/pwa/install-prompt.test.tsx         | 22 ++++++++++++++++++++++
 src/components/wishlist/WishlistItemActions.tsx    |  4 ++--
 src/styles/account.css                             |  1 +
 src/styles/checkout-page.css                       | 20 +++++++++++++++++---
 8 files changed, 77 insertions(+), 13 deletions(-)
 (new: src/styles/mobile-shell.css, scripts/v07-mobile-shell.mjs)
```

No frozen file was touched.

### Measured

```
before: {"routes": 56, "failing": [cart-380, cart-drawer-380, checkout-380, confirm-380,
  account-notifications-380, account-subscriptions-380, account-affiliate-380,
  account-wishlist-380, terms-380, privacy-380, returns-380, accessibility-380,
  checkout-768, account-notifications-768, account-subscriptions-768,
  account-affiliate-768, account-wishlist-768, terms-768, privacy-768, returns-768,
  accessibility-768]}                                   (21 failing, script exit 1)

after:  {"routes": 56, "failing": []}                   (script exit 0)
```

Per-pair detail is in `docs/V07/before/report.json` and `docs/V07/after/report.json`. For each pair there are four shots in `docs/V07/<side>/`:
- `<route>-<width>-fold.png`, the screen as loaded
- `-keyboard.png`, the shortened viewport after the last field was focused
- `-safe-area.png`, with the 47/34 inset override
- `-install.png`, where the banner appeared

The pairs to compare:
- `checkout-380-safe-area.png`: the pay bar over the tab bar's icons before, above them after
- `terms-380-install.png`: the banner over the tab bar before, no banner after

### Gates

```
$ pnpm type-check
tsc exit 0

$ pnpm lint
tokens gate: clean (no raw hex, rgb() or arbitrary px in src/)
rtl-logical gate: clean (no physical direction utility outside an LTR island)
i18n gate: clean (568 Hebrew literals in scope, ceiling 568)
locale-format gate: clean (115 inline 'he-IL' in 63 files, at the ceiling)
input-dir gate: clean (28 tel/email/url inputs, all carry dir)
docs-index-gate: OK. 315 documents, all listed; 2 out-of-docs row(s) resolve.
lint exit 0

$ pnpm test
 Test Files  686 passed | 1 skipped (687)
      Tests  8162 passed | 13 skipped (8175)
test exit 0

$ pnpm build
exit 0
```

On the first full run two tests failed. Both were fixed:
- `checkout-tokens.test.ts` pinned the sticky bar's `bottom` to a bare `var(--reserve-tabbar`. It now reads the `calc(` form, and a new case pins the safe-area lift under 768.
- `ci-docs-inventory.test.ts` caught README's document count. It was already one short after V06 (313 against 314 on disk) and is now 315.
