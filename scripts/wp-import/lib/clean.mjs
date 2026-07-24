// Field-level cleaning shared by the transform stage.
// Rules are the ones fixed in docs/ARCHITECTURE-WP-DATA-MIGRATION.md section 2.

const ENTITIES = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#039;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
  '&ndash;': '–',
  '&mdash;': '—',
  '&hellip;': '…',
  '&shy;': '',
}

export function decodeEntities(input) {
  if (!input) return input
  return input
    .replace(/&(amp|lt|gt|quot|#039|apos|nbsp|ndash|mdash|hellip|shy);/g, (m) => ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
}

export function cleanText(input) {
  if (input === null || input === undefined) return null
  const out = decodeEntities(String(input)).replace(/\s+/g, ' ').trim()
  return out === '' ? null : out
}

// Tags we keep in description_he. Everything else is unwrapped, not deleted:
// a <div> around a paragraph must not take the paragraph with it.
const ALLOWED_TAGS = new Set(['p', 'br', 'ul', 'ol', 'li', 'strong', 'em', 'a', 'h2', 'h3'])

/**
 * WordPress post_content into a safe HTML subset.
 *
 * post_content is not HTML, it is HTML plus Gutenberg block comments plus
 * shortcodes plus whatever the page builder left behind. Order matters: strip
 * the non-HTML layers first, then filter tags, then normalize whitespace.
 */
export function cleanHtml(input, { rewriteUrl } = {}) {
  if (!input) return null
  let html = String(input)

  html = html.replace(/<!--\s*\/?wp:[\s\S]*?-->/g, '') // Gutenberg block comments
  html = html.replace(/<!--[\s\S]*?-->/g, '') // any other comment
  html = html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '') // never keep these
  html = html.replace(/\[\/?[^\]\n]{1,120}\]/g, '') // shortcodes

  html = html.replace(/<\/?([a-z][a-z0-9]*)\b([^>]*)>/gi, (match, rawTag, attrs) => {
    const tag = rawTag.toLowerCase()
    if (!ALLOWED_TAGS.has(tag)) return '' // unwrap: drop the tag, keep the text
    if (match.startsWith('</')) return `</${tag}>`
    if (tag === 'a') {
      const href = attrs.match(/\bhref\s*=\s*["']([^"']*)["']/i)?.[1]
      if (!href) return '<a>'
      const target = rewriteUrl ? rewriteUrl(href) : href
      return `<a href="${escapeAttr(target)}">`
    }
    if (tag === 'br') return '<br />'
    return `<${tag}>`
  })

  html = decodeEntities(html)
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/(<\/p>)\s*/g, '$1')
    .trim()

  return html === '' ? null : html
}

function escapeAttr(value) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

/** Strip all markup. Used for seo_description and short_description fallbacks. */
export function htmlToText(input, maxLength = null) {
  if (!input) return null
  const text = cleanText(String(input).replace(/<[^>]+>/g, ' '))
  if (!text) return null
  if (maxLength && text.length > maxLength) return `${text.slice(0, maxLength - 1).trimEnd()}…`
  return text
}

// ---------------------------------------------------------------------------
// Slugs
// ---------------------------------------------------------------------------

/**
 * WordPress stores Hebrew slugs percent-encoded in post_name. The decoded form
 * is the one humans and the new router see, so decode first and only then
 * normalize. A slug that decodes to nothing falls back to the title.
 */
export function normalizeSlug(rawSlug, fallbackTitle) {
  let slug = rawSlug ? safeDecode(rawSlug) : ''
  slug = slug.toLowerCase().trim()
  slug = slug.replace(/[\s_]+/g, '-')
  // keep latin, digits, hyphen, and the Hebrew block; drop the rest
  slug = slug.replace(/[^a-z0-9\u0590-\u05FF-]/g, '')
  slug = slug.replace(/-{2,}/g, '-').replace(/^-|-$/g, '')
  if (slug) return slug
  if (!fallbackTitle) return null
  return normalizeSlug(fallbackTitle, null)
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value // malformed percent-encoding: keep the bytes rather than lose the row
  }
}

/**
 * Deterministic collision resolution. Same input order always yields the same
 * suffixes, so a re-run produces identical slugs and therefore identical
 * redirects.
 */
export function dedupeSlug(slug, taken) {
  if (!taken.has(slug)) {
    taken.add(slug)
    return { slug, collided: false }
  }
  let n = 2
  while (taken.has(`${slug}-${n}`)) n += 1
  const unique = `${slug}-${n}`
  taken.add(unique)
  return { slug: unique, collided: true }
}

// ---------------------------------------------------------------------------
// Prices
// ---------------------------------------------------------------------------

export function parsePrice(value) {
  if (value === null || value === undefined || value === '') return null
  const n = Number.parseFloat(String(value).replace(/[^\d.-]/g, ''))
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100) / 100
}

/**
 * Woo regular/sale into price_ils + compare_at_price_ils.
 *
 * compare_at is only set when there is a genuine discount. A compare_at equal
 * to or below the price renders as a fake strike-through, which is both ugly
 * and, for a consumer marketplace, a legal problem.
 */
export function derivePrice({ regularPrice, salePrice, effectivePrice }) {
  const regular = parsePrice(regularPrice)
  const sale = parsePrice(salePrice)
  const effective = parsePrice(effectivePrice)

  if (sale !== null && sale > 0 && regular !== null && sale < regular) {
    return { price: sale, compareAt: regular, onSale: true }
  }
  const price = regular ?? effective ?? sale
  return { price, compareAt: null, onSale: false }
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

export function normalizeEmail(raw) {
  const value = cleanText(raw)?.toLowerCase()
  if (!value) return null
  // deliberately strict: an address we cannot trust is better dropped than
  // used to create an account someone else can claim.
  if (!/^[^\s@]+@[^\s@.]+\.[^\s@]{2,}$/.test(value)) return null
  return value
}

/** Israeli mobile numbers to 05X-XXXXXXX, or null when it is not one. */
export function normalizePhoneIL(raw) {
  if (!raw) return null
  let digits = String(raw).replace(/\D/g, '')
  if (digits.startsWith('972')) digits = `0${digits.slice(3)}`
  if (digits.length === 9 && digits.startsWith('5')) digits = `0${digits}`
  if (!/^05\d{8}$/.test(digits)) return null
  return `${digits.slice(0, 3)}-${digits.slice(3)}`
}

// ---------------------------------------------------------------------------
// Status mapping
// ---------------------------------------------------------------------------

const STATUS_MAP = {
  publish: 'active',
  draft: 'draft',
  pending: 'draft',
  future: 'draft',
  private: null, // skip
  trash: null, // skip
  'auto-draft': null,
  inherit: null,
}

/** Woo post_status to public.product_status. null means do not import. */
export function mapStatus(statusRaw) {
  return STATUS_MAP[String(statusRaw || '').toLowerCase()] ?? 'draft'
}

/** Woo stock status overrides an otherwise-active product. */
export function applyStockStatus(status, stockStatusRaw) {
  if (status === 'active' && String(stockStatusRaw).toLowerCase() === 'outofstock') {
    return 'sold_out'
  }
  return status
}

/** Map a product onto the product_type enum using the configured category sets. */
export function mapType(categorySlugs, { couponCategorySlugs, serviceCategorySlugs }, meta = {}) {
  const slugs = new Set(categorySlugs || [])
  if (meta._is_coupon === 'yes' || meta._is_coupon === true) return 'coupon'
  if (couponCategorySlugs.some((s) => slugs.has(s))) return 'coupon'
  if (serviceCategorySlugs.some((s) => slugs.has(s))) return 'service'
  return 'physical'
}
