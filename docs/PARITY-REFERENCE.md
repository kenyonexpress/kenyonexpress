# The parity gate has no reference

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
