# Homepage merchandising

Admin control over what the home page shows and in what order. Section 59 of
`~/ke-goals/SECTIONS.md`.

## What was already there, measured before anything was written

`127_homepage_cms.sql` **is applied**. `homepage_sections`, `banners`,
`v_homepage_sections_live` and `v_banners_live` all exist in production, with
RLS on and the schedule evaluated in the views against the database's own clock.

**Both tables hold zero rows** (read off production 2026-09-09). So the
machinery was live and inert:

- `readHomepageContent` returned `AUTHORED_CONTENT` on every request.
- Only the **hero** was wired to it. The `sections` list was read, returned, and
  never rendered by anything.
- There was no console, so no operator could reach any of it.

That makes [59] mostly application code. The database half is one small
migration.

## Migration 206

**Four kinds the CHECK refused:** `product_rail`, `category_spotlight`,
`supplier_spotlight`, `countdown`.

`featured` stays in the set and is **not** reused for the rail. It was in 127's
list, it has never had a component, and a kind that means "some products,
configured how exactly" is the ambiguity a closed set exists to prevent.
`product_rail` says which products by saying `source` in its config.

**The window check, which is a real defect and not a tidy-up.** Neither table
checked that `ends_at` is after `starts_at`, and the live views filter
`starts_at <= now() AND ends_at >= now()`. A backwards window is a row that is
active, scheduled, correct-looking in the admin list, and matches **nothing,
ever** - with no error and nothing to see. It is one mis-typed `datetime-local`
away on two adjacent fields. Equal is refused too: a zero-length window is the
same invisible row with a different typo behind it. Safe to add now precisely
because both tables are empty.

**`config` must be an object.** It was `jsonb NOT NULL DEFAULT '{}'` with no
shape check, so `[1,2,3]` and `"hello"` were both storable and both made every
`config.x` read undefined.

Verified against production in a rolled-back `DO` block; the assertion list is
in `migrations/pending/README.md`.

## The authored page is still the default

`readHomepageContent` returns `AUTHORED_CONTENT` whenever the tables are absent,
empty or unreadable, and the authored section list is hero, categories,
benefits, deals. `HomepageSections` maps `benefits` and `deals` to their
components and the first two to nothing, so a deployment with no rows renders
what it rendered before.

**That was measured, not asserted.** `.next/server/app/index.html` was built
from `HEAD` and from the change and diffed. It is **not byte-identical**, and
the two differences are both structural rather than painted:

1. one client chunk filename hash - the countdown banner is a client component
   and joins the bundle;
2. React's Suspense boundary markers `<!--$?--><template id="B:3">` around the
   fallback, the same pair the hero's existing boundary emits.

With those normalised the files are identical character for character,
including every class name and inline style on the benefit bar and all 32 deal
cards.

This matters more here than anywhere else on the site. The home page's fidelity
was a gate, and although `scripts/compare.mjs` now refuses to measure (exit 5:
the live reference is our own build - `docs/REFS-POLICY.md`), the authored order
and geometry are the last recorded state that scored under 11%. An operator
opting into a configured page is a decision somebody makes; a code change that
silently reorders it is not.

## Two kinds render nothing, on purpose

**`hero`** renders nothing in the section list because `<CmsHero>` renders it
above, inside its own Suspense boundary whose fallback is the authored hero. It
is the LCP element and is never behind a spinner.

**`categories`** renders nothing because the standalone category strip was
deleted after measurement: live renders that strip inside the hero column at 768
and not at all at 380, so the standalone copy was a duplicate at one width and
an invention at the other, and it was part of the 967px by which the product
grid started too low on a phone. A `categories` row in the database therefore
cannot bring that strip back through a form.

`featured`, `city_deals` and `banner_row` are 127's kinds that never got a
component. They render nothing and the console does not offer them, so an
operator cannot add a section that is stored, active, scheduled and invisible.

## The rails, and the rule that matches nothing

| Rule | What it reads | Live match count, 2026-09-09 |
| --- | --- | --- |
| `manual` | `config.productIds`, in the operator's order | n/a |
| `biggest_discount` | `(full_price - kenyon_price) / full_price` | 15 of 44 |
| `newest` | `created_at` | 44 of 44 |
| `ending_soon` | `offer_valid_until` | **0 of 44** |

**`offer_valid_until` is null on every active product.** So `ending_soon`
matches nothing today. The rule is built anyway - the column is the right signal
and the operator is the one who fills it - and three things follow from the
measurement:

1. `ProductRail` renders **nothing at all** for an empty list. Not an empty
   grid, and not a "no products" message: a heading over blank space is a defect
   a visitor can see and an operator cannot.
2. The console prints the **live match count** next to each rule, so "my section
   disappeared" becomes "that rule matches 0 products" before publish.
3. A product with no deadline is **excluded** from `ending_soon` rather than
   sorted last. "Soon" is a claim, and a product with no deadline would be
   making it falsely.

**`manual` names product ids and does not use `is_featured`.** Measured the same
day, `is_featured` is false on all 44, so a rail built on it would be empty
until somebody found a checkbox - and one boolean column cannot give two rails
different products. Ids live in `config` rather than a join table: a rail holds
four to twelve products and a table would need its own position column, RLS and
cascade for a list edited by dragging four cards. The cost is a dangling id when
a product is deleted, and the read **drops** it rather than rendering a hole.

**One bounded read, ranked in memory.** `biggest_discount` orders by a computed
expression, which PostgREST cannot do - the alternatives were a generated
column, a view or a database function, three more schema objects to sort at most
a few hundred rows. The pool is capped at 300 against a catalogue of 44, so the
ranking is exact today; past 300 the rule quietly narrows to "the biggest
discount among the 300 newest", which is why the cap and the pool size are both
printed in the console. The category and supplier spotlights filter that same
cached pool, so a page carrying all three costs one round trip between them.

## The countdown

It is a **client component**, and that is forced rather than preferred.
`cacheComponents` treats reading the clock in a prerendered Server Component as
a build error - the same wall that pushed the schedule into
`v_homepage_sections_live` - and a counter is the clock, once a second.

The first paint shows the **deadline**, not the digits; the digits replace it on
the first tick. Rendering a computed remaining time on the server is a hydration
mismatch by construction, and on the LCP page a mismatch re-renders the subtree.
Both are one line, so nothing shifts.

`config.deadline` is **not** the section's `ends_at`. The window decides whether
the banner is on the page; the deadline decides what the digits count to.
Reusing one field would mean the banner vanishes in the same second the counter
hits zero, and there would be no way to say "the sale ended at midnight, keep
the banner up until 2am". A passed deadline renders nothing, so a counter never
shows a negative number or sits on `00:00:00`.

The link must be internal, the same rule 127's CHECK applies to a banner: our
own hero linking off-site is an open redirect wearing a marketing hat, and
`//evil.example` looks internal in a text box.

## The console

`/admin/homepage`, admin only, in the `content` section added for [58].

**Reordering is two buttons, not drag and drop.** A drag reorder posts the whole
list, so two operators reordering at once each overwrite the other's positions
wholesale and neither is told. Swapping with a neighbour writes two rows, so the
worst case of a collision is one section a place off rather than a list silently
reverted. `position` has no unique constraint and 127 defaults every row to 0,
so the swap assigns the neighbour's slot and the neighbour a slot beside it -
which orders two rows that started identical.

**The config is a JSON box with its keys printed beside it**, not four bespoke
forms. Four kinds take two or three keys each; four forms would be four places
to add the fifth kind, and the one that gets forgotten is the one an operator
then cannot configure. The schema is enforced on the way in and the error names
the offending field.

**A row whose config does not parse says so in the list.** `parseSectionConfig`
returning null means the page skips the section silently, which is right on a
page every visitor lands on and an unexplained disappearance in the console.

**The empty-list notice is the important copy on the page.** With no rows the
home page renders its authored default, and the first section saved and
activated is the moment the list becomes the page - including the benefit bar
and the product grid, which have to be in the list from then on or they vanish.
That is not obvious from a list that starts empty.

`/admin/homepage/preview` renders the sections reading the **base tables**, so a
campaign scheduled for next Tuesday is visible. It is not a draft copy: there is
one set of rows and preview differs only in which query reads them, because a
second version would drift from the one being edited. It does not show the
storefront header and footer, which belong to the `(store)` layout.

## Caching

`updateTag(CATALOGUE_TAG)` **and** `revalidatePath('/')` on every write, and
they do different jobs: the tag expires the cached product reads in
`lib/homepage/rails.ts`, the path invalidates the prerendered home page that
holds the section order. Doing only the tag leaves the old order on a page whose
products have changed, which is the confusing half of the bug.

`readHomepageContent` itself stays uncached and on the service role. That is
127's decision and its header argues it at length; it is unchanged here.

## What was not done

**No image upload in the banner console.** The console lists banners and does
not create them. Slides carry measured geometry that a form deliberately cannot
set (`lib/homepage/cms.ts`), so a create form would need the image pipeline, the
alt-text rule from 049, and a position-versus-authored-slide mapping - and
`banners` holds zero rows, so nothing is being blocked today. The list exists so
an operator can see what is there and know the carousel is code-driven.

**No A/B testing and no per-audience sections.** Neither was asked for, and both
would need the section list to become per-request, which takes the home page
dynamic.
