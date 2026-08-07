// WXR (WordPress eXtended RSS) and CSV readers.
//
// These are the third and fourth extraction sources, alongside REST and a
// restored dump. They exist because the export a site owner can actually
// produce is `Tools > Export` or the WooCommerce product CSV exporter, and
// neither needs SSH, a database password, or REST keys on a live store.
//
// THE CONTRACT
//
// Everything here emits rows in the shape 02-transform already accepts. That
// stage reads either the REST shape (`categories[]`, `images[]`) or the dump
// shape (`category_ids[]`, `gallery_ids`, `thumbnail_id`), so these readers
// target the dump shape and NOTHING downstream changes. A new source that
// forces edits to transform, load and project is a new pipeline, not a new
// source.

import { createReadStream } from 'node:fs'
import { childText, parseElement, readPreamble, streamItems } from './xml.mjs'

// ---------------------------------------------------------------------------
// WXR
// ---------------------------------------------------------------------------

/** `<wp:postmeta>` pairs into the `meta_data` array shape REST returns. */
function readPostmeta(item) {
  const out = []
  for (const meta of item.child['wp:postmeta'] ?? []) {
    const key = childText(meta, 'wp:meta_key')
    if (key == null) continue
    out.push({ key, value: childText(meta, 'wp:meta_value') })
  }
  return out
}

/** Terms an item declares, split by taxonomy. Nicename is the slug. */
function readTerms(item) {
  const byTaxonomy = { product_cat: [], product_tag: [], other: [] }
  for (const cat of item.child.category ?? []) {
    const domain = cat.attrs.domain ?? 'other'
    const entry = { slug: cat.attrs.nicename ?? null, name: cat.text || null }
    if (domain === 'product_cat') byTaxonomy.product_cat.push(entry)
    else if (domain === 'product_tag') byTaxonomy.product_tag.push(entry)
    else byTaxonomy.other.push({ ...entry, domain })
  }
  return byTaxonomy
}

/**
 * `_product_image_gallery` is a comma separated attachment id list. Empty
 * string, a single id, and a trailing comma are all things real exports
 * contain, so this tolerates all three rather than trusting the format.
 */
function parseIdList(value) {
  if (!value) return []
  return String(value)
    .split(',')
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((n) => Number.isInteger(n) && n > 0)
}

/**
 * One WXR <item> of post_type=product into the dump-shaped product row.
 *
 * Attachment items are handled separately (they carry the URLs), and variations
 * are kept with their parent id so a later pass can price them.
 */
function itemToProduct(item, termIndex) {
  const meta = readPostmeta(item)
  const metaByKey = Object.fromEntries(meta.map((m) => [m.key, m.value]))
  const terms = readTerms(item)

  // A term the item names by nicename, resolved to its wp id through the
  // preamble index. An unresolvable term means the export is partial: it is
  // reported rather than dropped, because a product with no category is a
  // product that will not appear in any listing.
  const categoryIds = []
  const unresolved = []
  for (const t of terms.product_cat) {
    const found = t.slug ? termIndex.get(t.slug) : null
    if (found) categoryIds.push(found.id)
    else unresolved.push(t.slug ?? t.name)
  }

  return {
    id: Number.parseInt(childText(item, 'wp:post_id'), 10),
    parent_id: Number.parseInt(childText(item, 'wp:post_parent'), 10) || null,
    post_type: childText(item, 'wp:post_type'),
    name: childText(item, 'title'),
    slug: childText(item, 'wp:post_name'),
    permalink: childText(item, 'link'),
    status: childText(item, 'wp:status'),
    description: childText(item, 'content:encoded'),
    short_description: childText(item, 'excerpt:encoded'),
    date_created_gmt: childText(item, 'wp:post_date_gmt'),
    date_modified_gmt: childText(item, 'wp:post_modified_gmt'),

    sku: metaByKey._sku ?? null,
    regular_price: metaByKey._regular_price ?? null,
    sale_price: metaByKey._sale_price ?? null,
    price: metaByKey._price ?? null,
    stock_quantity: metaByKey._stock ?? null,
    stock_status: metaByKey._stock_status ?? null,
    manage_stock: metaByKey._manage_stock ?? null,
    virtual: metaByKey._virtual ?? null,
    downloadable: metaByKey._downloadable ?? null,
    weight: metaByKey._weight ?? null,
    featured: metaByKey._featured ?? null,
    total_sales: metaByKey.total_sales ?? 0,

    // Dump-shaped image fields: transform already reads these when
    // `images[]` is absent.
    thumbnail_id: metaByKey._thumbnail_id ? Number.parseInt(metaByKey._thumbnail_id, 10) : null,
    gallery_ids: metaByKey._product_image_gallery ?? '',

    category_ids: categoryIds,
    tag_names: terms.product_tag.map((t) => t.name).filter(Boolean),
    product_type: terms.other.find((t) => t.domain === 'product_type')?.slug ?? null,

    meta_data: meta,

    // Carried for the redirect map. WordPress writes every previous slug of a
    // post here, and each one is a URL that is still indexed.
    old_slugs: meta
      .filter((m) => m.key === '_wp_old_slug')
      .map((m) => m.value)
      .filter(Boolean),

    _wxr: { unresolved_categories: unresolved },
  }
}

/** An attachment item: this is where the media URLs live. */
function itemToAttachment(item) {
  const meta = readPostmeta(item)
  const metaByKey = Object.fromEntries(meta.map((m) => [m.key, m.value]))
  return {
    id: Number.parseInt(childText(item, 'wp:post_id'), 10),
    parent_id: Number.parseInt(childText(item, 'wp:post_parent'), 10) || null,
    title: childText(item, 'title'),
    source_url: childText(item, 'wp:attachment_url'),
    relative_path: metaByKey._wp_attached_file ?? null,
    alt: metaByKey._wp_attachment_image_alt ?? null,
    date_created_gmt: childText(item, 'wp:post_date_gmt'),
  }
}

/**
 * The channel preamble carries `<wp:term>` (modern exports) or
 * `<wp:category>` (older ones). Both are read: a 2016 export and a 2026 export
 * of the same store disagree on the element name and agree on everything else.
 */
function readTaxonomy(preambleXml) {
  const wrapped = `<root>${preambleXml.replace(/^[\s\S]*?<channel[^>]*>/, '')}</root>`
  let root
  try {
    root = parseElement(wrapped, 0).node
  } catch {
    return { categories: [], index: new Map() }
  }

  const categories = []
  for (const term of root.child['wp:term'] ?? []) {
    if (childText(term, 'wp:term_taxonomy') !== 'product_cat') continue
    categories.push({
      id: Number.parseInt(childText(term, 'wp:term_id'), 10),
      slug: childText(term, 'wp:term_slug'),
      name: childText(term, 'wp:term_name'),
      parentSlug: childText(term, 'wp:term_parent') || null,
      description: childText(term, 'wp:term_description'),
    })
  }
  for (const term of root.child['wp:category'] ?? []) {
    categories.push({
      id: Number.parseInt(childText(term, 'wp:term_id'), 10),
      slug: childText(term, 'wp:category_nicename'),
      name: childText(term, 'wp:cat_name'),
      parentSlug: childText(term, 'wp:category_parent') || null,
      description: childText(term, 'wp:category_description'),
    })
  }

  const index = new Map()
  for (const c of categories) if (c.slug) index.set(c.slug, c)

  // WXR names a parent by SLUG, but public.categories wants a parent id, and
  // 02-transform expects `parent`. Resolve here, where both halves are in hand.
  for (const c of categories) {
    c.parent = c.parentSlug ? (index.get(c.parentSlug)?.id ?? 0) : 0
    c.count = 0
  }
  return { categories, index }
}

/**
 * A `page` item. Pages are never imported as content - the new store's pages
 * are hand-built - so only what a redirect needs is read: the old path, and
 * enough identity to report the row.
 */
function itemToPage(item) {
  const link = childText(item, 'link')
  const slug = childText(item, 'wp:post_name')
  return {
    id: Number.parseInt(childText(item, 'wp:post_id'), 10),
    slug,
    title: childText(item, 'title'),
    link,
    status: childText(item, 'wp:status'),
    post_type: 'page',
  }
}

/**
 * Read a WXR file into { categories, products, variations, attachments, pages }.
 *
 * Two passes over the file, both streaming. The first reads only the preamble
 * (taxonomy); the second reads items. Two passes because an item names its
 * categories by slug and the slug index lives in the preamble, and buffering
 * every item until the index is complete would defeat the streaming.
 */
export async function readWxr(filePath, { onProgress } = {}) {
  const preamble = await readPreamble(createReadStream(filePath, { encoding: 'utf8' }))
  const { categories, index } = readTaxonomy(preamble)

  const products = []
  const variations = []
  const attachments = []
  const pages = []
  const counts = { skipped: 0 }
  let seen = 0

  for await (const item of streamItems(createReadStream(filePath, { encoding: 'utf8' }))) {
    seen += 1
    if (onProgress && seen % 500 === 0) onProgress(seen)

    const postType = childText(item, 'wp:post_type')
    if (postType === 'product') {
      products.push(itemToProduct(item, index))
    } else if (postType === 'product_variation') {
      variations.push(itemToProduct(item, index))
    } else if (postType === 'attachment') {
      attachments.push(itemToAttachment(item))
    } else if (postType === 'page') {
      pages.push(itemToPage(item))
    } else {
      counts.skipped += 1
    }
  }

  // Attachments are exported as their own items, so a product's gallery ids can
  // only be resolved to URLs once every attachment has been seen. Doing it here
  // keeps 02-transform free of the WXR-specific two-phase shape.
  const byId = new Map(attachments.map((a) => [a.id, a]))
  for (const p of products) {
    const ids = [p.thumbnail_id, ...parseIdList(p.gallery_ids)].filter(Boolean)
    p.images = ids
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((a, position) => ({
        id: a.id,
        src: a.source_url,
        alt: a.alt ?? '',
        name: a.title ?? '',
        position,
      }))
    // A gallery id with no matching attachment item means the export omitted
    // the media. Recorded so the validation gate can count it instead of the
    // product silently losing a photo.
    p._wxr.missing_attachments = ids.filter((id) => !byId.has(id))
  }

  // Real product counts, so an empty category is visible before import.
  const countBySlug = new Map()
  for (const p of products) {
    for (const id of p.category_ids) countBySlug.set(id, (countBySlug.get(id) ?? 0) + 1)
  }
  for (const c of categories) c.count = countBySlug.get(c.id) ?? 0

  return { categories, products, variations, attachments, pages, itemsSeen: seen, counts }
}

// ---------------------------------------------------------------------------
// CSV (the WooCommerce product CSV exporter)
// ---------------------------------------------------------------------------

/**
 * RFC 4180 with the concessions real exports require: CRLF or LF, quoted
 * fields containing commas and newlines, and doubled quotes as an escape.
 *
 * Hand-rolled for the same reason as the XML parser, and because the failure
 * mode of a naive `split(',')` on a Hebrew product catalogue is a shifted
 * column that puts a description into a price field. That parses as NaN and
 * lands the product as a draft, which is at least loud - but a shifted SKU
 * lands silently and is much worse.
 */
export function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  let i = 0

  if (text.charCodeAt(0) === 0xfeff) i = 1 // strip the BOM Excel adds

  while (i < text.length) {
    const ch = text[i]

    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        quoted = false
        i += 1
        continue
      }
      field += ch
      i += 1
      continue
    }

    if (ch === '"') {
      quoted = true
      i += 1
      continue
    }
    if (ch === ',') {
      row.push(field)
      field = ''
      i += 1
      continue
    }
    if (ch === '\r') {
      i += 1
      continue
    }
    if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i += 1
      continue
    }
    field += ch
    i += 1
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.length > 1 || r[0] !== '')
}

/** WooCommerce CSV headers, and the dump-shaped field each one feeds. */
const CSV_COLUMNS = {
  ID: 'id',
  Type: 'product_type',
  SKU: 'sku',
  Name: 'name',
  Published: '_published',
  'Is featured?': 'featured',
  'Short description': 'short_description',
  Description: 'description',
  'In stock?': '_in_stock',
  Stock: 'stock_quantity',
  'Regular price': 'regular_price',
  'Sale price': 'sale_price',
  Categories: '_categories',
  Tags: '_tags',
  Images: '_images',
  Parent: 'parent_id',
  Position: '_position',
}

/**
 * The CSV exporter writes a category path as `Parent > Child`, and multiple
 * categories separated by a comma. Since a comma also separates CSV fields,
 * this only ever runs on an already-unquoted field.
 */
function parseCategoryPaths(value) {
  if (!value) return []
  return value
    .split(',')
    .map((path) => path.trim())
    .filter(Boolean)
    .map((path) =>
      path
        .split('>')
        .map((p) => p.trim())
        .filter(Boolean),
    )
}

export function readWooCsv(text) {
  const rows = parseCsv(text)
  if (rows.length < 2) return { products: [], categories: [], warnings: ['csv has no data rows'] }

  const header = rows[0].map((h) => h.trim())
  const warnings = []
  const unknown = header.filter((h) => !(h in CSV_COLUMNS) && !/^(Attribute|Meta:)/.test(h))
  if (unknown.length) warnings.push(`unmapped csv columns ignored: ${unknown.join(', ')}`)

  // Category paths become synthetic terms. The CSV has no term ids, so ids are
  // minted from the path and kept stable across re-runs by hashing the slug
  // path rather than by counting, which would renumber on any reordering.
  const categories = []
  const catIdBySlug = new Map()
  const slugify = (s) =>
    s
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^\p{L}\p{N}-]/gu, '')
  let nextSyntheticId = 900_000

  function ensureCategory(pathParts) {
    let parentId = 0
    let id = 0
    for (const part of pathParts) {
      const slug = slugify(part)
      if (!slug) continue
      if (!catIdBySlug.has(slug)) {
        id = nextSyntheticId++
        catIdBySlug.set(slug, id)
        categories.push({ id, slug, name: part, parent: parentId, count: 0, description: null })
      } else {
        id = catIdBySlug.get(slug)
      }
      parentId = id
    }
    return id || null
  }

  const products = []
  for (let r = 1; r < rows.length; r += 1) {
    const cells = rows[r]
    const record = {}
    header.forEach((h, c) => {
      const key = CSV_COLUMNS[h]
      const value = cells[c] ?? ''
      if (key) record[key] = value
      else if (h.startsWith('Meta:')) {
        record.meta_data ??= []
        record.meta_data.push({ key: h.slice(5).trim(), value })
      }
    })

    if (!record.id && !record.name) continue

    const categoryIds = parseCategoryPaths(record._categories)
      .map((path) => ensureCategory(path))
      .filter(Boolean)

    products.push({
      id: Number.parseInt(record.id, 10) || null,
      parent_id: Number.parseInt(record.parent_id, 10) || null,
      post_type: 'product',
      name: record.name || null,
      // The CSV has no slug column at all. Leaving it null lets
      // normalizeSlug() derive one from the name, which is the same thing
      // WordPress did when the product was created.
      slug: null,
      permalink: null,
      status: record._published === '1' ? 'publish' : 'draft',
      description: record.description || null,
      short_description: record.short_description || null,
      sku: record.sku || null,
      regular_price: record.regular_price || null,
      sale_price: record.sale_price || null,
      price: record.sale_price || record.regular_price || null,
      stock_quantity: record.stock_quantity || null,
      stock_status: record._in_stock === '1' ? 'instock' : 'outofstock',
      manage_stock: record.stock_quantity === '' ? 'no' : 'yes',
      featured: record.featured === '1' ? 'yes' : 'no',
      product_type: record.product_type || null,
      category_ids: categoryIds,
      tag_names: (record._tags || '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      images: (record._images || '')
        .split(',')
        .map((src) => src.trim())
        .filter(Boolean)
        .map((src, position) => ({ id: null, src, alt: '', position })),
      thumbnail_id: null,
      gallery_ids: '',
      meta_data: record.meta_data ?? [],
      old_slugs: [],
    })
  }

  for (const p of products) {
    for (const id of p.category_ids) {
      const cat = categories.find((c) => c.id === id)
      if (cat) cat.count += 1
    }
  }

  return { products, categories, warnings }
}
