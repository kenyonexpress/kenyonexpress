# Release readiness, 2026-07-30

Every number here was measured on `phase5/homepage` at `d576017`. Nothing is
estimated, and a gate that could not be measured says so instead of carrying a
plausible number.

**Verdict: NOT READY.** Two gates pass outright, two pass on some pages and fail
on others, and two are blocked by one missing credential.

| Gate | Target | Result | |
| --- | --- | --- | --- |
| `npx tsc --noEmit` | clean | 0 errors | PASS |
| Vitest | all pass | 56 files, 735 tests, 11.5s | PASS |
| Production build | succeeds | compiled in 6.2s | PASS |
| Playwright E2E | all pass | 41 passed, **12 failed** | BLOCKED |
| `compare.mjs` all pages | < 11% | 2 of 5 under, 1 unmeasurable | FAIL |
| Lighthouse | 90+ | product 96/96, **home 75/88** | FAIL |
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
category      7.35%   PASS
product      10.21%   PASS
search       14.87%   FAIL
home         17.28%   FAIL
products     25.75%   FAIL
checkout        n/a   REFUSED to measure
```

`--page=checkout` refuses on purpose: an empty cart is redirected to `/cart` on
both sides, and two pictures of a cart score as an excellent checkout. It exits
rather than print a number. That guard is correct and is the reason there is no
figure here.

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

The lesson generalises to the three pages still failing: measure the harness
before believing the number. `products` at 25.75% is the widest gap and has never
been investigated.

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

Accessibility failures on the homepage, in order of how cheap they are to fix:

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
5. Homepage LCP 5.8s. CLS and TBT are already excellent, so this is one late,
   large paint, not general slowness.
6. Fix `link-name`, `heading-order`, `target-size` and the console 404. Four
   contained fixes worth roughly the gap between 88 and 90+.
7. Decide `#7e7e7e` explicitly: accessibility or pixel fidelity. Do not let it be
   decided by whoever edits a component next.
8. Remove `reverse-withdrawal-payment` from the catalogue. It is a Dokan internal
   row, it is on the homepage, and it is one of the two accessibility failures.

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
