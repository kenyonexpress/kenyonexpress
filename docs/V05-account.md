# V05: account visual (04.11.2026)

Queue item V05. `/account/**` now opens the same way as /cart, /checkout and /login (V01, V02, V04): a breadcrumb, a centred "החשבון שלי", then Electro's my-account layout.
- **From 992:** WooCommerce's MyAccount navigation is a side column, with the active tab marked by a yellow bar.
- **Below 992:** the same navigation is one horizontally scrolling tab strip, and the active tab is scrolled into view.

The dashboard, the orders list, an order, the wallet, the coupons and the settings pages (details, security) were shot at 380, 768 and 1440.

## What changed

**The frame (`src/app/(account)/layout.tsx`).**
- The breadcrumb is the V04 band: grey and 42px at 380, transparent from 768.
- A centred "החשבון שלי" sits under it. It is a `<p>`, not an `h1`, because every endpoint keeps its own `h1` (the tab's name). That heading is now Electro's section heading: a hairline under the title, with a yellow bar under the words only.
- The copy moved to `account.frame.*`.

**`src/styles/account-electro.css` (new)** is layered after `account.css`. It reshapes the frame and the shared vocabulary without renaming any class, so every account page and component picks it up:
- **Two columns from 992** (270px and the rest, gap 40), **one below**.
- **Tab strip below 992:** `.account-nav__list` becomes a `nowrap` flex row with `overflow-x: auto`, scroll snap and no scrollbar. The 48px tabs have a 3px yellow underline for the active one. The identity block becomes a compact line, and the notification bell is pinned beside it. The streaming placeholder is resized to the strip (104px), so nothing shifts when the nav arrives.
- **Controls:** every `.account-btn` is 44px with radius 22. Submit buttons in a card are #fed700 and go ink on hover. Inputs are 45px pills with a #fed700 focus. Links inside running text get a 44px hit area.
- **`.account-table`:** WooCommerce's `shop_table`. Below 768 it is `shop_table_responsive`: each row becomes a bordered card, and each cell prints its column name from `data-title`, so no table scrolls sideways.
- **`.account-card--danger` / `.account-btn--destroy`:** for the delete-account card.

**`AccountTabsActive` (new, `src/app/(account)/AccountTabsActive.tsx`)** scrolls the active tab into the middle of the strip. Fifteen tabs do not fit 380px. Without this, the strip opens at its start, and on `/account/security` the active tab is eleven tabs off screen.
- It does **not** call `usePathname`. A path hook in a layout-level client component either stops the build (`/account/coupons/[id]/gift` failed exactly that way on the first build) or writes a nonce-less `$RC` into every static shell.
- Instead it watches for `AccountNav`'s own `aria-current="page"` with a MutationObserver. That fires when the nav streams in and again on every client navigation.
- It moves the strip with `scrollBy` on the list, never `scrollIntoView`, which would also scroll the page.

**Pages.**
- **Dashboard (`/account`):** gets WooCommerce's dashboard paragraph: "שלום {name} (לא {name}? התנתקות)" (the sign out is a form button) plus one line on what the tabs hold. The copy moved to `account.dashboard.*` / `account.hello.*`. The h1 stays "האזור האישי" (e2e asserts it).
- **Orders (`/account/orders`):** the row list is replaced by the orders table:
  - הזמנה (`#` + the first 8 characters of the id, linking to the order)
  - תאריך
  - סטטוס (chip)
  - סה״כ ("40 ₪ עבור 1 פריטים", plus "כולל קופונים")
  - a yellow "צפייה" button

  The empty state gets "למעבר לחנות". The copy is in `account.ordersPage.*`.
- **Wallet:** the ledger is the same `.account-table` with `data-title` cells, and lost its inline `overflow-x` wrapper. The copy is in `account.walletPage.*`.
- **Details:** `ExportDataSection` and `DeleteAccountSection` (both under `src/app/(account)`) moved from ad-hoc Tailwind to the account vocabulary. That fixed three controls under 44px: a 13px checkbox, a 38px confirm input and a 36px delete button. Their logic is unchanged.
- **Order detail, coupons, security:** CSS only, through the shared classes.

**Money is whole shekels.**
- `formatIls` in `src/lib/account/format.ts` is the one formatter for the account area: the nav badge, the wallet, the orders and the order page.
- It now goes through the new `formatAgorotWhole` in `src/lib/money.ts`: half-up away from zero with integer arithmetic (`divRoundHalfUp`), sign kept. The account area was the last screen printing "1,982.00 ₪".
- `format.test.ts` asserts 12.49→12, 12.50→13 and −3.50→−4.

## Decisions

- **The affiliate payout button stays exact.** `AffiliatePayoutForm` names the amount a payout will transfer, and "123.50 ₪" is not "124 ₪". It now calls `formatAgorot` directly instead of the account formatter, and its test is unchanged.
- **Tabs below 992, not below 768.** At 768 the content column beside a 270px nav is 428px, and the orders table needs more than that. Electro's own my-account columns break at `lg` (992).
- **`AccountNav.tsx` is not edited.** The tab strip is CSS over its existing markup, plus the observer. The only file under `src/components/` touched is `account/AffiliatePayoutForm.tsx` (one import, for the decision above), and `/account/**` is on the open side of the 04.11 amendment.
- **The screenshot sign-in is minted, not typed.** `/login` runs Turnstile, whose key is not valid for localhost. The script does one password grant for the E2E fixture customer and sets the `@supabase/ssr` cookie (V03 did the same). Nothing is submitted on any page.
- **The full-page shots are capped at 3000px.** The fixture holds 50 orders and dozens of coupons, and the uncapped coupons page was 7 MB per width. The measurement still covers the whole page.

## Proof

### Freeze gate

```
$ git diff --stat design-locked-2026-10-19 -- src/components/home src/components/layout src/components/hero src/components/header src/components/category src/components/storefront src/components/product-card src/components/SiteFooter.tsx src/app/globals.css src/app/layout.tsx src/app/page.tsx tailwind.config.ts
(no output, exit 0)

$ git diff --stat -- src/components src/app/globals.css src/app/layout.tsx src/app/page.tsx tailwind.config.ts
 src/components/account/AffiliatePayoutForm.tsx | 10 +++++++---
 1 file changed, 7 insertions(+), 3 deletions(-)
```

No frozen file was touched. `src/components/account/` is not on the frozen list.

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
lint exit 0

$ pnpm test
 Test Files  685 passed | 1 skipped (686)
      Tests  8153 passed | 13 skipped (8166)
test exit 0

$ pnpm build
exit 0   (every /account route ◐)
```

The i18n ceiling went from 592 to 568.

### E2E (`e2e/account-area.spec.ts`, chromium + mobile-chrome, against `pnpm start` on 3311)

Signing in through the form fails on Turnstile on this build ("אימות האבטחה נכשל"). So the run seeds `e2e/auth-session.ts`'s cookie cache with the minted session (`AUTH_CACHE=1 node scripts/v05-account-shots.mjs`) and keeps Playwright's output elsewhere (`--output=/tmp/pw-v05`), because Playwright empties `test-results/` at the start of a run.

```
12 passed, 6 failed (2.4m)
```

Passing:
- signed-out redirects ×2
- the overview h1 and tiles
- the orders list linking to `/account/orders/<uuid>`
- the order page with the fee in agorot
- the app-consent switch

Each of these runs on both projects.

The six failures are three tests on two projects. None of them is in code this item touched:
- **"a live coupon on the order page"** and **"the transfer mode…"**: the newest orders with a full-screen QR have no `validity-countdown` / `voucher-transfer` on that voucher. That depends on the fixture's vouchers. The order page's voucher markup is unchanged by this item.
- **"buy again"**: it reaches `/checkout` and `/cart`, then times out in `emptyCart` clicking the line's remove button, with the consent banner showing. That is the cart page (V01), outside this item's files and CSS. Every selector in `account-electro.css` is `.account-*`.

### curl (signed out, local production build)

```
/account 307 -> /login?next=%2Faccount
/account/orders 307 -> /login?next=%2Faccount%2Forders
/account/wallet 307 -> /login?next=%2Faccount%2Fwallet
/account/coupons 307 -> /login?next=%2Faccount%2Fcoupons
/account/details 307 -> /login?next=%2Faccount%2Fdetails
/account/security 307 -> /login?next=%2Faccount%2Fsecurity
/account/vouchers 307 -> /login?next=%2Faccount%2Fvouchers
```

Signed in, every route answered 200 in the screenshot run below. The script throws on any bounce to `/login`.

### Screenshots and measurements

`docs/V05/`, from `pnpm build` + `pnpm start` on 3311, by `BASE=http://localhost:3311 node scripts/v05-account-shots.mjs`. Inside `.account-page` the script measures:
- horizontal overflow
- text clipped by its own box
- every visible control under 44px (a checkbox counts through its label)
- whether the nav is a side column or a tab strip
- whether the active tab is inside the strip's visible box

```
dashboard-380 nav=tabs activeVisible=true overflowX=0 small=0 clipped=0
orders-380 nav=tabs activeVisible=true overflowX=0 small=0 clipped=0
order-380 nav=tabs activeVisible=true overflowX=0 small=0 clipped=0
wallet-380 nav=tabs activeVisible=true overflowX=0 small=0 clipped=0
coupons-380 nav=tabs activeVisible=true overflowX=0 small=0 clipped=0
details-380 nav=tabs activeVisible=true overflowX=0 small=0 clipped=0
security-380 nav=tabs activeVisible=true overflowX=0 small=0 clipped=0
dashboard-768 nav=tabs activeVisible=true overflowX=0 small=0 clipped=0
orders-768 nav=tabs activeVisible=true overflowX=0 small=0 clipped=0
order-768 nav=tabs activeVisible=true overflowX=0 small=0 clipped=0
wallet-768 nav=tabs activeVisible=true overflowX=0 small=0 clipped=0
coupons-768 nav=tabs activeVisible=true overflowX=0 small=0 clipped=0
details-768 nav=tabs activeVisible=true overflowX=0 small=0 clipped=0
security-768 nav=tabs activeVisible=true overflowX=0 small=0 clipped=0
dashboard-1440 nav=side activeVisible=true overflowX=0 small=0 clipped=0
orders-1440 nav=side activeVisible=true overflowX=0 small=0 clipped=0
order-1440 nav=side activeVisible=true overflowX=0 small=0 clipped=0
wallet-1440 nav=side activeVisible=true overflowX=0 small=0 clipped=0
coupons-1440 nav=side activeVisible=true overflowX=0 small=0 clipped=0
details-1440 nav=side activeVisible=true overflowX=0 small=0 clipped=0
security-1440 nav=side activeVisible=true overflowX=0 small=0 clipped=0
```

The first measured run had 105 controls under 44px at each width. They were:
- 100 "לצפייה" links in the wallet ledger at 40px wide
- two inline links on the order page
- the three delete-account controls

All of them were fixed before the run above.

| File | What |
|---|---|
| `dashboard-{380,768,1440}.png`, `-fold` | `/account`: greeting, wallet, tiles |
| `orders-…` | `/account/orders`: the table at 1440, labelled cards at 380/768 |
| `order-…` | the newest order's page |
| `wallet-…` | balance and ledger |
| `coupons-…` | `/account/coupons` (`/account/vouchers` and `/account/my-vouchers` redirect here) |
| `details-…` | settings: profile, sign out, export, delete |
| `security-…` | settings: passkeys and sign-in methods |

Each `-fold` file is the viewport as it opens. The plain file is the page from the top, capped at 3000px.
