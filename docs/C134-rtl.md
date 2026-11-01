# C134 — RTL leak fix on / and /product

Source doc `docs/M17-c346.md` does not exist (M17-c346 never ran; latest M17 runs are c317/c292 in claude/STATE.md). The M17 check was therefore re-implemented as two reproducible scripts and run before and after the fix:

- `node scripts/c134-rtl-check.mjs`: static import graph of `src/app/(store)/page.tsx`, `(store)/layout.tsx` and `(store)/product/[slug]/page.tsx` (201 files). It flags physical ml/mr/pl/pr, left-/right-, text-left/right, border-l/r, rounded-l/r, float, CSS margin/padding/border-left/right, left:/right:, text-align:left/right, and any `dir="ltr"` that shows Hebrew. `dir="ltr"` on Latin email/phone/SKU fields is required by `src/app/latin-field-direction.test.ts`, so it is listed as an isolate, not a leak.
- `BASE=... PRODUCT=... node scripts/c134-rtl-live.mjs`: runs Playwright against a prod build (`next start` :3134) at 380/768/1440 and checks html lang/dir, Hebrew text with computed direction ltr, Hebrew text-align left, Hebrew placeholder rendered LTR, typed Latin value still LTR, and horizontal overflow.

## Fixes (logical properties)

| File | Before | After |
| --- | --- | --- |
| src/components/mobile/MobileNavBar.tsx:27 | `left-0 right-0` | `start-0 end-0` |
| src/components/mobile/StickyCartBar.tsx:35 | `left-0 right-0` | `start-0 end-0` |
| src/server/actions/newsletter.ts:114 | `text-align:right` | `text-align:start` (div is dir=rtl) |
| src/components/layout/SiteFooter.tsx:187 | Hebrew placeholder "הזן כתובת Email" rendered LTR (flush left, "Email" on wrong end) | `placeholder-shown:[direction:rtl]`: the box is RTL while empty and LTR once typed; `dir="ltr"` kept for the latin-field test |

First attempt `placeholder:[direction:rtl]` was measured live and failed: Chrome ignores `direction` on `::placeholder` (computed stayed ltr), so it was replaced.

No forbidden or locked files were touched.

## Static check BEFORE (fixes stashed)

```
files in / + /product render graph: 201
physical-direction hits (unlocked): 6
physical-direction hits (locked, not editable): 0
dir="ltr" Latin isolates (email/phone/SKU, required by latin-field-direction.test.ts): 3
  ok src/components/growth/NewsletterSignup.tsx:69
  ok src/components/storefront/ProductInfo.tsx:269
  ok src/components/storefront/SupplierInfo.tsx:139
LEAK src/components/mobile/MobileNavBar.tsx:27 left-0 [physical inset] :: className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-border flex justify-around items-center h-14 z-40"
LEAK src/components/mobile/MobileNavBar.tsx:27 right-0 [physical inset] :: className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-border flex justify-around items-center h-14 z-40"
LEAK src/components/mobile/StickyCartBar.tsx:35 left-0 [physical inset] :: className="md:hidden fixed bottom-14 left-0 right-0 bg-white border-t border-border p-3 flex items-center justify-between gap-2 z-30"
LEAK src/components/mobile/StickyCartBar.tsx:35 right-0 [physical inset] :: className="md:hidden fixed bottom-14 left-0 right-0 bg-white border-t border-border p-3 flex items-center justify-between gap-2 z-30"
LEAK src/server/actions/newsletter.ts:114 text-align:right [physical CSS text-align] :: html: `<div dir="rtl" style="font-family:Heebo,Arial,Helvetica,sans-serif;text-align:right">
LEAK src/components/layout/SiteFooter.tsx:181 dir="ltr" [Hebrew placeholder inside dir=ltr] :: dir="ltr"
```

## Static check AFTER

```
$ node scripts/c134-rtl-check.mjs; echo exit=$?
files in / + /product render graph: 201
physical-direction hits (unlocked): 0
physical-direction hits (locked, not editable): 0
dir="ltr" Latin isolates (email/phone/SKU, required by latin-field-direction.test.ts): 4
  ok src/components/growth/NewsletterSignup.tsx:69
  ok src/components/layout/SiteFooter.tsx:184
  ok src/components/storefront/ProductInfo.tsx:269
  ok src/components/storefront/SupplierInfo.tsx:139
exit=0
```

## Live check BEFORE footer fix (prod build, first run)

```
/ @380 status=200 lang=he dir=rtl overflow=0px ltrHebrew=0 alignLeftHebrew=0 ltrPlaceholder=1 leaks=1
   LEAK input placeholder "הזן כתובת Email"
/ @768 status=200 lang=he dir=rtl overflow=0px ltrHebrew=0 alignLeftHebrew=0 ltrPlaceholder=1 leaks=1
   LEAK input placeholder "הזן כתובת Email"
/ @1440 status=200 lang=he dir=rtl overflow=0px ltrHebrew=0 alignLeftHebrew=0 ltrPlaceholder=1 leaks=1
   LEAK input placeholder "הזן כתובת Email"
/product/ארוחת-בוקר-זוגית-בקפה-קפה @380 status=200 lang=he dir=rtl overflow=0px ltrHebrew=0 alignLeftHebrew=0 ltrPlaceholder=1 leaks=1
   LEAK input placeholder "הזן כתובת Email"
/product/ארוחת-בוקר-זוגית-בקפה-קפה @768 status=200 lang=he dir=rtl overflow=0px ltrHebrew=0 alignLeftHebrew=0 ltrPlaceholder=1 leaks=1
   LEAK input placeholder "הזן כתובת Email"
/product/ארוחת-בוקר-זוגית-בקפה-קפה @1440 status=200 lang=he dir=rtl overflow=0px ltrHebrew=0 alignLeftHebrew=0 ltrPlaceholder=1 leaks=1
   LEAK input placeholder "הזן כתובת Email"
TOTAL LIVE LTR LEAKS: 6
```

## Live check AFTER (pnpm build exit 0, next start :3134)

```
$ BASE=http://localhost:3134 PRODUCT="/product/ארוחת-בוקר-זוגית-בקפה-קפה" node scripts/c134-rtl-live.mjs; echo LIVE_EXIT=$?
   typed הזן כתובת Email -> typed direction ltr
/ @380 status=200 lang=he dir=rtl overflow=0px ltrHebrew=0 alignLeftHebrew=0 ltrPlaceholder=0 leaks=0
   typed הזן כתובת Email -> typed direction ltr
/ @768 status=200 lang=he dir=rtl overflow=0px ltrHebrew=0 alignLeftHebrew=0 ltrPlaceholder=0 leaks=0
   typed הזן כתובת Email -> typed direction ltr
/ @1440 status=200 lang=he dir=rtl overflow=0px ltrHebrew=0 alignLeftHebrew=0 ltrPlaceholder=0 leaks=0
   typed הזן כתובת Email -> typed direction ltr
/product/ארוחת-בוקר-זוגית-בקפה-קפה @380 status=200 lang=he dir=rtl overflow=0px ltrHebrew=0 alignLeftHebrew=0 ltrPlaceholder=0 leaks=0
   typed הזן כתובת Email -> typed direction ltr
/product/ארוחת-בוקר-זוגית-בקפה-קפה @768 status=200 lang=he dir=rtl overflow=0px ltrHebrew=0 alignLeftHebrew=0 ltrPlaceholder=0 leaks=0
   typed הזן כתובת Email -> typed direction ltr
/product/ארוחת-בוקר-זוגית-בקפה-קפה @1440 status=200 lang=he dir=rtl overflow=0px ltrHebrew=0 alignLeftHebrew=0 ltrPlaceholder=0 leaks=0
TOTAL LIVE LTR LEAKS: 0
LIVE_EXIT=0
```

## Tests

```
$ npx vitest run src/components/mobile src/app/latin-field-direction.test.ts src/server/actions
 Test Files  38 passed (38)
      Tests  400 passed (400)
```

## compare.mjs (site-wide parity gate, recorded for completeness)

```
=== compare --page=home ===
live: 1440x4957  mine: 1440x8537
OVERALL first 2600px: 27.97%
  of which: reference blank 12.29%  ours blank 8.1%  both painted 7.58%
!! HEIGHT RATIO 1.72x — the percentage above is NOT a pixel gate.
=== compare --page=product ===
  ours     : 1 failed to load (1 fetch)
live: 1440x7653  mine: 1440x2600
OVERALL first 2600px: 19.25%
  of which: reference blank 11.28%  ours blank 5.65%  both painted 2.33%
!! HEIGHT RATIO 0.34x — the percentage above is NOT a pixel gate.
!!   2. the local page failed to load its data and rendered a fallback
```

The home 1440 score of 27.97% is identical to C130/C122 (27.97). The parity gate was already failing before C134, from locked header/topbar/hero bands and local data fallback (C122/C130/M01-c347 BLOCKED). The C134 edits cannot move it: both bars are `md:hidden`, and the footer placeholder keeps the same glyphs.

RESULT: DONE
