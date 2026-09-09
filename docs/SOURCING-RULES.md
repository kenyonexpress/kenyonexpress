# Sourcing rules

**Authoritative. Read this before changing any asset, string or geometry value.**
Set by Ofir on 2026-09-04 and recorded here so no future session re-litigates it.

## 1. The Electro template is fully licensed to this project

Its fonts, icon sets, images, stylesheets and markup **may be used directly**.

**No session may strip an Electro asset on licensing grounds, and none may pause
to ask whether it is allowed.** If you find yourself about to remove something
because of where it came from, the answer is in rule 2, not in a licence.

## 2. Electro supplies form. Live supplies content.

| Electro gives us | The live site gives us |
|---|---|
| Section order and page anatomy | Every Hebrew string |
| Grid geometry, column counts, spacing | Every category name and the hierarchy |
| Component anatomy and interactive states | Every product title, price and description |
| Slider and carousel mechanics | Every banner |
| Icon webfont, fonts, type metrics | **Every product image** |
| Responsive behaviour and breakpoints | |

The live site is `kenyonexpress.co.il`. Captures live in `refs/` and are indexed
by `docs/REFS-INDEX.md`.

## 3. The one place the two rules collide, and how it was settled

Live runs the same Electro theme, untranslated. So for a handful of slots, live's
own content **is** Electro's demo content, and "take the content from live" and
"content is not Electro's" point at the same files and disagree.

It came up twice on 2026-09-04:

**Copy.** The homepage carried `SHOP THE HOTTEST PRODUCTS`, `CATCH BIG DEALS ON
THE CONSOLES`, `LAPTOPS NOTEBOOKS AND MORE`, `SIMPLY THE BEST`, `THE NEW
STANDARD`, `PREMIUM PRODUCT` and three `Shop now` buttons, above the fold. Live
shows the same English. Two of those sentences advertise games consoles and
laptops, which this store does not sell — it sells vouchers for restaurants,
spas, hotels, courses and tradespeople.

**Photography.** Eleven images in the hero and the side banners were an iPhone
11 Pro with AirPods, an iPad Pro, Samsung Gear watches, a red phone, a MacBook,
an Apple silhouette, a Tesla mark, App Store and Google Play badges, and a
mockup of Electro's own storefront with the word "electro" in its masthead. Live
serves all eleven from its own `wp-content/uploads`.

**The rule that settles it:** where live's content is demonstrably the template's
demo content rather than this business's, it is *not* content — it is form that
was never replaced, and it does not ship. Where live has no replacement, the slot
gets written Hebrew (copy) or `BrandPlaceholder` (imagery), which says on the
page that the photograph has not been taken yet.

**This is not a licensing decision and never was.** Under rule 1 the template's
own assets are ours to use. These particular files went because they are content
for a different shop, and because a third party's product photography is not
Electro's to license onward in the first place.

## 4. Standing product rules

- **No search field anywhere** — not in the masthead, the handheld header, the
  drawer, the footer or the results page. The Meilisearch backend stays and
  `/search?q=` still answers. Gated by `src/components/layout/no-search-ui.test.ts`
  and `e2e/home.spec.ts`.
- **No express payment buttons anywhere** — no Apple Pay, Google Pay, Bit, Stripe
  Link or provider wallet, on any page. *Apple Wallet and Google Wallet passes
  for issued vouchers are a different feature and are not covered by this rule:*
  they save a coupon to the phone, they do not take a payment.
- **Every visible string is Hebrew.** A single Latin word inside Hebrew is fine
  ("לקניון Express", "הזן כתובת Email"); a Latin sentence is not. Gated by
  `scripts/latin-copy-scan.mjs`.
- **Money is integer agorot**, formatted only through `src/lib/money-format.ts`,
  with the shekel sign to the right of the digits inside an LTR isolate. Gated by
  `src/lib/money-format.test.ts` and `e2e/price-bidi.spec.ts`.

## 5. Where the paths actually are

Several goals name paths this repo does not use. The real ones:

| Named in a goal | What exists here |
|---|---|
| `packages/ui/tokens.css` | `src/styles/tokens.css` (Tailwind v4 `@theme`) |
| `packages/money.ts` | `src/lib/money.ts` + `src/lib/money-format.ts` |
| `electro.html` | `refs/electro_home.html` (captured 2026-09-04) |
| `refs/ke_live_content.json` | does not exist; `refs/ke_live_computed.json` does |
| `scripts/visual-audit.mjs` | does not exist; `scripts/compare.mjs` is the gate |

There is no `packages/` workspace in this repo and creating one would move the
token layer that thirty test files and `globals.css` import. See
`docs/REFS-INDEX.md` for the full mapping.
