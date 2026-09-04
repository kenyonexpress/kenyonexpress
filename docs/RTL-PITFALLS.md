# RTL-PITFALLS.md

Hebrew typography, number and currency direction, icon mirroring, and bidi
isolation for mixed Hebrew/Latin strings. The failures collected here are the
ones that look correct in the editor and reorder themselves in the browser.

Status: reference. Docs only.

The site is `<html lang="he" dir="rtl">`. Every page and component is RTL by
default. All visible UI strings are Hebrew; code, identifiers, comments and logs
are English.

---

## 1. Hebrew typography

### 1.1 The font is chosen against the reference, deliberately

`--font-sans: var(--font-heebo), Arial, sans-serif`, and **Heebo drives all text
site-wide, Hebrew and Latin**. No Inter, no second family.

The live site renders `"Open Sans"` on 12024 elements. Open Sans **has no Hebrew
glyphs at all**, so every Hebrew character on live is painted by an unnamed
browser fallback that varies by operating system. This is a Hebrew storefront, so
the font that actually paints the text is the one that has to be chosen on
purpose. This is the one place the token layer departs from the measurement for a
reason that is not a WCAG correction, and it is recorded as such in
`docs/DESIGN-SYSTEM.md`.

Consequences to watch for:

- **Do not re-declare the family per page.** `globals.css` drives it from the
  root layout. A page stylesheet that sets `font-family` again is how one page
  ends up a version behind the others; `cart-page.css` carries a comment saying
  exactly this.
- **A Latin fallback is still reachable.** `Arial` sits behind Heebo, so a
  glyph Heebo lacks (a rare symbol, some punctuation) renders in a different
  face at a different apparent size. Check any string that mixes Hebrew with
  symbols.

### 1.2 Hebrew has no case and no ascender rhythm

Practical effects on a design measured from a Latin theme:

- **`text-transform: uppercase` does nothing to Hebrew** and silently uppercases
  any Latin fragment beside it. A label reading `משלוח FREE` becomes
  `משלוח FREE` in Hebrew and Latin at different weights of emphasis than
  intended. Do not use it on mixed strings.
- **`font-variant: small-caps` likewise does nothing** to the Hebrew and
  transforms the Latin.
- **Hebrew has no ascenders or descenders in most letters**, so a line-height
  tuned for Latin reads loose in Hebrew. The measured line heights in the token
  layer (23.996 body, 32.0051 PDP title, 24 footer) are live's, and live is a
  Hebrew site, so they are already correct. Do not "improve" them against a
  Latin sample.
- **Bold is a weight, not a shape.** Hebrew has no italic tradition; `<em>` will
  synthesise an oblique that looks like a rendering error. Use weight or colour
  for emphasis, never `font-style: italic`, on Hebrew text.

### 1.3 Letter-spacing

`letter-spacing` on Hebrew is safe in the sense that Hebrew is not a cursive
joined script, but it is measured on live at exactly one place
(`-0.01em` on hero line 2) and nowhere else. Do not add tracking to Hebrew body
text; it is being read right-to-left and extra tracking slows that more than it
does in Latin.

### 1.4 Truncation and wrapping

- **`text-overflow: ellipsis` puts the ellipsis at the visual left in RTL**,
  which is correct, but only if the element's `direction` is inherited rather
  than forced. A `dir="ltr"` wrapper (see section 4) will move it to the right.
  The checkout stepper's `.checkout-steps__label` relies on this.
- **A Hebrew word cannot be hyphenated** by any automatic rule the browser has
  for Hebrew. `overflow-wrap: break-word` will break mid-word at an arbitrary
  letter, which is unreadable. The benefit bar's 374px breakpoint exists because
  of exactly this: "the label will not shrink past its longest Hebrew word", so
  the layout changes instead of the text breaking.
- **Never size a Hebrew container from the English string length.** Hebrew is
  typically shorter than English for the same meaning and longer than a
  three-letter abbreviation. Measure the rendered Hebrew.

### 1.5 Punctuation belongs to the paragraph, not to the word

A full stop, a comma, a colon, a question mark and brackets are **neutral**
characters. In an RTL paragraph they resolve to the right of the Hebrew, which is
what you want, and they will jump to the wrong end the moment they sit next to a
Latin or numeric run without isolation. That is section 4.

---

## 2. Numbers and currency

### 2.1 Digits are always left-to-right

European digits (`0`-`9`) are `EN` in the bidi algorithm, and an `EN` run is
laid out **left to right inside a right-to-left paragraph**. That is correct and
must not be "fixed":

```
סה"כ 1,234.50 ש"ח
```

The `1,234.50` reads left to right. Applying `direction: rtl` to the number, or
reversing the string, produces `05.432,1`, which is a real defect that has
shipped on Hebrew sites.

The trap is not the digits. It is what sits **beside** them.

### 2.2 The one way this project renders money

```
src/lib/money-format.ts

  shekels(agorot)         ->  ₪1,234.50
  shekelsRounded(agorot)  ->  ₪1,235
```

**Agorot in, always, at every call site.** There were once six functions named
`shekels` in `src/`: three read agorot (`lib/cart/format`, the redeem page, the
admin reports page) and three read shekels (admin analytics, `SalesChart`,
`lib/admin/payouts`). Same name, same output, opposite contracts, so moving a
value between two of those screens was a silent 100x error waiting to happen. The
three that genuinely hold shekels are now `shekelsFromIls`, which cannot be
confused with this.

Two properties of `shekels()` that matter for direction:

1. **It never makes a float.** The whole shekels and the agorot remainder are
   separated with `/` and `%` on the integer, and only the already-whole shekel
   part goes to `Intl` for thousands grouping. "Integer agorot, end to end" is
   true of the display layer too, not merely of the arithmetic behind it. Two of
   the copies it replaced did `agorot / 100` and formatted the float.
2. **The `₪` glyph is written literally.** It is not
   `Intl.NumberFormat(..., {style: 'currency', currency: 'ILS'})`.

### 2.3 Why the currency style is forbidden on a page

`Intl.NumberFormat` with `style: 'currency'` emits **directional marks** around
the currency sign (U+200F RIGHT-TO-LEFT MARK and friends, depending on locale
data). Inside an RTL document those marks reorder a price that sits next to
Hebrew text: the glyph detaches from its number, or the number detaches from the
label, and it moves depending on what is adjacent. The live site prints the bare
glyph, so the reference does too.

`formatIls` in `src/lib/commerce/money.ts` **does** use the currency style, and
that is correct for what it is: a log line, a document, an email, an invoice
field. It is the wrong formatter for a page. The two exist on purpose and are
not interchangeable.

### 2.4 Agorot formatting rules

| Rule | Why |
|---|---|
| Two agorot digits, always, zero-padded (`₪5.00`, not `₪5`) | A price with a variable number of decimals changes width between renders and looks like a rounding bug. `String(fraction).padStart(2, '0')`. |
| Thousands grouped with `he-IL` (`₪1,234.50`) | Matches live and the locale. |
| The minus sign goes **before** the glyph (`-₪12.00`) | `shekels()` emits `${negative ? '-' : ''}₪…`. A minus after the glyph reads as part of the number in an RTL run. |
| The badge form rounds **half-up**, not truncating | A cart of ₪99.60 reads ₪100, not ₪99. `shekelsRounded` uses `Math.floor((value + 50) / 100)`. |
| Zero renders `₪0`, not an empty string | `shekelsRounded` short-circuits at `<= 0`. |
| Never `toFixed()` on a money value | It is a float operation, and this project has no floats on the money path. `src/lib/money.ts` is the only arithmetic. |

### 2.5 Percentages, ranges and units

- A percentage is a number followed by a neutral `%`. In an RTL paragraph the
  `%` will attach to whichever side the algorithm resolves it to, which is
  usually correct for a bare `20%` and **wrong** the moment it is adjacent to a
  Latin word. Isolate the run (section 4).
- A range `10-20` contains a neutral hyphen between two `EN` runs, so it stays
  LTR and reads correctly. A range with a Hebrew word between the numbers does
  not; write it as one isolated run or as two.
- Dates from `toLocaleDateString('he-IL')` are Hebrew-locale strings that already
  contain their own ordering. Do not wrap them in `dir="ltr"`; that reverses the
  order of day, month and year.
- **Convert relative dates to absolute** in any persisted text. "in three days"
  is meaningless the moment the string outlives the render.

### 2.6 Phone numbers

An Israeli mobile is `05X-XXXXXXX`. The digits are LTR and the hyphen is
neutral, so a bare number renders correctly. A number with a `+972` prefix
contains a neutral `+` **at the start of the run**, which is exactly where the
bidi algorithm is most likely to reorder it in an RTL paragraph. Isolate it.

`checkIsraeliMobile` in `src/lib/checkout/steps.ts` accepts all the forms people
actually type (`+972`, spaces, hyphens, brackets) and normalises before it
validates. It deliberately rejects a landline, because this number is what the
courier and the coupon SMS use, so a number that cannot receive a text is a
failure worth catching at the door rather than at delivery.

---

## 3. Icon mirroring

### 3.1 The rule

Icons that imply **direction along the reading axis** must mirror in RTL. Use the
`rtl:` Tailwind variant, never a JavaScript conditional:

```tsx
<ChevronRight className="rtl:scale-x-[-1]" />
<ArrowLeft   className="rtl:rotate-180" />
```

A JS conditional means the icon's direction is decided at render time from state
the component has to be told about, and it will be wrong in any subtree that is
deliberately `dir="ltr"`. The CSS variant follows the actual computed direction
of the element.

`scale-x-[-1]` and `rotate-180` are not equivalent. `scale-x` mirrors across the
vertical axis and leaves the glyph's top and bottom where they are;
`rotate-180` turns it upside down as well. For a horizontal chevron they look
identical, and for anything with vertical asymmetry (a reply arrow, a curved
undo) they do not. Prefer `scale-x-[-1]` unless the glyph is symmetric top to
bottom.

### 3.2 Mirror these

| Icon | Why |
|---|---|
| Chevrons and arrows: back, forward, next, previous | They point along the reading direction. |
| Breadcrumb separators | The trail runs right to left. |
| Carousel and slider previous/next controls | "Next" is leftward. |
| Pagination arrows | Same. |
| A drawer or panel's open/close caret | The drawer enters from the inline-end. |
| Send / reply / forward | Directional along the text axis. |
| Undo and redo | The pair as a whole flips. |
| Progress and step arrows between checkout steps | The row is read right to left. |
| Text-align, indent and outdent glyphs | They depict the text direction itself. |
| Any glyph that contains an arrow as part of a composite (an export tray with an arrow, a login door with an arrow) | The arrow half must flip. |

### 3.3 Do not mirror these

| Icon | Why |
|---|---|
| The brand logo | It is a mark, not a direction. |
| Third-party marks: WhatsApp, Facebook | Never mirrored, never recoloured with `--color-brand-*`. |
| A clock, and any clockwise/anticlockwise glyph | Clocks run clockwise in every locale. A mirrored refresh spinner reads as "undo". |
| Media transport: play, pause, fast-forward, rewind | Media time is LTR in every locale. A mirrored play triangle is a real bug people notice immediately. |
| Checkmarks and crosses | Symmetric in meaning. |
| A magnifier | Its handle is conventionally bottom-right worldwide; mirroring it reads as a different tool. Note that this site has **no search UI** at all, deliberately, so the question rarely arises. |
| Cart, bag, truck, pin, user, lock, trash | Object glyphs, not directional ones. `Trash2` on the cart line is not mirrored. |
| Numbers inside a glyph | Digits stay LTR. |
| A slash in a "no entry" overlay | Mirroring it changes nothing and risks colliding with the glyph beneath. |

### 3.4 Ambiguous cases, decided

- **A truck or delivery van.** It faces a direction, but it is an object, not a
  reading-axis arrow. Do **not** mirror. The header's `Truck` icon is not
  mirrored and matches live.
- **A hamburger menu.** Symmetric. Not mirrored. Its **position** flips, and that
  is a DOM-order concern, not an icon one: the hamburger is on the inline-start,
  which in RTL is the visual right (live at 380 puts it at x=319).
- **A chevron in a `<details>` disclosure that rotates 90 degrees on open.** The
  closed state points along the inline axis and must mirror; the open state
  points down and must not be double-transformed. Compose carefully, and check
  both states.

### 3.5 Transforms have no logical form

Neither `translate-x-*` nor `origin-*` has a logical variant in Tailwind. A
slide-in animation written as `translate-x-full` enters from the physical right
at every direction. Pair it explicitly:

```
class="translate-x-full rtl:-translate-x-full"
class="origin-top-left rtl:origin-top-right"
```

Drawers and off-canvas panels **enter from the inline-end**, not from "right".

---

## 4. Bidi isolation for mixed Hebrew/Latin strings

### 4.1 What actually goes wrong

The Unicode Bidirectional Algorithm resolves each run of characters to a
direction, then places neutral characters (spaces, punctuation, `+`, `-`, `/`,
`:`, `(`, `)`, `#`, `%`) according to the runs on **both** sides of them. In an
RTL paragraph, a neutral that sits between a Hebrew run and a Latin run resolves
to the paragraph direction, so it lands on the **Hebrew** side.

That is why these fail:

| Written | Renders as |
|---|---|
| `ההזמנה ORD-1234 אושרה` | the `-` can attach to the wrong side of `ORD` |
| `שלח ל-user@example.com.` | the trailing `.` jumps to the left of the address |
| `קוד: ABC-123!` | the `!` lands before the code, at the visual right |
| `מחיר: 20% הנחה` | the `%` can separate from its number |
| `טלפון +972-50-1234567` | the `+` is stranded at the wrong end |
| `הקובץ (report.pdf) נשלח` | the brackets swap: `)report.pdf(` |

Nothing about this is a bug in the app. It is the correct output of the
algorithm for text that did not say where its runs begin and end.

### 4.2 The current state of this codebase, stated plainly

**This project uses `dir="ltr"` on a wrapping element and does not use `<bdi>`
anywhere.** Verified by grep across `src/`: 25-plus `dir="ltr"` sites (coupon
codes, order ids, TOTP secrets, error stack text, supplier payout figures) and
**zero** `<bdi>`, zero `unicode-bidi` declarations, zero explicit isolate
characters.

That approach is correct for the cases it is used on, and it has a boundary. The
sections below say where the boundary is.

### 4.3 The three tools, and when each is right

**1. `dir="ltr"` on an element.** Establishes a new bidi paragraph with LTR base
direction. Correct when the content is **entirely** a Latin or numeric
identifier and it is in its own element.

```tsx
<p dir="ltr" className="font-mono">{coupon.code}</p>
<span dir="ltr" className="tabular-nums">{formatIls(total)}</span>
```

This is what the codebase does today, in `coupon/[id]/page.tsx`,
`account/coupons/page.tsx`, `redeem/[token]/RedeemConfirm.tsx`,
`supplier/payouts`, `supplier/orders`, `scan/ScanClient.tsx`,
`account/security/SecurityClient.tsx` and both error pages. Keep doing it.

The limit: it forces the whole element LTR. If the element also contains Hebrew,
that Hebrew is now in an LTR paragraph and its own punctuation moves. So it is
right for a bare code and wrong for a sentence containing one.

**2. `<bdi>` around the foreign run inside a sentence.** `<bdi>` is bidi
**isolate**: the run inside it is resolved independently and cannot influence, or
be influenced by, the neutrals around it. This is the correct tool for a Latin or
numeric fragment **inside** a Hebrew sentence, and the codebase currently has
none.

```tsx
<p>ההזמנה <bdi>{order.id}</bdi> אושרה.</p>
<p>שלח ל-<bdi>{email}</bdi>.</p>
<p>הקובץ <bdi>{filename}</bdi> נשלח.</p>
```

`<bdi>` defaults to `dir="auto"`, so it detects the run's own direction. Add
`dir="ltr"` explicitly when the content is known to be Latin but could begin
with a neutral or a digit:

```tsx
<p>טלפון <bdi dir="ltr">{phone}</bdi></p>
```

**3. `dir="auto"` on an input or a user-content element.** Correct where the
content's direction is not known at build time: a search box, a name field, a
review body, a support message. The browser resolves from the first strong
character.

```tsx
<input dir="auto" className="text-start" />
<p dir="auto">{review.body}</p>
```

Never `dir="auto"` on a fixed Hebrew label; it is a guess where the answer is
known.

### 4.4 The decision table

| Content | Tool |
|---|---|
| A coupon code, order id, token, SKU, TOTP secret, alone in its element | `dir="ltr"` on the element |
| A money figure alone in its element | `dir="ltr"` on the element |
| A URL or email alone in its element | `dir="ltr"` on the element |
| Any of the above **inside a Hebrew sentence** | `<bdi>` around the fragment |
| A phone number, especially `+972` form | `<bdi dir="ltr">` |
| A version string, a hash, a file path | `<bdi dir="ltr">` inside prose, `dir="ltr"` alone |
| User-entered text of unknown language | `dir="auto"` |
| A stack trace or log excerpt | `dir="ltr"` on a `<pre>`, as `app/error.tsx` does |
| A Hebrew sentence with a Latin **brand name** in it (`קניון Express`) | Usually nothing. A single Latin word with no adjacent neutral punctuation resolves correctly. Isolate only if a bracket, slash or trailing period sits against it. |
| A Hebrew sentence ending in a Latin word plus a full stop | `<bdi>` around the word, or the stop lands at the wrong end |

### 4.5 Things that look like isolation and are not

- **`unicode-bidi: isolate` in CSS** does the same job as `<bdi>`, but a CSS rule
  can be overridden, purged, or fail to load, and the text then reflows into the
  wrong order with no error. The element-level attribute travels with the markup.
  Prefer `<bdi>`.
- **`unicode-bidi: bidi-override`** is not isolation, it is a hammer that forces
  every character into one direction. It will render Hebrew backwards. Never use
  it.
- **Inserting U+200E / U+200F marks manually** works and is what
  `Intl.NumberFormat`'s currency style does internally. It is forbidden here for
  the reason in section 2.3: those characters are invisible, they survive copy
  and paste into a database, an email subject or a URL, and they break string
  comparison. If a code is compared for equality anywhere, an invisible mark in
  it is a bug that cannot be seen in a diff.
- **Wrapping in a `<span>` with no `dir`** does nothing. Bidi does not care about
  element boundaries; only a direction or isolation declaration creates a new
  run.
- **Reversing the string in JS** is never the answer to anything on this page.

### 4.6 Checking it

The failure is invisible in source and visible only in a rendered RTL page, so:

1. Render the string with **real data**, not a placeholder. `ABC` and
   `ORD-2026-000123` behave differently, because the second contains hyphens and
   digits.
2. Test the boundary characters specifically: a trailing `.`, a leading `+`, a
   surrounding `()`, an internal `/` or `-`, and a `%`.
3. Select the text with the mouse and drag. A run that highlights in a
   discontinuous block is a run that is resolving in more than one direction.
4. Copy the string out and paste it into a plain-text editor. If the visual order
   and the logical order disagree, the render was relying on the algorithm rather
   than declaring intent.
5. Grep for invisible marks before storing anything a user typed:
   `/[‎‏⁦-⁩]/`.

---

## 5. Layout pitfalls that are not typography

Collected here because they are found during the same pass. The full
logical-property mapping table is section 5.1 of `docs/DESIGN-SYSTEM.md`.

### 5.1 DOM order is side order

In a `justify-between` row, or a row where one child carries `ms-auto`, the
**order of the JSX decides which side an element lands on**. Every class can be
correctly logical and the row can still be a mirror of the reference.

This has happened twice in this codebase, both on money-carrying surfaces:

- **The header.** Hamburger and cart were swapped on every page. Live at 380 has
  hamburger x=319 and cart x=15; ours had the exact mirror. Fixed by rendering
  `MobileDrawer` first.
- **The cart line footer.** Live's row reads right to left: remove (x1236), price
  (x497), quantity (x267), subtotal leftmost, inside a 135..1305 row. Ours had
  qty right and remove far left. Fixed by rendering remove first and giving the
  qty pill the auto margin.

If an element is on the wrong side and its classes are already logical, **reorder
the JSX**. Do not add a physical override to compensate; that is how a row ends
up correct at one width and mirrored at another.

### 5.2 Right-offset is not centred

`ELECTRO_HERO.categoryStrip` records `offsetInlineEnd: 517` with `maxWidth: 728`.
The strip is a 5-up row offset inside the page container (x577-1305 at 1440), not
page-centred, and in RTL its first item renders at the inline-start, which is the
visual right. Centring it is a visible regression that no logical property will
catch.

### 5.3 `text-align` on inputs

Inputs are `text-start`, never `text-left`. An input with a `dir="ltr"` for its
content (a coupon code field) still wants `text-start`, which now resolves to the
left, and that is correct.

### 5.4 Scroll containers

`overflow-x: auto` on a wide table scrolls from the inline-start in RTL, so a
table that is wider than its container opens showing its **right-hand** columns.
That is correct. What is not correct is the document scrolling: at 380 every
account table must either fit or scroll inside its own container.

### 5.5 The gate cannot see any of this

`compare.mjs` scores pixels against a live reference that is itself RTL, so a
mirrored row does show up as a high band percentage. What it will not tell you is
**why**, and a mirrored row and a wrong margin produce the same kind of number.
Check the DOM order first when a whole row is wrong and the individual elements
look right.

---

## Related documents

```
docs/DESIGN-SYSTEM.md        the token layer, the logical-property mapping, the gate
docs/UI-QA-CHECKLIST.md      the manual visual pass, page by page
.claude/skills/rtl-hebrew-ui/SKILL.md   the short form of the direction rules
src/lib/money-format.ts      shekels() and shekelsRounded(), the page formatters
src/lib/commerce/money.ts    formatIls(), the document formatter
src/lib/money.ts             the agorot arithmetic; no floats on the money path
src/lib/checkout/steps.ts    checkIsraeliMobile and the step gates
```
