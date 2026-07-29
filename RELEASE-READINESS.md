# Release readiness, 2026-07-30

Every number here was measured on `phase5/homepage`, first at `d576017` and then
re-measured after each fix through `687cac0`. Nothing is estimated, and a gate
that could not be measured says so instead of carrying a plausible number.

**Verdict: NOT READY.** Two gates pass outright, two pass on some pages and fail
on others, and two are blocked by one missing credential.

| Gate | Target | Result | |
| --- | --- | --- | --- |
| `npx tsc --noEmit` | clean | 0 errors | PASS |
| Vitest | all pass | 56 files, 735 tests, 11.5s | PASS |
| Production build | succeeds | compiled in 6.2s | PASS |
| Playwright E2E | all pass | 41 passed, **12 failed** | BLOCKED |
| `compare.mjs` all pages | < 11% | 2 of 5 under, home 17.28% → 12.2% | FAIL |
| Lighthouse accessibility | 90+ | product 96, home 88 → **93** | PASS |
| Lighthouse performance | 90+ | product 96, home 75 → **88** | FAIL by 2 |
| `pnpm audit --prod` | no highs | **14 high**, 10 moderate, 3 low | FAIL |

## The one credential behind two failing gates

`SUPABASE_SECRET_KEY` in `.env.local` is the stock key that ships with
`supabase start`. It decodes to `{"iss":"supabase-demo","role":"service_role"}`
and the hosted project answers `Invalid API key`. Both the dev server and the
production build log it on boot:

```
[supabase-admin] SUPABASE_SECRET_KEY is the stock local-development demo key
(iss=supabase-demo), which the hosted project rejects as an invalid API key.
```

Every `createAdminClient()` path is dead: guest cart, checkout address write,
wallet balance, saved cards.

**Unblock:** Supabase Dashboard → Project Settings → API Keys → copy the secret
key into `SUPABASE_SECRET_KEY`. Nothing below marked BLOCKED can be re-measured
before that.

## Playwright E2E: 41 passed, 12 failed

All 12 failures are cart or checkout, and all 12 go through the admin client.
This is the credential above, not broken code:

```
cart.spec.ts        guest add to cart, quantity, header badge, reload, empty state  (7)
checkout.spec.ts    guest gate, populated guest cart, direct checkout link          (3)
auth.spec.ts        redirect from checkout to login                                 (1)
purchase-flow.spec.ts  find a product, add it, reach checkout                       (1)
```

What does pass is worth stating, because it is the whole read-only storefront:
homepage, product page, category page, search including a SQL-wildcard injection
case, the coupon page quoting the on-site charge against the balance at the
business, and 404 behaviour for unknown slugs.

The purchase → coupon → scan flow the goal asks for therefore cannot be run
end to end. Its first leg fails at add-to-cart.

## compare.mjs, every page

```
              first run   after fixes
category          7.35%        8.07%   PASS
product          10.21%       10.71%   PASS
home             17.28%       12.20%   FAIL
search           14.87%       14.92%   FAIL
products         25.75%       28.58%   FAIL
checkout            n/a          n/a   REFUSED to measure
```

The second column is measured on a clean production build. The first was measured
against the long-running dev server, which is still serving stale CSS: asked for
`--spacing-header-masthead` it answered `126px`, a value the file no longer
contains. Small moves between the columns are that difference plus the live hero
being on a different slide between shoots; the 5-point drop on `home` is real.

`--page=checkout` refuses on purpose: an empty cart is redirected to `/cart` on
both sides, and two pictures of a cart score as an excellent checkout. It exits
rather than print a number. That guard is correct and is the reason there is no
figure here.

### Fixed on the homepage: 17.28% → 12.2%

Two defects, found by cropping the worst bands rather than guessing at CSS.

**The add-to-cart button was 0x0 on all 32 cards.**
`product-card-deals.css` styles `.p_con .atc a`, and `ProductCard` renders an
`<a>` only when a product CANNOT be added to the cart, a `<button>` when it can.
So the real control matched no rule: measured 0x0 with a 0x0 svg inside, against a
40px grey circle on live. Invisible *and* unclickable. The fallback link was the
only variant that ever looked right, which is why it survived review.

**The masthead was 127px against live's 110px.**
`--spacing-header-masthead` carried a comment claiming 127 was measured off live.
Live measures 110 today. That single number pushed every block below the header
down 17px, and because the product grid is 8 rows of 485px cards inside a 2600px
window, it surfaced as 30-42% band differences at y1100-1300 that read like
card-level defects. Card heights were identical all along, 485px on both sides.
The first card now lands at 904px against live's 906px, and those two bands are
gone.

`home`'s remaining cost has moved entirely into the hero, y200-700 at 24-31%, and
that band was investigated next.

### The hero band is not a timing artifact, it is five slides painted at once

The obvious theory was autoplay: both heroes rotate, so the two screenshots land
on different slides and the diff scores the difference as infidelity. The crop
supported it, live showing the welcome slide and ours showing PREMIUM PRODUCT.

It is wrong. Both sliders report the same active index, 0, before and after being
told to go to slide 1. What differs is what index 0 *paints*. Asked which
headlines are on screen between y100 and y700:

```
LIVE  ["ברוכים הבאים", "לקניון Express", "SIMPLY THE"]
MINE  ["ברוכים הבאים לקניון Express", "PREMIUM PRODUCT",
       "ממשק מהיר ונוח", "תצוגה מושלמת"]
```

Live has one slide's text in that region. Ours has **all five**. The slides are
stacked in the same box and the inactive ones are still laid out and painted, so
whichever one wins the stacking order is what a screenshot catches, and the hero
can never match a reference that shows exactly one.

A slide-sync step was added to `compare.mjs` to test the autoplay theory and then
**reverted**, because it measurably changed nothing (12.2% → 12.45%, inside shoot
noise) and would have left a comment in the harness claiming to fix something it
does not. The real fix is in `HeroSlider`: inactive slides need to be genuinely
hidden, not merely underneath. That is a change to how the hero works and it is
the next thing to do on this page, not a number to be argued with.

`products` at 28.58% is still dominated by product ORDER: live opens with a
featured block, ours sorts alphabetically, so the grids never line up whatever the
CSS does.

Two findings about the harness itself, both fixed in `d576017`:

- `--page=product` hard-codes the live URL to `/product/מוצר-לדוגמא/` and
  *discovers* the local slug, which answered `צימר-מאסטר`. It was diffing two
  different products. Same product on both sides: 15.64% → 10.72%.
- The dev server was serving CSS with no brand tokens at all.
  `bg-brand-secondary` computed to `rgba(0,0,0,0)`, so the yellow newsletter bar
  rendered white, while the Tailwind CLI compiled it correctly from the same
  file. Turbopack keys compiled CSS on file content, so a server started before
  those `@theme` colours existed serves stale output forever and `touch` does not
  clear it. 10.72% → **10.21%**.

The lesson generalises: measure the harness before believing the number. It has
now been wrong four times in this one pass, in four different ways -- two
different products, CSS with no brand tokens, a stale masthead token, and a
selector that styled only the fallback element.

## Lighthouse, production build, desktop preset

Measured against `next start` on a clean production build in an isolated
worktree, not against the dev server. Dev-mode numbers are not comparable to a
90+ target and are not reported here.

| | performance | accessibility | best practices | SEO |
| --- | --- | --- | --- | --- |
| `/product/מוצר-לדוגמא` | **96** | **96** | | |
| `/` | **75** | **88** | 96 | 100 |

Home metrics: FCP 0.4s, Speed Index 1.3s, CLS 0.003, TBT 0ms, **LCP 5.8s**. CLS
and TBT are excellent; LCP alone is what costs 25 points. The server responded in
240ms, so this is not a backend problem, it is what the homepage loads after that.
On the product page the shape is inverted: performance 96 with a 1,660ms document
response, so its cost is server time, not payload.

### Fixed: the homepage LCP was one 4.5MB GIF, performance 75 → 88

Lighthouse's own network table named the culprit: 4,585KB from

```
/images/hero/slider/ios13-iphone-11pro-airpods-pro-setup-animation-steps.gif
```

served directly rather than through `/_next/image` like every other slide. That
is `next/image` behaving correctly, not a misconfiguration: resizing an animated
GIF would drop the animation, so it streams the original bytes through.

Converted to animated WebP with `sharp`, then authored at exactly 2x its rendered
size, because the optimizer will never resize it for us and the revslider layer
data renders this slide at 370x495 on desktop:

```
4.48MB GIF  ->  1.15MB WebP 800x1070  ->  776KB WebP 740x990
public/     8.9MB -> 5.1MB     (the GIF is deleted, not left for Vercel to ship)
frames      47 -> 47 -> 47     verified through /_next/image, byte-identical out
```

Measured across four production builds:

```
                 perf   a11y   LCP
baseline           75     88   5.8s
after a11y fixes   77     93   5.3s
hero as WebP       85     93   2.7s
hero at 2x size    88     93   2.4s
```

Every other performance metric already scores a perfect 1: FCP 0.3s, Speed Index
0.5s, TBT 0ms, CLS 0.003. LCP alone, at 0.51, is what caps the category at 88.

**The last 2 points cost a design decision, which is why they are not taken
here.** The LCP element *is* the 776KB animation, and it cannot shrink further
without dropping frames or visible quality. Reaching 90 means not making an
animation the first paint: render a static first frame as the LCP image and swap
the animation in after. That is a legitimate technique and it changes what the
homepage does in its first second, so it belongs to whoever owns the hero, not to
a release-readiness pass.

One latent bug fell out of this. `HeroSlideImage` chose `unoptimized` from
`src.endsWith('.gif')`, which silently went false the moment the GIF became a
WebP. Harmless in outcome, which is exactly why it would have stayed: animated
sources are listed explicitly now instead of inferred from an extension.

### Fixed in `6fdefe2`: accessibility 88 → 93

Three of the five failures had fixes that change no pixels, so they were not
competing with the compare harness and were simply outstanding. Re-measured on a
fresh production build:

```
accessibility   88 -> 93     PASS
performance     75 -> 77     still short (LCP 5.8s -> 5.3s)
home pixel diff 17.28% -> 17.33%   unchanged within shoot noise
```

- **`link-name`** fixed. An imageless product renders `ProductCard`'s image link
  with no children at all, so the `img` alt cannot name it. `aria-label` on the
  link survives a missing thumbnail.
- **`heading-order`** fixed. `CategoryStrip` used `h4` while the outline runs `h1`
  for hero slides and `h2` per product card. Every visual property on that
  element is set explicitly, so `h2` renders identically.
- **`errors-in-console`** cleared on this build.

The 0.05pp move in the pixel diff is the live slider being on a different slide
between shoots, not a regression: the dots' 24px hit areas are handed back as
negative margin, so nothing on the page shifted.

### The two that remain are decisions, not oversights

**`target-size` (3 nodes, was 4).** The buttons are now genuinely 24x24, and axe
still fails them for a different reason:

```
Target has insufficient size because it is partially obscured
(smallest space is 16px by 24px, should be at least 24px by 24px)
```

The visible dots are 8px with an 8px gap, a 16px pitch. Non-overlapping 24px
targets at a 16px pitch are geometrically impossible. Passing requires spreading
the dots out, which changes the visible layout and moves away from the live
reference. The hit area is still four times larger than before, which is a real
gain for touch even while the audit stays red. The active 30px bar now passes,
which is why the count dropped from 4 to 3.

**`color-contrast` (40 nodes).** See below. Same shape of conflict, higher stakes.

`bf-cache` also remains and is not worth chasing on a dev-adjacent build.

Original failure list, for reference:

- **`link-name` (1 node).** An anchor with no accessible name:
  `<a class="p_con__image-link" href="/product/reverse-withdrawal-payment">`.
  Note the slug. That is Dokan's hidden bookkeeping product, which is already in
  the local catalogue and rendering as a card on the homepage. The WXR dry run
  flagged the same row as the thing that must never be imported; it is already
  here.
- **`heading-order` (1 node).** An `<h4>` where the outline expects the next
  level down.
- **`target-size` (4 nodes).** Slider dots are 8x8px against a 24x24 minimum.
- **`errors-in-console` (1).** One 404 on a resource.
- **`color-contrast` (40 nodes).** All the same token: `#7e7e7e` at 13px.

That last one is a **conflict, not a bug**, and should not be "fixed" without a
decision. `#7e7e7e` is the grey measured off the live site. Darkening it to pass
WCAG AA moves the storefront further from the 1:1 reference the whole compare
harness exists to enforce, and the live site fails the same check. Accessibility
and pixel fidelity want opposite things here, and legal accessibility (5568) is
the stronger claim. It needs to be settled as a token change in
`src/styles/tokens.ts`, with the expected rise in the pixel diff accepted in
advance, rather than patched per component.

## Dependency audit

```
27 vulnerabilities: 14 high, 10 moderate, 3 low
next 16.2.4   vulnerable: >=16.0.0 <16.2.5   patched: >=16.2.5   latest: 16.2.12
```

Most of the highs are Next itself: four separate Middleware/Proxy bypasses in App
Router, SSRF in Server Actions and in rewrites, and two DoS paths. The
Middleware bypasses matter most here, because `/admin` and `/supplier` are
guarded in that layer.

`pnpm add next@16.2.12` is a patch inside 16.2.x with no expected breaking
changes, and it is the single highest-value fix on this page.

**It was deliberately not applied in this round.** Other sessions are running dev
servers out of this `node_modules`, and swapping the framework under a running
server breaks work in progress that has nothing to do with release readiness. It
should be the first thing done when no other session is mid-task, followed by
`npx vitest run` and one `compare.mjs --page=product`.

## What to do, in order

1. Put a valid `SUPABASE_SECRET_KEY` in `.env.local`. Unblocks 12 E2E tests and
   the checkout comparison, and is the only item nobody else can work around.
2. `pnpm add next@16.2.12` when no other session is running, then re-run Vitest.
3. Re-run `npx playwright test` and `compare.mjs --page=checkout`. Neither number
   in this report is final until then.
4. Investigate `products` at 25.75%, the widest unexplained gap, then `home` at
   17.28% and `search` at 14.87%. Check the harness first: it has now been wrong
   twice, in two different ways.
5. Decide the hero's first paint. Performance is 88 and the only metric short of
   perfect is LCP, which *is* the 776KB animation. 90+ needs a static first frame
   with the animation swapped in after.
6. Decide `#7e7e7e` explicitly: accessibility or pixel fidelity. Do not let it be
   decided by whoever edits a component next. `target-size` is the same shape of
   conflict and cannot pass at a 16px dot pitch.
7. Remove `reverse-withdrawal-payment` from the catalogue. It is a Dokan internal
   row, it renders on the homepage, and it is the row that exposed the
   `link-name` failure. Removing it needs a working service key, so it is item 1
   in disguise.

## How each number was produced

```bash
npx tsc --noEmit
npx vitest run
pnpm audit --prod
E2E_PORT=3001 npx playwright test --reporter=list

# compare, against the dev server already serving this directory
LOCAL_BASE=http://localhost:3001 node scripts/compare.mjs --page=home
LOCAL_BASE=http://localhost:3001 node scripts/compare.mjs --page=product \
  --mine="http://localhost:3001/product/$(node -e "process.stdout.write(encodeURIComponent('מוצר-לדוגמא'))")"
LOCAL_BASE=http://localhost:3001 node scripts/compare.mjs --page=category
LOCAL_BASE=http://localhost:3001 node scripts/compare.mjs --page=products
LOCAL_BASE=http://localhost:3001 node scripts/compare.mjs --page=search
LOCAL_BASE=http://localhost:3001 node scripts/compare.mjs --page=checkout

# Lighthouse, isolated worktree so the running dev server's .next is untouched
git worktree add --detach /tmp/ke-rc HEAD && cd /tmp/ke-rc
cp /Users/ofir/kenyonexpress-web/kenyonexpress/.env.local .
pnpm install --prefer-offline && npx next build && npx next start -p 3007
npx lighthouse http://localhost:3007/ --preset=desktop \
  --only-categories=performance,accessibility,best-practices,seo \
  --chrome-flags="--headless=new"
```

The product-page compare uses `--mine` explicitly. Without it the harness picks a
different product and the number is not a measurement.
