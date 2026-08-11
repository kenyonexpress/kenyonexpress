import { readFileSync } from 'node:fs'

// Reads the WXR export and reports what a load would produce. Writes NOTHING,
// to any database, ever. Usage:
//   node scripts/wp-dry-run.mjs [path/to/export.xml]
//
// The numbers to check it against are in docs/WP-EXPORT-2026-07-29-DRY-RUN.md
// and in STATE: 45 products, 11 categories, 65 images from the 2026-07-29
// export. A reader that reports 28 categories is reading the blog taxonomy; one
// that reports 46 products has picked up Dokan's bookkeeping row; one that
// reports 66 images has taken an image off a product it excluded.

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
