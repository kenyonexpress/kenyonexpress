import { readFileSync } from 'node:fs'

// Reads the WXR export and reports what a load would produce. Writes NOTHING,
// to any database, ever. Usage:
//   node scripts/wp-dry-run.mjs [path/to/export.xml]
//
// The numbers to check it against, MEASURED against the 2026-07-29 export on
// 2026-08-19 rather than copied forward: 44 products, 11 categories, 65 images.
//
// 44 AND NOT 45, WHICH IS WHAT THIS COMMENT USED TO SAY. The export carries 48
// `product` items: 45 `publish`, 2 `private`, 1 `draft`. One of the 45 publish
// rows is `reverse-withdrawal-payment`, which is Dokan bookkeeping and not
// merchandise, so excluding it leaves 44. The old wording asserted BOTH "45
// products" and "46 means you picked up Dokan's row", which cannot both be
// true: 45 is the raw publish count and already includes it. Read literally,
// the old comment told the next reader that a correct 44 was a bug, and the
// obvious way to "fix" that is to start importing a bookkeeping row as a
// product.
//
// docs/WP-EXPORT-2026-07-29-DRY-RUN.md says 45 and is NOT making that mistake,
// which is worth stating because the two numbers sit next to each other and
// look like a contradiction. It counts PROJECTED products, so it includes the
// one `draft`: 44 active + 1 draft. This script counts publish only and reports
// the draft under "products skipped". Both readers agree there are 44 products
// anyone can buy. docs/WP-IMPORT-REPORT.md has the arithmetic.
//
// A reader that reports 28 categories is reading the blog taxonomy; one that
// reports 45 products has picked up Dokan's bookkeeping row; one that reports
// 66 images has taken an image off a product it excluded.

// The reader is dependency-free TypeScript and Node strips its types natively,
// so there is no loader to configure and no build step between this script and
// the module the tests cover.
const path = process.argv[2] ?? 'data-import/wp-backup/kenyonexpress-wxr-2026-07-29.xml'
const xml = readFileSync(path, 'utf8')

const { readCatalog, recycledSlugs } = await import('../src/lib/wp/wxr.ts')
const catalog = readCatalog(xml)

const line = (label, value) => console.log(`${label.padEnd(28)} ${String(value).padStart(6)}`)

console.log(`\n=== WXR dry run: ${path} ===`)
line('bytes', xml.length)
line('product categories', catalog.categories.length)
line('blog terms ignored', catalog.counts.blogTermsIgnored)
line('products (publish)', catalog.counts.productsPublished)
line('products skipped', catalog.counts.productsSkipped)
line('images referenced', catalog.attachments.length)

const roots = catalog.categories.filter((c) => !c.parentSlug).length
line('category roots', roots)
line('category children', catalog.categories.length - roots)

const recycled = recycledSlugs(catalog.products)
line('slugs unrelated to title', recycled.length)

if (catalog.warnings.length > 0) {
  console.log(`\n--- ${catalog.warnings.length} things to decide ---`)
  const seen = new Set()
  for (const warning of catalog.warnings) {
    const key = warning.replace(/[0-9a-f-]{6,}/g, '#')
    if (seen.has(key)) continue
    seen.add(key)
    console.log(`  ${warning}`)
  }
}

if (recycled.length > 0) {
  console.log('\n--- slugs that do not match their title (301 needed if re-slugged) ---')
  for (const product of recycled.slice(0, 8)) {
    console.log(
      `  ${decodeURIComponent(product.slug).slice(0, 46).padEnd(48)} ${product.title.slice(0, 40)}`,
    )
  }
  if (recycled.length > 8) console.log(`  ... and ${recycled.length - 8} more`)
}

console.log('\nNothing was written to any database.')
