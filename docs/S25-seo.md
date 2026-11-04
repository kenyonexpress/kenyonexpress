# S25: SEO functional (sitemap, robots, JSON-LD)

Queue S25, 04.11.2026. Branch `closeout/v1-final`.

## What was measured first

All three asked-for surfaces already existed before this item:

| Surface | Where | State before S25 |
|---|---|---|
| `/robots.txt` | `src/app/robots.ts` | Live. Disallows token URLs, account, admin, checkout, cart, api. Points at the sitemap index only. |
| `/sitemap.xml` | `src/app/sitemap.xml/route.ts` + five section files under `src/app/sitemap/` | Live. Index of products, categories, content, regions, suppliers. |
| `Product` + `Offer` | `buildProductJsonLd` in `src/lib/seo/json-ld.ts`, emitted by the product page | Live. |
| `Organization` + `WebSite` | `buildSiteJsonLd`, emitted by the home page | Live, but with no legal name, registration number or contact. |

So nothing was rebuilt. Two real gaps were fixed.

## What changed (library only, no page or component touched)

1. **Offer prices are cut from integer agorot.** `price()` used `value.toFixed(2)` on a
   shekel float. It now converts through `parseIls` from `src/lib/money.ts` and
   builds the string from the integer, so `0.1 + 0.2` prints `0.30` and the digits
   cannot drift by an agora from what checkout charges.
2. **The Organization node names the operator.** `legalName: קניון אקספרס`,
   `taxID: 033798513`, `email` and a `ContactPoint` (customer service, Hebrew, IL)
   from `contactEmail()`. No `telephone` and no `sameAs`, per the owner rules
   (no phone, no social links). A test asserts both stay absent.

## Why "metadata exports only" became "library only"

Every page that emits JSON-LD (home, product, category) is on the frozen list, and
`generateMetadata` lives inside those same `page.tsx` files. Editing a metadata export
would still mean editing a frozen file. The pages already call the builders in
`src/lib/seo/json-ld.ts`, so changing the builders changes the structured data and
leaves every frozen file byte-identical. The `name` stays `קניון אקספרס` because the
frozen layout's title template and `og:site_name` say that, and the existing test pins
that the machine-readable name matches what a visitor sees.

## Proof

### Tests (SEO, sitemap, robots)

```
$ pnpm exec vitest run src/lib/seo src/app/sitemap.test.ts src/app/robots.test.ts src/app/sitemap-canonicals.test.ts src/app/sitemap-robots-agree.test.ts
 Test Files  9 passed (9)
      Tests  177 passed (177)
```

Two new tests: the Organization legal and contact fields (with no phone or social),
and offer price digits for 199, 1.05, 0.1+0.2 and 49.9.

### type-check, lint, build

```
$ pnpm type-check   -> tsc exit 0
$ pnpm lint         -> lint exit 0 (i18n, locale-format, input-dir, docs-index gates clean)
$ pnpm build        -> build exit 0
```

### Served output (`PORT=3311 pnpm start`, local production build)

```
robots.txt 200 text/plain
sitemap.xml 200 application/xml; charset=utf-8
sitemap/products.xml 200 application/xml; charset=utf-8   (88 <url> entries)
sitemap/categories.xml 200 application/xml; charset=utf-8
product 200 1.45s   (/product/<אייפון-13>)

home.html Organization {'legalName': 'קניון אקספרס', 'taxID': '033798513', 'email': 'support@kenyonexpress.co.il'}
home.html WebSite
product.html Product  {'@type': 'Offer', 'price': '800.00', 'priceCurrency': 'ILS', 'availability': 'https://schema.org/InStock'}
product.html BreadcrumbList
```

The host in robots.txt and in sitemap `<loc>` read `localhost:3417`: the site URL is
baked at build time from the local env, as recorded before. Production builds with its own.

### Freeze gate

```
$ git diff --stat design-locked-2026-10-19 -- src/components src/app/globals.css src/app/layout.tsx src/app/page.tsx tailwind.config.ts
 src/components/gifts/GiftPurchaseForm.tsx          | 117 +++++++++++++++++++++
 .../notifications/ExpiryEmailSwitch.test.tsx       |  34 ++++++
 src/components/notifications/ExpiryEmailSwitch.tsx |  52 +++++++++
 .../notifications/PushTopicsSwitch.test.tsx        |  74 +++++++++++++
 src/components/notifications/PushTopicsSwitch.tsx  |  90 ++++++++++++++++
 .../supplier-apply/SupplierCardCheck.tsx           |  53 ++++++++++
 .../turnstile/SupplierApplyChallenge.tsx           |  49 +++++++++
 src/components/turnstile/TurnstileRefresh.tsx      |  71 +++++++++++++
 8 files changed, 540 insertions(+)
```

All eight are files that did not exist at the tag (earlier S items). Checked with
`--diff-filter=MDR`: **0** existing files modified. S25's own diff:

```
 src/lib/seo/json-ld.test.ts | 28 ++++++++++++++++++++++++++
 src/lib/seo/json-ld.ts      | 48 +++++++++++++++++++++++++++++++++++++++++----
```

## Not done

- Organization is emitted on the home page only. Putting it site-wide means the root
  layout, which is frozen.
- `name` vs the brand rule's `קניון EXPRESS`: kept as the visible title says, see above.
