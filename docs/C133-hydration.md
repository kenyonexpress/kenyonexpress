# C133 hydration #418 fix (2026-11-02)

## Reproduction

Built this checkout (`pnpm build`, exit 0) and served it with `TZ=UTC pnpm start -p 3133` (TZ=UTC as on Vercel; :3000 is taken by another project). The console was captured with Playwright via `scripts/c133-console-capture.mjs` (console.error, pageerror and every >=400 response) in Asia/Jerusalem he-IL and America/New_York en-US.

### Live www (production deploy dpl_8XvS1vy3SfPPg9Cp3dW3weZqmBn3, CLI deploy 2026-10-30, not on closeout/v1-final), before

```
$ node c133-console-capture.mjs https://www.kenyonexpress.co.il / "/product/ארוחת-בוקר-זוגית-בקפה-קפה"
== / [Asia/Jerusalem] errors=3
  pageerror: Minified React error #418; visit https://react.dev/errors/418?args[]=HTML&args[]= for the full message or use the non-minified dev environment for full errors and additional helpful warnings.
  resp 429 https://www.kenyonexpress.co.il/monitoring?o=4511944582496256&p=4511946778607696&r=de
  console.error: Failed to load resource: the server responded with a status of 429 ()
== / [America/New_York] errors=3
  pageerror: Minified React error #418; visit https://react.dev/errors/418?args[]=HTML&args[]= for the full message or use the non-minified dev environment for full errors and additional helpful warnings.
  resp 429 https://www.kenyonexpress.co.il/monitoring?o=4511944582496256&p=4511946778607696&r=de
  console.error: Failed to load resource: the server responded with a status of 429 ()
== /product/ארוחת-בוקר-זוגית-בקפה-קפה [Asia/Jerusalem] errors=0
== /product/ארוחת-בוקר-זוגית-בקפה-קפה [America/New_York] errors=0
TOTAL_ERRORS=6
```
(The 429 is the Sentry tunnel rate limit, not page code.)

### Local pnpm start, before

```
== / [Asia/Jerusalem] errors=2
  resp 400 https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/b/turnstile/f/av0/rch/wz9xd/0x4AAAAAAADJwwDXxZytuALF/light/fbE/new/normal?lang=he&offlabel_show_privacy=true&offlabel_show_help=true
  console.error: Failed to load resource: the server responded with a status of 400 ()
== / [America/New_York] errors=2
  resp 400 https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/b/turnstile/f/av0/rch/85v1y/0x4AAAAAAADJwwDXxZytuALF/light/fbE/new/normal?lang=he&offlabel_show_privacy=true&offlabel_show_help=true
  console.error: Failed to load resource: the server responded with a status of 400 ()
== /product/ארוחת-בוקר-זוגית-בקפה-קפה [Asia/Jerusalem] errors=0
== /product/ארוחת-בוקר-זוגית-בקפה-קפה [America/New_York] errors=0
TOTAL_ERRORS=4
```

## Locating the mismatch

Candidates checked: Date, locale, random, window. Faking the client clock in Playwright at +0, +3h, +1d, +3d and +5d across Asia/Jerusalem, UTC and America/Los_Angeles (`scripts/c133-clock-shift.mjs`) gave no React error locally, so no Date or locale text drifts between a cached shell and a later hydration.

On live, the element skeleton of the server HTML (JS off) vs the hydrated DOM (`scripts/c133-dom-skeleton.mjs`) showed the client inserting a wrapper the server HTML does not have:

```
<   div [hidden]
<   div.hidden.md:block
---
>   div.relative.w-full
>    div [hidden]
>    div.hidden.md:block
```
Its ancestor chain on live:
```
<div data-pull-to-refresh="true" class="relative w-full">
<main id="main-content" tabindex="-1" class="w-full focus:outline-none pb-14 md:pb-0">
```

That wrapper comes from `src/components/store/MobileContentWrapper.tsx`, mounted in `src/app/(store)/layout.tsx` inside `<Suspense fallback={children}>`. It branched on `usePathname()`: on `/` or `/category*` it returned `<PullToRefresh>` (the wrapper div), otherwise the bare children. The server and client therefore produced **different element trees** whenever they disagreed on the path or on fallback vs content. The fallback is exactly the bare-children tree, and the HTML Vercel serves from cache (`x-vercel-cache: HIT`, `age: 2050`) carried it. On `/` the client added the div, which is #418 with args `HTML`. `/product/<slug>` was clean because both branches return bare children there. The same branch also remounted the whole page on every client navigation to or from `/`.

None of the forbidden files (Hero/Header/TopBar/root layout.tsx) is involved.

## Fix

1. `MobileContentWrapper` always renders `<PullToRefresh>` with no `usePathname()`. The home/category check moved into `PullToRefresh`'s touchstart (`enabled(window.location.pathname)`), so the element tree is the same on every path, on server and client.
2. The `PullToRefresh` wrapper is `display: contents` (`className="contents"`, previously `relative w-full`), so wrapping every store page adds no box and changes no layout. I checked that nothing on `/` or the product page used the wrapper as its `offsetParent` (0 elements at 380 and 1440).
3. `src/app/(store)/layout.tsx` (the store group layout, not the locked root `src/app/layout.tsx`): removed `<Suspense fallback={children}>` around the wrapper. Without `usePathname()` nothing there suspends, and its fallback was the mismatching tree. The build still passes (exit 0).
4. The Turnstile 400 on `/`: the footer `NewsletterSignup` loaded Cloudflare Turnstile on page load, and the production site key rejects non-listed hosts. Turnstile now mounts on the first focus or press inside the form, so there is no third-party iframe on load. In `TurnstileWidget`, I removed the onSuccess/onError handlers that appended the token to `document.querySelector('form')` (the first form in the document, which on `/` is not the newsletter form). The widget already writes `cf-turnstile-response` inside its own container.

Tests: `src/components/store/MobileContentWrapper.test.tsx` (new: same tree on `/`, `/product/x`, `/category/y`; no pull off home/category; pull indicator on `/`), a `NewsletterSignup` test for the deferred Turnstile mount, and `PullToRefresh` class assertion updated.

## Gate, after (rebuilt, `TZ=UTC pnpm start -p 3133`)

```
$ node scripts/c133-console-capture.mjs http://localhost:3133 / "/product/ארוחת-בוקר-זוגית-בקפה-קפה"
== / [Asia/Jerusalem] errors=0
== / [America/New_York] errors=0
== /product/ארוחת-בוקר-זוגית-בקפה-קפה [Asia/Jerusalem] errors=0
== /product/ארוחת-בוקר-זוגית-בקפה-קפה [America/New_York] errors=0
TOTAL_ERRORS=0
```
Unfiltered clock-shift sweep (5 offsets x 3 timezones x 2 pages, every console.error and pageerror counted):
```
$ node scripts/c133-clock-shift.mjs http://localhost:3133 / "/product/ארוחת-בוקר-זוגית-בקפה-קפה"
TOTAL_ERRORS=0
```
Server HTML vs hydrated DOM under `<main>` (local, after): identical
```
< 196: main#main-content.w-full.focus:outline-none.pb-14
< 197:  div.contents
< 198:   div [hidden]
< 199:   div.hidden.md:block
---
> 199: main#main-content.w-full.focus:outline-none.pb-14
> 200:  div.contents
> 201:   div [hidden]
> 202:   div.hidden.md:block
```
(Only the line numbers differ, from the header above `<main>`.)

Typecheck and unit tests:
```
$ npx tsc --noEmit -p .   -> exit 0
$ npx vitest run src/components/store/MobileContentWrapper.test.tsx src/components/mobile/PullToRefresh.test.tsx
      Tests  9 passed (9)
$ npx vitest run src/components/growth/NewsletterSignup.test.tsx src/components/shared/TurnstileWidget.test.tsx
      Tests  20 passed (20)
$ npx vitest run src/components/mobile src/components/store
      Tests  104 passed (104)   (16 unhandled `cookies` outside request scope errors: identical on the pre-change baseline)
```

Visual check (no regression from the `contents` wrapper), home at 380:
```
$ LOCAL_BASE=http://localhost:3133 node scripts/compare.mjs --page=home --widths=380 --live-url=http://localhost:3133
OVERALL first 2600px: 46.25%
```
This matches C130's 46.26% at 380 before this change. The gap to <11 is the locked header/topbar/hero bands (see M01-c347). At 768/1440 compare.mjs refused to score because 4 local images were still pending at capture.

## Note

Live www keeps throwing #418 until a deploy that contains this commit goes out; production is still the 2026-10-30 CLI deploy.
