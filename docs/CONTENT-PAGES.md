# Content pages

The text of the site's information pages, editable in the admin panel without a
deploy. Section 58 of `~/ke-goals/SECTIONS.md`.

## What exists

| Page | Address | Body kind | Owned by the CMS |
| --- | --- | --- | --- |
| `about` | `/about` | prose | the whole body |
| `faq` | `/faq` | faq | the whole body |
| `contact` | `/contact` | prose | the introduction |
| `supplier-signup` | `/suppliers` | prose | the introduction |
| `how-it-works` | `/page/how-it-works` | prose | the whole body |

Console: `/admin/pages`, admin and super_admin only.

## The five decisions, and why each one

### 1. The body is parsed, not sanitised

A CMS normally stores HTML and renders it with `dangerouslySetInnerHTML`.
`scripts/raw-html-gate.mjs` fails the build for exactly that, and its message is
the argument: catalogue copy is authored in the admin panel, so interpolating it
into `__html` is stored XSS reachable from a form.

`src/lib/content/markup.ts` is a parser instead. It produces four block kinds
and three inline kinds and nothing else, and `RichText.tsx` renders them as
React children. `<script>alert(1)</script>` in a body is five literal characters
that React escapes on the way out - not a hole a sanitiser happened to close.
`RichText.test.tsx` asserts that on the rendered output rather than on the
source, so a refactor that reintroduced an `__html` path fails even if it
satisfied the gate's allowlist.

The supported syntax, which is what the editor's help text says:

```
## כותרת משנה        ### כותרת קטנה
**מודגש**            [טקסט](/קישור)
- רשימה              1. רשימה ממוספרת
> ציטוט
```

A link href must be a site-relative path, `https:`, `mailto:` or `tel:`. That is
an allowlist, not a denylist of `javascript:` - the denylist form has to
enumerate every spelling and is wrong the first time one is forgotten. A refused
link renders as its label in plain text, so a mistake costs a link and never a
sentence.

Deliberately absent: images (a URL, a size and an alt text is a form, and a body
that can reference remote images can beacon a reader's IP), tables (they do not
survive 380px, which every visual stage here is measured at), raw HTML, `#`
level-one headings (the page title is the only `<h1>`), and nested lists.

Anything unrecognised is literal text. There is no parse error and no rejected
save: a markup language that refuses the document is one that loses the
document, and the person typing has no way to tell which of fifty lines
offended it.

### 2. The FAQ is not prose

`/faq` derives its `FAQPage` JSON-LD from the same array it renders, and it has
done since before the CMS existed. Google penalises structured data that does
not match the visible page, and the only way to guarantee they match is to build
both from one array.

So `content_pages.body_kind` is `prose` or `faq`, and the FAQ is stored as
question/answer pairs. Storing it as markup would have meant reconstructing the
pairs by guessing which headings are questions - wrong the first time an
operator writes a heading that is not one, and invisible when it happens: the
page still looks right and the rich result quietly stops being served.

The editor still shows one text box. `src/lib/content/faq-text.ts` converts
between the pairs and a block where `## ` starts a question and the lines under
it are the answer - the same `## ` the prose editor uses, so an operator who has
written one page has learned this one. The round trip is asserted against the
twelve entries actually on the site.

### 3. Four pages keep their address; one gets `/page/<slug>`

`/about`, `/faq`, `/contact` and `/suppliers` are in the sitemap, carry
canonicals, are linked from the footer, and two are indexed from the old
WordPress site. Serving the same words at `/page/about` as well would be
duplicate content competing with itself, and moving them would throw away
whatever ranking they have.

`content_pages.bound_route` records the address a page renders at when it
already has one; NULL means `/page/<slug>`. `contentPageHref()` is the only
function that decides, which is what keeps the sitemap, the admin's view link
and the canonical from disagreeing. `/page/[slug]` returns 404 for a page with a
bound route, so publishing one through the CMS cannot create a second address
for it.

**`bound_route` is not writable from any form.** Binding is what a route file
does by reading a fixed slug; the column only records it. If an operator could
type it they could point a page at `/checkout`, and the sitemap would publish a
URL that renders something else entirely.

### 4. A bound page owns a slot, not the whole page

`/about` is prose from top to bottom, so the page is the body. `/contact` has a
form, a WhatsApp link built from `lib/whatsapp` and an inbox address;
`/suppliers` has a numbered process, three fact cards and a lead form whose
every sentence is a claim about what migration 051 enforces.

Making those editable as text would mean either deleting the design or inventing
a block language rich enough to rebuild it, which is how a CMS ends up letting
an operator break a page from a text box. Those two pages expose their
introduction and nothing else. The WhatsApp number in particular stays derived:
[68] already fixed a page whose link dialled a different number than the one it
printed, and the fix was to derive both from one function.

### 5. The built-in text is the floor, and 205 seeds nothing

`migrations/pending/205_content_pages.sql` is written and **not applied**, like
everything else in that directory. A CMS whose pages are blank until a migration
lands would take four pages off the site the moment it merged.

So every page has a built-in version in `BUILT_IN_PAGES`
(`src/lib/content/pages.ts`), assembled from the same typed modules that
rendered these pages before - `src/content/about.ts`,
`src/content/legal/faq.ts`, `src/content/how-it-works.ts`. The database is an
override: a published row wins, and anything else (no table, no row, a draft, an
unreachable database) leaves the built-in text on screen.

The migration therefore inserts no rows. Seeding it would be a second copy of
every paragraph in a file applied once and never read again, and the copy that
drifts would be the one on screen. A row is created the first time an operator
saves that page, from the values the editor was showing.

**Applying 205 changes nothing a visitor sees.** It creates two empty tables and
three functions.

## The schema

`content_pages` and `content_page_revisions`, plus three `SECURITY DEFINER`
functions granted to nobody but the service role.

**Every write goes through a function, not PostgREST.** A page update and its
revision row have to be one transaction, and the revision number has to be
allocated under a row lock - `max(revision) + 1` from the client is a
read-then-write that two overlapping saves both lose, and one operator would get
a unique violation instead of a saved page.

- `save_content_page(...)` - upsert by slug, append a revision. `published_at`
  is set on the first publish and never moved afterwards; that column answers
  "since when has this been public", and `updated_at` already answers the other
  question.
- `set_content_page_status(page, status, actor)` - publish or unpublish as its
  own verb, so an operator can take a page down without re-saving whatever is in
  the body box. It appends a revision too: "the page went dark on Tuesday" is a
  fact about the page.
- `rollback_content_page(page, revision, actor)` - **appends, never deletes.**
  Restoring revision 3 writes it forward as a new revision with a note naming
  the source; revisions 4 and 5 stay where they are. An undo that erases what it
  undid turns the history from evidence into a guess. `status` is deliberately
  not restored, so rolling back text cannot unpublish a live page or republish
  one that was just taken down.

RLS: `content_pages` exposes **published rows only** to anon and authenticated,
so a draft cannot reach a visitor even if application code forgot a filter.
`content_page_revisions` has **no policy at all** - a revision can hold a body
that was never published, and the history is reached through the admin panel
over the service role.

**Verified against production without applying.** One `DO` block created
everything, exercised it and ended in an unconditional `RAISE`. The full list of
assertions is in `migrations/pending/README.md`; the ones worth naming here are
that anon saw the one published row, no revisions at all, could neither update a
page nor execute `save_content_page`, and that a rollback of a revision that
does not exist raises rather than blanking the page.

## Permissions

`AdminSection` gained a `content` value. `content_uploader` gets `none` and
`support` gets `read`.

The name of the role is the trap: "content" in `content_uploader` means product
content. These pages describe how refunds, cancellation and validity work, and
under Israeli consumer law a factual claim on a marketing page binds the
business. Support quotes them back to customers, so reading them is part of
answering; editing them is not.

## Caching

The storefront read is `use cache` + `cacheLife('hours')`, tagged with
`CATALOGUE_TAG`, and every write path calls `updateTag(CATALOGUE_TAG)`.

A tag of its own would have been tidier and is not worth it: content pages are
edited a handful of times a year, so over-invalidating the catalogue costs a
cache refill nobody notices, while a second tag would need
`scripts/cache-invalidation-gate.mjs` to learn about it or the write path would
have to go on that gate's exception list - which is how a save that leaves the
storefront stale for an hour stops being caught.

A missing table is an **answer** ("no overrides exist") and is logged once per
process. Anything else goes through `orFail` and throws, because `use cache`
stores nothing for a scope that threw - so a transient failure keeps the last
good copy instead of caching an empty site for an hour.

## The sitemap

Published pages join the `content` section, deduped by path. `/about` is both a
fixed entry and a row bound to that address, and a sitemap listing one URL twice
is reported by Search Console as containing errors. The fixed entries win,
because they carry the per-page priorities - `/suppliers` is 0.7 because a
business is worth more than a session, and an appended generated entry would
flatten it back to the default.

Once a row exists, its `updated_at` becomes the `lastmod` for the fixed entry.
Those four entries carried none and said why: "`/contact` changes when the code
changes, and there is no signal here for that". A row is that signal.

## What was not done

**No scheduled publishing.** `201_scheduled_price_changes.sql` is the pending
migration that would give this repository a scheduler, and it is unapplied.
Building a second one for page bodies would mean a second cron, a second late-
job failure mode and a second thing to explain. Publish is a button.

**No preview of an unpublished page at its public URL.** The editor renders the
draft through `RichText`, the same component the page uses, so what an operator
sees is what will be published. Serving a draft at `/page/<slug>` to an
authenticated admin would mean the storefront read could see drafts, and that
filter would then be the only thing standing between an unfinished page and the
public. The RLS policy is a better place for that decision than an `if`.

**No visual parity measurement.** `scripts/compare.mjs` refuses with exit 5 -
the live reference is gone and it will not score the site against itself (see
`docs/REFS-POLICY.md`). What is asserted instead is the thing the gate was
protecting: `src/app/content-pages.test.ts` checks that these pages use the same
frame and the same reading measure as `/faq`, which was measured against the
template while there was still something to measure against.
