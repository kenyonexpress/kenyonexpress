# V06: supplier join and legal pages, visual (04.11.2026)

Queue item V06. `/supplier/apply` and the four legal documents (`/terms`, `/privacy`, `/returns`, `/accessibility`) in the same frame as /cart, /checkout, /login and /account (V01 to V05), readable and touchable at 380. The shots for 380, 768 and 1440 are in `docs/V06/`.

## What changed

**`/supplier/apply` had no site chrome at all.**
- `(supplier-public)` has no layout, so the page rendered a bare form with no header, no footer and no way back to the store.
- A new `src/app/(supplier-public)/supplier/apply/layout.tsx` wraps this one route in the legal group's chrome: `CartProvider`, `SkipLink`, `SiteHeader`, `main#main-content` and `SiteFooter`.
- The header and footer are imported unchanged. `/supplier/login` and `/supplier/access-denied` keep their standalone screens.

**The page frame (`supplier/apply/page.tsx`)** now matches V04:
- the breadcrumb band (בית › הצטרפות עסקים)
- a centred title, 40px from 768 and 28/36 below
- the intro as a centred paragraph
- the body in one 760px column, Electro's my-account column

The status card ("הבקשה שלכם") gets Electro's section heading: a hairline under the title, a yellow bar under the words only. The new copy is `supplierJoin.crumb` in both catalogues. The i18n ceiling holds at 568.

**`src/styles/supplier-apply.css` (new)** reshapes the shared wizard, the Turnstile gate and the card check by element, scoped under `.supplier-apply`:
- 45px pill inputs and selects with a #fed700 focus ring
- the step strip as three equal 44px pills, the active one yellow
- the contract as a grey paragraph box in the 14/24 body rhythm
- a 44px checkbox row
- 44px buttons with radius 22: yellow primary that goes ink on hover, white secondary
- at 380 the buttons are full width and stacked with the primary on top; from 768 they sit side by side

`/suppliers/apply` renders the same wizard without the wrapper, so its output is unchanged.

**A wizard bug, found by walking the steps: "המשך" on step 2 submitted the form.**
- React reused the one `<button>` node for "המשך" and "שליחת הבקשה" and flipped its `type` to `submit` inside the click. Chromium then ran the submit default of that same click.
- Measured: the wizard landed on step 3 already showing "שולח...".
- For a real user, step 3's required checkbox is unticked, so the browser blocks the post and shows a validation bubble on arrival.
- **The fix** is distinct `key`s on the two buttons in `src/components/supplier/SupplierApplyWizard.tsx`. That file is not on the 04.11 frozen list.
- `SupplierApplyWizard.test.tsx` (new) asserts the submit button is a different node from "המשך". Checked both ways: it **fails with the fix stashed** (`expected <button type="submit"> not to be <button type="submit">`) and passes with it.
- jsdom does not reproduce the browser's activation timing, so a submit-listener assertion passed either way and was replaced.
- **The empty posts this produced during measurement wrote nothing.** zod rejects them before any insert (`runSubmitApplication`, `applySchema.safeParse`), and the next load still showed the wizard, not a status card.

**Legal documents (`src/styles/legal-page.css`, `LegalArticle.tsx`).** They were already Electro's terms page (W02). At 380 they had three problems:
- **Tables scrolled sideways.** `.legal-table` has a 36rem minimum, so every consumer-law table on terms, privacy and returns (cancellation windows, data categories) put a column off screen. Below 640 each row is now a bordered card, and each cell prints its column name from a new `data-label` attribute. The caption is full width, not one word per line.
- **Targets were small.** The table-of-contents entries were 21px tall, the breadcrumb "בית" was 24px, and the documents-row and contact links were 21px. Below 1024 all of these are 44px.
- **The title was too big.** Electro's 40px title broke "מדיניות ביטולים, החזרות והחזרים" into three lines and pushed the first paragraph below the fold. Below 768 it is 28/36, and the section headings are 21/30.

From 768 up, nothing in the documents' geometry changed. The 1440 numbers are Electro's measured ones (W02).

## Decisions

- **1440 keeps Electro's 21px contents links.** The 44px floor is applied below 1024, which covers the 380 and 768 the item measures. At 1440 these are list links on a 24px pitch, which meets WCAG 2.5.8 through its spacing exception, and the measured Electro rhythm stays as it is. The script still counts them, which is the 14 to 23 "small" at 1440 in the table below.
- **The wizard is reshaped by CSS, not rewritten.** The only change to its file is the two keys, which fix the behaviour and do not touch its markup.
- **Signed in by a minted cookie, and past Turnstile by a minted pass.** `/supplier/apply` requires a session, and the Turnstile widget cannot pass on localhost. `scripts/v06-supplier-legal-shots.mjs` reuses V05's password grant and computes the `ke_ts_pass` cookie (`<uid>.<exp>.<hmac>`, keyed off the Turnstile secret) the gate's action would issue. No secret is printed.
- **The script walks the steps with an exact `המשך` match.** A loose match also hit the Turnstile gate's "המשך לטופס" on the first run, which posted that gate once (it failed verification).

## Proof

### Freeze gate

```
$ git diff --stat design-locked-2026-10-19 -- src/components/home src/components/layout src/components/hero src/components/header src/components/category src/components/storefront src/components/product-card src/components/SiteFooter.tsx src/app/globals.css src/app/layout.tsx src/app/page.tsx tailwind.config.ts
(no output, exit 0)

$ git diff --stat -- src/components src/app/globals.css src/app/layout.tsx src/app/page.tsx tailwind.config.ts
 src/components/supplier/SupplierApplyWizard.tsx | 8 ++++++++
 1 file changed, 8 insertions(+)
```

No frozen file was touched. `src/components/supplier/` is not on the frozen list, and `/supplier/apply` is open under the 04.11 amendment.

### Gates

```
$ pnpm type-check
tsc exit 0

$ pnpm lint
tokens gate: clean (no raw hex, rgb() or arbitrary px in src/)
rtl-logical gate: clean (no physical direction utility outside an LTR island)
i18n gate: clean (568 Hebrew literals in scope, ceiling 568)
locale-format gate: clean (115 inline 'he-IL' in 63 files, at the ceiling)
input-dir gate: clean (28 tel/email/url inputs, all carry dir)
lint exit 0

$ pnpm test
 Test Files  686 passed | 1 skipped (687)
      Tests  8155 passed | 13 skipped (8168)
test exit 0

$ pnpm build
exit 0   (/supplier/apply ƒ, the four legal documents ○)
```

### Measured (`BASE=http://localhost:3311 node scripts/v06-supplier-legal-shots.mjs`, `pnpm start`)

The columns are:
- **overflow:** `scrollWidth - innerWidth`
- **past edge:** elements past the viewport, ignoring the table scroller
- **small:** controls under 44px, or under 24px for an inline link
- **clipped:** leaf elements with clipped text, ignoring `sr-only`
- **h1:** the title's font size

| page | width | overflow | past edge | small | clipped | h1 |
|---|---|---|---|---|---|---|
| terms | 380 | 0 | 0 | 0 | 0 | 28px |
| privacy | 380 | 0 | 0 | 0 | 0 | 28px |
| returns | 380 | 0 | 0 | 0 | 0 | 28px |
| accessibility | 380 | 0 | 0 | 0 | 0 | 28px |
| supplier-apply | 380 | 0 | 0 | 0 | 0 | 28px |
| supplier-apply-step2 | 380 | 0 | 0 | 0 | 0 | 28px |
| supplier-apply-step3 | 380 | 0 | 0 | 0 | 0 | 28px |
| terms | 768 | 0 | 0 | 0 | 0 | 39.998px |
| privacy | 768 | 0 | 0 | 0 | 0 | 39.998px |
| returns | 768 | 0 | 0 | 0 | 0 | 39.998px |
| accessibility | 768 | 0 | 0 | 0 | 0 | 39.998px |
| supplier-apply | 768 | 0 | 0 | 0 | 0 | 39.998px |
| supplier-apply-step2 | 768 | 0 | 0 | 0 | 0 | 39.998px |
| supplier-apply-step3 | 768 | 0 | 0 | 0 | 0 | 39.998px |
| terms | 1440 | 0 | 0 | 23 | 0 | 39.998px |
| privacy | 1440 | 0 | 0 | 20 | 0 | 39.998px |
| returns | 1440 | 0 | 0 | 17 | 0 | 39.998px |
| accessibility | 1440 | 0 | 0 | 14 | 0 | 39.998px |
| supplier-apply | 1440 | 0 | 0 | 0 | 0 | 39.998px |
| supplier-apply-step2 | 1440 | 0 | 0 | 0 | 0 | 39.998px |
| supplier-apply-step3 | 1440 | 0 | 0 | 0 | 0 | 39.998px |

Before this item, at 380 and 768, every legal page had 6 or more small controls (contents entries at 21px, "בית" at 24px). Now it has 0.

### curl (local production build)

```
/terms 308 -> /terms-and-conditions
/privacy 308 -> /privacy-policy
/returns 308 -> /refund_returns
/accessibility 200
/terms-and-conditions 200
/privacy-policy 200
/refund_returns 200
/supplier/apply 307 -> /login?next=%2Fsupplier%2Fapply   (signed out)
/supplier/login 200
```

