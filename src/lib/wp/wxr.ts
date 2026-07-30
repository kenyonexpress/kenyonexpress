/**
 * Reads a WordPress WXR export into the three lists the migration loads:
 * product categories, products, and the images they reference.
 *
 * WHY THIS EXISTS RATHER THAN THE READER ON `feat/wp-migration`
 *
 * The dry run written up in `docs/WP-EXPORT-2026-07-29-DRY-RUN.md` found the
 * older reader disagreeing with a cross-check parser three times, and every
 * disagreement was a defect in the reader. Those three are fixed here BY
 * CONSTRUCTION and each has a test that fails if it comes back:
 *
 *   1. **28 categories against 11.** `readTaxonomy` read `<wp:term>` filtered to
 *      `product_cat` and then ALSO read every `<wp:category>`, which is the BLOG
 *      taxonomy: Aside, Design, Podcasts, Videos and eleven more Electro demo
 *      terms. Worse, both taxonomies carry a term with the slug
 *      `uncategorized`, so the collision handler moved the real category `כללי`
 *      onto `/category/uncategorized-2`. No gate could catch it: extra
 *      categories only make a dangling-reference check pass more easily. This
 *      reader never looks at `<wp:category>` at all.
 *   2. **46 products against 45.** The extra is Dokan's hidden
 *      `reverse-withdrawal-payment` bookkeeping row, which is not merchandise.
 *   3. **66 images against 65.** One attachment belongs to a `private` product
 *      the pipeline excludes but whose image it uploaded anyway. Attachments are
 *      collected from the products that survive filtering, never from the file
 *      at large.
 *
 * Slug collisions are REPORTED rather than resolved. Renaming a slug silently
 * is what produced `uncategorized-2`, and a slug is a URL somebody may already
 * have linked to; the caller decides, with the list in front of them.
 *
 * Dependency-free on purpose: WXR is regular enough for these fields, the
 * project has no XML parser, and a pure module is testable against fixtures
 * without a 6MB file or a network.
 */

export interface WxrCategory {
  termId: string
  slug: string
  name: string
  /** Parent slug, or null for a root. The tree is preserved, not flattened. */
  parentSlug: string | null
}

export interface WxrProduct {
  postId: string
  slug: string
  title: string
  status: string
  /** Absolute WordPress URL this product was served at. */
  link: string
  /** product_cat slugs, most specific last as WordPress emits them. */
  categorySlugs: string[]
  /** Attachment ids referenced by _thumbnail_id and the gallery. */
  attachmentIds: string[]
}

export interface WxrAttachment {
  postId: string
  url: string
  /** The product post id this image belongs to, when the export says. */
  parentId: string | null
}

export interface WxrCatalog {
  categories: WxrCategory[]
  products: WxrProduct[]
  attachments: WxrAttachment[]
  /** Everything a human has to decide about before this can be loaded. */
  warnings: string[]
  counts: {
    productsPublished: number
    productsSkipped: number
    blogTermsIgnored: number
  }
}

/** Dokan writes this hidden product to carry reverse-withdrawal bookkeeping. */
export const DOKAN_BOOKKEEPING_SLUG = 'reverse-withdrawal-payment'

/** Only these statuses are merchandise a shop can sell. */
const SELLABLE_STATUSES = new Set(['publish'])

function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#8217;/g, '’')
    .replace(/&#038;|&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
}

/** Text of the first `<tag>`, CDATA unwrapped. Null when the tag is absent. */
function tagText(block: string, tag: string): string | null {
  const match = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`).exec(block)
  if (!match) return null
  const raw = match[1] ?? ''
  const cdata = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(raw)
  return decodeEntities((cdata ? cdata[1] : raw) ?? '').trim()
}

function allBlocks(xml: string, tag: string): string[] {
  return [...xml.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g'))].map((m) => m[1] ?? '')
}

/**
 * Product categories, and ONLY product categories.
 *
 * `<wp:category>` is deliberately not read. It is the blog taxonomy, it shares
 * the `uncategorized` slug with the product one, and reading it is what made a
 * real category land on a suffixed URL.
 */
export function readProductCategories(xml: string): {
  categories: WxrCategory[]
  blogTermsIgnored: number
} {
  const categories: WxrCategory[] = []
  for (const block of allBlocks(xml, 'wp:term')) {
    if (tagText(block, 'wp:term_taxonomy') !== 'product_cat') continue
    const slug = tagText(block, 'wp:term_slug')
    if (!slug) continue
    categories.push({
      termId: tagText(block, 'wp:term_id') ?? '',
      slug,
      name: tagText(block, 'wp:term_name') ?? slug,
      parentSlug: tagText(block, 'wp:term_parent') || null,
    })
  }
  return { categories, blogTermsIgnored: allBlocks(xml, 'wp:category').length }
}

/** `<category domain="product_cat" nicename="...">` on an item. */
function itemCategorySlugs(item: string): string[] {
  const slugs: string[] = []
  for (const match of item.matchAll(/<category domain="product_cat" nicename="([^"]+)"/g)) {
    const slug = match[1]
    if (slug) slugs.push(decodeEntities(slug))
  }
  return slugs
}

function itemMeta(item: string, key: string): string | null {
  for (const block of allBlocks(item, 'wp:postmeta')) {
    if (tagText(block, 'wp:meta_key') === key) return tagText(block, 'wp:meta_value')
  }
  return null
}

export function readCatalog(xml: string): WxrCatalog {
  const warnings: string[] = []
  const { categories, blogTermsIgnored } = readProductCategories(xml)

  const items = allBlocks(xml, 'item')
  const products: WxrProduct[] = []
  const attachmentsById = new Map<string, WxrAttachment>()
  let productsSkipped = 0

  // Attachments are indexed first and picked from later, so an image is only
  // ever included because a surviving product referenced it.
  const attachmentIndex = new Map<string, WxrAttachment>()
  for (const item of items) {
    if (tagText(item, 'wp:post_type') !== 'attachment') continue
    const postId = tagText(item, 'wp:post_id')
    const url = tagText(item, 'wp:attachment_url')
    if (!postId || !url) continue
    attachmentIndex.set(postId, {
      postId,
      url,
      parentId: tagText(item, 'wp:post_parent') || null,
    })
  }

  for (const item of items) {
    if (tagText(item, 'wp:post_type') !== 'product') continue

    const slug = tagText(item, 'wp:post_name') ?? ''
    const status = tagText(item, 'wp:status') ?? ''
    const postId = tagText(item, 'wp:post_id') ?? ''
    const title = tagText(item, 'title') ?? ''

    if (slug === DOKAN_BOOKKEEPING_SLUG) {
      productsSkipped += 1
      warnings.push(`skipped ${DOKAN_BOOKKEEPING_SLUG}: Dokan bookkeeping row, not merchandise`)
      continue
    }
    if (!SELLABLE_STATUSES.has(status)) {
      productsSkipped += 1
      warnings.push(`skipped ${slug || postId}: status ${status || 'unknown'}`)
      continue
    }

    const thumbnailId = itemMeta(item, '_thumbnail_id')
    const gallery = (itemMeta(item, '_product_image_gallery') ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
    const attachmentIds = [...new Set([thumbnailId, ...gallery].filter((id): id is string => !!id))]

    for (const id of attachmentIds) {
      const attachment = attachmentIndex.get(id)
      if (attachment) attachmentsById.set(id, attachment)
      else warnings.push(`product ${slug || postId} references image ${id}, absent from the export`)
    }

    products.push({
      postId,
      slug,
      title,
      status,
      link: tagText(item, 'link') ?? '',
      categorySlugs: itemCategorySlugs(item),
      attachmentIds,
    })
  }

  // Collisions are reported, never resolved: a suffixed slug is a URL nobody
  // linked to, invented on the machine's own authority.
  for (const [slug, count] of countBy(categories.map((c) => c.slug))) {
    if (count > 1)
      warnings.push(`category slug "${slug}" appears ${count} times; decide which wins`)
  }
  for (const [slug, count] of countBy(products.map((p) => p.slug))) {
    if (count > 1) warnings.push(`product slug "${slug}" appears ${count} times; decide which wins`)
  }

  // A product whose category is not in the export would load with a dangling
  // reference, which is the failure the old reader's extra categories hid.
  const knownCategories = new Set(categories.map((c) => c.slug))
  for (const product of products) {
    for (const slug of product.categorySlugs) {
      if (!knownCategories.has(slug)) {
        warnings.push(`product ${product.slug} is in category "${slug}", absent from the export`)
      }
    }
  }

  return {
    categories,
    products,
    attachments: [...attachmentsById.values()],
    warnings,
    counts: {
      productsPublished: products.length,
      productsSkipped,
      blogTermsIgnored,
    },
  }
}

function countBy(values: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return counts
}

/**
 * Products whose slug has nothing to do with their title.
 *
 * 18 of 45 in the real export are recycled posts: a breakfast served at
 * `/product/שעון-אפל-חכם-apple-watch-series-7`, another at `/product/6253`.
 * WordPress served those URLs, so keeping them preserves continuity and
 * re-slugging needs a 301. Either way it is a decision, so it is surfaced.
 */
export function recycledSlugs(products: readonly WxrProduct[]): WxrProduct[] {
  return products.filter((product) => {
    if (!product.slug) return true
    if (/^\d+$/.test(product.slug)) return true
    const titleWords = product.title
      .split(/\s+/)
      .filter((word) => word.length > 2)
      .slice(0, 4)
    if (titleWords.length === 0) return false
    const slug = decodeURIComponent(product.slug)
    return !titleWords.some((word) => slug.includes(word))
  })
}
