# The parity reference is Electro v7, frozen

**Decided 2026-10-13 (KEN-8), by the project owner.** Everything under
"History" below is the record of how the gate lost its reference on 2026-09-09
and is kept unchanged. It ends by saying the choice is the owner's call. This
section is that call, and what was measured when it was made.

## The decision

The reference for the home page is the Electro template's `home-v7` demo,
captured as PNG at the three gate widths:

```
$ node scripts/capture-electro-baseline.mjs
electro_v7_380.png   380x8792  118 images (0 broken)
electro_v7_768.png   768x5273  118 images (0 broken)
electro_v7_1440.png  1440x4957 118 images (0 broken)
```

A bare run now uses it, so the command quoted in `CLAUDE.md` produces a number
again instead of a `REFUSED` row:

```
$ LOCAL_BASE=http://localhost:3311 node scripts/compare.mjs --page=home --widths=380,768,1440
```

The defaults live in `scripts/parity-baseline.mjs`: home reads
`refs/electro_v7_{width}.png`, product reads `refs/electro_product_{width}.png`,
category and products read `refs/electro_shop_{width}.png`. `--baseline=` and
`--live-png=` still override, and `--live=<url>` still navigates. **cart and
checkout have no default and still refuse**: no capture of Electro's cart or
checkout with a line in it exists.

## Why Electro v7 and not the live site

1. **The live site is this build.** `kenyonexpress.co.il` has served our Vercel
   deployment since the cutover. A capture of it taken today scores our build
   against itself, and a page compared with itself scores near zero. Nobody
   investigates a pass.
2. **The old site cannot be captured again.** The WooCommerce site is gone, the
   saved HTML does not render, and the Wayback Machine lost 31 of 54 images.
   All three are measured under History.
3. **It matches the sourcing rule that already exists.** Electro gives shape,
   the live site gave content (`docs/SOURCING-RULES.md`). The gate scores
   shape: geometry, colour, type and spacing.
4. **It can be regenerated.** `refs/ke_live_*.png` (2026-08-12) are the only
   copies of a page that no longer exists, on one laptop, in an ignored
   directory. The Electro demo is public, and one command re-creates the
   baseline on a fresh checkout.

## What the capture script does, and why it is not capture-electro.mjs

`scripts/capture-electro.mjs` loads once at 1440 and resizes the same document
down, and it never scrolls. For a file the gate scores against, each width in
`capture-electro-baseline.mjs` is its own page load, scrolled end to end so
lazy images are requested. Two defects were found by looking at the first
captures, and both are fixed in the script:

- **The hero caption was frozen before it arrived.** Zeroing animations reset
  the slide text to its pre-entrance position. Carousels are paused, the slide
  gets 2.5s to settle, and only then is the page frozen.
- **The demo's own widgets were painted over content.** A Dark/Light switcher
  and a back-to-top button float over the page. Fixed or sticky elements under
  12000px² are hidden; the header is far larger and is untouched.

Nothing is written unless all three widths clear the Cloudflare challenge and
are over 2000px tall. `refs/electro_v7.json` records the URL, the time, the
dimensions and a SHA-256 per file.

**The PNGs are not committed**, per `docs/REFS-POLICY.md`. The consequence is
real: the baseline is frozen on a machine, not in history. If the demo changes
upstream, a re-capture changes the reference, and the hashes in the manifest
are how that is noticed. The capture this decision was measured against:

| file | size | sha256 |
|---|---|---|
| `electro_v7_380.png` | 380x8792 | `9128bda3ab1e94f1c4e6239a02d075e7a189dc7cb051edd1c512042d90605205` |
| `electro_v7_768.png` | 768x5273 | `e60e70898eeb590ac3373a70719fcda5b4532d655adfab21463e8a82f37d6209` |
| `electro_v7_1440.png` | 1440x4957 | `76548ba70126fea44e9d2268b2c9f690e4b1a818c0a4e425cddb4e3ae24ab6f6` |

## First measurement, and what it does not show

Fresh `pnpm build` on Next 16.3.8, `pnpm start` on 3311, 2026-10-13:

| width | graded (both painted) | overall | reference blank | ours blank | our height / reference |
|---|---|---|---|---|---|
| 380 | **10.93%** PASS | 41.49% | 15.93% | 14.63% | 18377 / 8792 (**2.09x**) |
| 768 | **10.61%** PASS | 39.53% | 17.38% | 11.54% | 9136 / 5273 (**1.73x**) |
| 1440 | **7.81%** PASS | 28.93% | 13.04% | 8.08% | 5502 / 4957 (1.11x) |

All three pass the 11% gate. **That pass is narrower than it reads**, for three
reasons that are properties of the gate rather than of this change:

1. **The graded number is "both painted", not the total.** Since 2026-09-22 the
   gate grades only pixels where both pages paint and disagree. Against the old
   site that excluded a missing photo. Against an English template with other
   products, most of the difference is content, so most of the difference is
   excluded: 29% to 41% of the compared pixels differ in total.
2. **Only the first 2600px are compared.** Our page is 18377px tall at 380.
3. **At 380 and 768 the two pages are not the same length.** The gate itself
   prints `HEIGHT RATIO 2.09x -- the percentage above is NOT a pixel gate` and
   still writes PASS. Our home is twice the template's height at phone width.

380 passes with 0.07 points of room. The numbers answer "do the first screens
share a structure". They do not show that the page matches the template, and
the height ratio at 380 and 768 is the first thing to look at.

---

# History: the parity gate has no reference

Measured 2026-09-09. Everything below was read off the network, the filesystem or a
browser, not inferred.

## What is true today

`scripts/compare.mjs` scores our build against the site it was rebuilt from, and every
`LIVE_*` constant in it names a URL on `kenyonexpress.co.il`. That host is no longer the
old site. DNS was cut over to Vercel and the domain serves **this project's own build**.

```
$ curl -sL https://kenyonexpress.co.il/cart/        # -> www.kenyonexpress.co.il/cart, 200
woocommerce markers  0
_next references     125
<title>              סל הקניות | קניון אקספרס        # ours
```

So the gate that `CLAUDE.md` makes mandatory for every visual step -- *"כל שלב חזותי נמדד
ב-380, 768 ו-1440 וחייב להיות מתחת ל-11%"* -- was in a position to photograph our build
twice and report the difference as fidelity.

**That is worse than any of the failures compare.mjs already refuses,** and the reason is
the direction of the error. A 404, two different catalogues, a carousel caught mid-spin:
all of those score too HIGH, and a high number gets investigated. A page compared with
itself scores near zero. Nobody investigates a pass.

## What the gate does about it now

`scripts/live-reference.mjs` classifies the left-hand side before anything is scored, and
`compare.mjs` refuses when the answer is not the WooCommerce site:

```
$ node scripts/compare.mjs --page=home --width=380
REFUSING to measure: https://kenyonexpress.co.il/ is not the reference.
  It is this project's own build (27 /_next/ asset reference(s) and a Next runtime
  element, and no wp-content stylesheet or script at all).
$ echo $?
5
```

- Exit code **5**, distinct from the content refusals (3) and the moving hero (4).
- A row is appended to `docs/UI-PARITY-REPORT.md` reading `n/a` / `REFUSED` with the
  reason. A refusal is evidence: a gap in that table is indistinguishable from nobody
  having run the gate, which is exactly the wrong reading when the cause is that the
  reference is gone.
- For `--page=cart` and `--page=checkout` the check runs **before** the cart seeding, so a
  dead reference no longer costs two seedings and an add-to-cart GET against what is now
  our own production site.

The markers are stylesheets and scripts, never images. Our catalogue still serves product
photos from the old WordPress media paths, so `img[src*="wp-content"]` is present on OUR
pages; a classifier that counted those would call our build the reference and wave the
mirror through.

Probing the domain does not always reach a page at all: one run classified it `our-build`
off 27 `_next` references, a later run found neither marker set and was refused as
`unknown`. The custom domain answers a busy client with a challenge page. Both outcomes
refuse, which is the point.

## Why `refs/ke_live_*.html` is not a drop-in replacement

The saved captures are real WooCommerce pages -- `refs/ke_live_home.html` (2026-08-12)
carries 40 woocommerce references, `generator "WordPress 6.8.1"`, and zero `_next` -- and
the identity guard accepts them. **They still do not render.**

Loaded at 380px from `file://`, `refs/ke_live_home.html`:

| measurement | value |
|---|---|
| failed subresource requests | **143** |
| shape of the failures | `file://kenyonexpress.co.il/wp-content/...` |
| `<link rel=stylesheet>` elements | 1, and it answers **403** |
| inline `<style>` blocks | 16 |
| absolute `https://kenyonexpress.co.il` URLs in the file | 846 |

Two separate reasons, and both are fatal:

1. **The capture saved its URLs protocol-relative.** Under `file:`, `//host/path` resolves
   to `file://host/path` -- a *host* named kenyonexpress.co.il -- so every image, script
   and font fails instantly, offline or not.
2. **The absolute ones point at a host that no longer holds them.** The one real
   stylesheet answers 403.

The page therefore paints from its 16 inline `<style>` blocks with no images at all. It is
not a picture of the old site; it is a picture of the old site's text.

**An inference about this cannot be trusted, which is why the code does not make one.** A
first version of the guard asked `document.styleSheets` whether the sheets had loaded and
declared this archive *fine*: Chromium keeps the failed sheet in that collection. The
check was deleted rather than tuned. The existing "unloaded images" refusal does not cover
it either -- it tests `!img.complete`, and an image that 404s is `complete === true` with
`naturalWidth === 0`.

`refs/ke_live_singlefile.html`, which the header of `compare.mjs` still offers as the
`--live=` escape hatch, **does not exist**: not in the working tree, not anywhere under
`$HOME`, and not in the two most recent Desktop backups. `refs/` is gitignored
(`.gitignore:57`, and `docs/REFS-POLICY.md` explains why), so the captures that do exist
live only on the machine that took them.

## What would make the gate measurable again

Nothing here is free, and the choice is a real one rather than a formality.

1. **A self-contained capture of the old site.** This is what `refs/ke_live_singlefile.html`
   was, and `scripts/capture-live-singlefile.mjs` is the tool that made it -- pointed at
   `kenyonexpress.co.il`, which no longer serves that site. The tool cannot regenerate its
   own input.
2. **A third-party archive. Investigated on 2026-09-09, and it does not work. Do not
   re-run this.** The Wayback Machine does hold the WooCommerce site, and on paper it is
   the obvious answer: a snapshot serves its own rewritten assets, so unlike our local
   captures it renders. What it cannot serve is the images.

   The last capture of the home page before the cutover is `20260612042909`. Rendered at
   1440 through the no-banner modifier:

   ```
   http://web.archive.org/web/20260612042909if_/https://kenyonexpress.co.il/
   ```

   | measurement | value |
   |---|---|
   | title | קניון אקספרס |
   | document height | **5492px** |
   | wp-content stylesheets and scripts | 16, so the identity guard accepts it |
   | Wayback toolbar with `if_` | absent |
   | images | 54 |
   | broken **and rendered** | **31** |
   | failed subresource requests | 132 |
   | time to `domcontentloaded` | 110s, and 150s+ on a later run |

   The height is the encouraging part and it is not a coincidence: 5492px is exactly what
   the live home page measured on 2026-08-19, in the run recorded in `compare.mjs`'s own
   comments. It is the right page.

   The images are the disqualifying part, and the cause is specific. **The archived HTML
   contains zero `<img>` tags** (3 mentions of `uploads` in the whole file): the home page
   builds its images at runtime, and the site's optimizer then rewrites each `src` to an
   `.avif` variant that the crawler never requested and therefore never stored. Blocking
   `*.avif` does not recover them, measured: the plugin assigns `img.src` directly rather
   than offering a `<picture>` fallback, so 30 of the 31 stay broken.

   The originals are in the archive under their own extensions (`m2.avif` is absent,
   `m2.jpeg` is there from `20250703001730`), so a mirror could in principle guess an
   extension per image. That is 31 guesses against an archive that takes over two minutes
   per page load, and what it produces is an image set assembled by guesswork rather than
   the page as it was. It is not a reference.
3. **Change what the gate means.** Freeze our current build as the baseline and gate future
   changes against drift from it. This is a regression gate, not a fidelity gate: it can
   never again answer *"does this look like the site we are replacing"*, and the 11%
   ceiling stops meaning what it has meant in every row of `docs/UI-PARITY-REPORT.md` so
   far. It is the only option that does not depend on recovering something.

With route 1 impossible (the tool cannot regenerate its own input) and route 2 measured and
rejected, **route 3 is the only one left**, and it is not a technical decision. It changes
what the mandated gate in `CLAUDE.md` measures, from *"does this look like the site we are
replacing"* to *"has this changed since we froze it"*. That is the project owner's call, not
a refactor, and it is why this document stops here rather than implementing it.

Until it is made, **a step whose exit criterion is "compare.mjs < 11%" cannot be satisfied**,
and the honest record of an attempt is a `REFUSED` row rather than a number.
