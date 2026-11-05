# S34: contact and share (06.11.2026)

Queue item S34: `/contact` with five channels, the three wa.me buttons (share a product, ask the supplier, contact about an order) with prefilled text, and a share row that puts WhatsApp first, then the platform share sheet, then copy link.

Most of this already existed. Section 94 built the five channels and the topic picker, commit `9fe2ca441` ordered the share row, and the order page already had its contact link. This item did three things:

- `/contact` now shows all five channels at once, as cards. Before, it showed a dropdown with one of them selected.
- A browser spec, `e2e/s34-contact-share.spec.ts`, reads every wa.me address a customer would open and decodes its text.
- Two defects the spec found were fixed: `/contact` nested a second `<main>`, and every toast on a store page rendered twice.

Everything below was measured on `next build` + `next start` (port 3334, `VERCEL= CARDCOM_USE_MOCK=true`), headless Chromium, 06.11.2026. Production answers 503 under `MAINTENANCE_MODE` and was not measured.

## What was already there

| piece | where | since |
|---|---|---|
| The five channels, their openers and the store-number fallback | `src/lib/contact/channels.ts`, `src/server/contact/channels.ts` | section 94 |
| Topic picker (a `<select>` and one button) on `/contact`, in the floating sheet and as plain links in the footer | `ContactTopicPicker`, `WhatsAppFloatSheet`, `FooterContactChannels` | section 94 |
| Share row on the product page: WhatsApp, share, copy link, with named channels as the desktop fallback | `src/components/shared/ProductShareRow.tsx` | `9fe2ca441` |
| "Ask" link on the product page and the supplier page: the supplier's number when the product opted in, otherwise customer service, and a line saying which | `ProductQuestionLink`, `AskBusinessButton`, `askBusinessHref` | section 94 |
| Order contact with the short id, the item names and the amount paid | `/account/orders/[id]` and `/checkout/return`, via `buildOrderInquiryText` | earlier items |

None of these send anything. Each is a `wa.me` link the customer opens and sends from their own WhatsApp; `no-outbound-whatsapp.test.ts` fails if a share or contact component reaches the provider-backed sender.

## What changed

| file | change |
|---|---|
| `src/components/contact/ContactChannelList.tsx` | New. One card per channel: icon, label, one line saying what the channel is for, and "open a WhatsApp chat". The whole card is the link. Counts the tap on `whatsapp_click` with `channel` and `surface: 'contact_page'`, the same shape the picker sent. A channel key it has no line for still renders. |
| `src/app/(store)/contact/page.tsx` | The picker is replaced by a heading, a one-sentence intro and the list. The page root is a `<div>` instead of a second `<main>`. The introduction, the WhatsApp and email sentence and the email form are unchanged. |
| `src/app/(store)/layout.tsx` | The eager `<Toaster>` is removed. `DeferredStoreChrome` already mounts one after hydration; the second was added with the share row and rendered every toast twice. |
| `messages/he.json`, `messages/en.json` | New keys: `contact.channelsHeading`, `contact.channelsIntro` and five `contact.hint*`. |
| `scripts/hebrew-literal-scan.mjs` | Ceiling 558 to 557 (the section's literal `aria-label` went with the picker). |
| `e2e/s34-contact-share.spec.ts` | New, 10 cases. Described below. |
| `e2e/wa-contact.spec.ts` | The `/contact` case reads the list instead of the dropdown. The float, footer and product cases are unchanged. |
| `src/components/contact/contact-channel-list.test.tsx` | New, 5 unit cases. |
| `src/components/contact/no-outbound-whatsapp.test.ts` | The click-to-chat gate now names `ContactChannelList.tsx` among the files it must cover. |
| `docs/evidence/S34/contact-channels-{380,768,1440}.png` | The channel section at the three widths. |

The picker itself is not removed: the floating sheet still uses it, because five cards do not fit there.

## Measured

### The browser spec: 28 of 28

`e2e/s34-contact-share.spec.ts` and `e2e/wa-contact.spec.ts`, on both projects (Desktop Chrome and Pixel 5): 28 passed, 0 failed, 0 skipped, 25.1 s.

The spec never opens WhatsApp. `window.open` is replaced before the page's scripts run and records its argument, and anchors are read rather than clicked.

| case | what it asserts |
|---|---|
| `/contact`, five channels | Five visible cards in operator order; each `href` is `https://wa.me/<digits>?text=`; five different Hebrew texts; `target="_blank"`, `rel="noopener noreferrer"`; the email form is still there; no nested `<main>`. |
| `/contact` at 380 | No sideways scroll; every card at least 44 px tall. |
| Share row order | WhatsApp, then share, then copy link, in document order. |
| WhatsApp share | Opens `https://wa.me/?text=` with no number; the text holds the product name; the last line is the page address; the address appears once. |
| Share, with a platform sheet | `navigator.share` receives the same text and the page address; the named-channel fallback stays closed. |
| Share, with no platform sheet | The fallback opens with Telegram and email, and the email body holds the page address. |
| Copy link | The clipboard holds the page address and the "link copied" toast appears exactly once. |
| Ask about a product | `wa.me/<digits>?text=` holding the product name and, after mount, the page address; the line under the link says who answers. |
| Supplier block | Same destination (`data-via` and number) as the question link on the same page. |
| Order contact | Signed in as the E2E customer: the first line holds the eight-character order id, the full id is absent, there is an items line, and the amount line is in shekels. |

### The addresses themselves

Read from the running build:

```
/contact (all five to wa.me/972524635550)
  customer_service       "שלום, יש לי שאלה לשירות הלקוחות של קניון אקספרס."
  suggestions            "שלום, יש לי הצעה לשיפור קניון אקספרס."
  business_partnerships  "שלום, אני מעוניין/ת בשיתוף פעולה עסקי עם קניון אקספרס."
  site_problem           "שלום, נתקלתי בתקלה באתר קניון אקספרס. העמוד: "
  supplier_join          "שלום, אני בעל/ת עסק ורוצה להצטרף לקניון אקספרס."

/product/barbecue
  share  wa.me/                "מצאתי משהו שווה ב-KenyonExpress: מסעדה בשרית — 49.5 ₪ באתר ועוד 49.5 ₪ בבית העסק (50% הנחה)\n<page address>"
  ask    wa.me/972524635550    "שלום, יש לי שאלה על מסעדה בשרית בקניון אקספרס.\n<page address>"   (via customer_service)
```

The share text quotes both halves of the coupon price, from the same offer the page renders (`lib/share/message.ts`). Each amount is wrapped in a left-to-right isolate, which is not shown above.

### `/contact` at 380, 768 and 1440

| width | columns | cards | shortest card | horizontal overflow | `<main>` elements |
|---|---|---|---|---|---|
| 380 | 1 | 5 | 121 px | 0 | 1 |
| 768 | 2 | 5 | 121 px | 0 | 1 |
| 1440 | 3 | 5 | 121 px | 0 | 1 |

axe on `/contact` (`e2e/a11y.spec.ts -g contact`, both projects): 4 of 4, no WCAG A/AA violations, and every control is reachable by keyboard.

### The two defects

**A second `<main>` on `/contact`.** The page rendered its own `<main>` inside the store layout's. Measured before the fix: `main main` matched 1 element. After: 0. S33 fixed the same thing on the 404 pages and noted `/faq`, which is still open.

**Every toast twice.** On the first run the copy-link case failed with "resolved to 2 elements": one "link copied" toast, two nodes. `(store)/layout.tsx` mounted a `<Toaster>` and so did `DeferredStoreChrome`, which the layout also renders. Both sat at the same position, so the eye saw one toast and a screen reader was told twice. After the fix the page has one toaster and the toast has one node. The same two toasters served every page in the `(store)` group; only the copy-link toast was measured.

### Regression

- `pnpm errors:check` against this build: PASS (the S33 status table is unchanged).
- `e2e/product.spec.ts` + `e2e/cart.spec.ts` on Chromium, because the toaster moved: 17 passed, 1 skipped, 1 failed. The failure was "add to cart from product page then see it in the cart"; run alone it passed (13.4 s). That is the cart contention `playwright.config.ts` documents, not this change.
- vitest: 8277 passed, 13 skipped, 0 failed (702 files).
- `tsc --noEmit`: 0 errors. `pnpm lint`: exit 0. `pnpm build`: exit 0.
- Freeze gate, `git diff design-locked-2026-10-19 -- <frozen paths>`: empty.

## Decisions made alone

- **A list instead of the dropdown on `/contact`.** The item says "five channels"; the page had five options and showed one. `/contact` is not a frozen path.
- **The one-line purpose of each channel is in the message catalog, not in the `contact_channels` table.** The table has no column for it and this item adds no migration.
- **The eager toaster was the one removed.** The deferred one is the design recorded in `DeferredStoreChrome` (keeping sonner off the first-paint path). A toast fired in the moment between hydration and that component loading has nowhere to show; that was already true before `9fe2ca441`.
- **No new check script.** The measurement is a Playwright spec, because the order-contact case needs the signed-in fixture the e2e suite already has.

## Not measured

- **WhatsApp itself.** No test opened wa.me, so what the app does with the text on a real phone is not measured.
- **The supplier-direct path in a browser.** `/product/barbecue` resolves to customer service. A product whose supplier opted in was not opened; that branch is covered by unit tests only (`channels.test.ts`, `product-question-link.test.tsx`).
- **The order link on `/checkout/return`.** It needs a paid order's return URL. It builds its text with the same `buildOrderInquiryText` the account page uses, which is unit-tested; the page itself was not opened.
- **`compare.mjs`.** Not run: `/contact` is not on the list of open pages, and the live site is the maintenance page, so there is nothing to compare against (S33 measured the refusal, exit 5).
- **Production.** 503.

## Found and not handled

- **Migration `236_contact_channels.sql` is still pending.** `contact_channels` and `page_contact_config` do not exist in production (`42P01` from `~/ke-goals/db.sh`; both reads answer 404 during the build). The five channels come from the code defaults, which match what 236 seeds, so the site is correct. But `/admin/contact-channels` cannot change a number or an opener until 236 is applied. It was not applied here: it is not this item's migration.
- **The site-problem opener ends with "העמוד: " and nothing fills it in.** On `/contact` there is no "page the customer was on" to add; the customer types it.
- **`/faq` still nests a `<main>`** (from S33).
