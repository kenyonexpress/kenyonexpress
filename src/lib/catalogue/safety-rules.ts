/**
 * What makes an ACTIVE product unsafe to have in a live catalogue.
 *
 * WHY THIS EXISTS. CLAUDE.md's top launch blocker read: "172 not applied, and a
 * test row is on sale for one shekel. `מוצר ראשי מאסטר Master Product`, ₪1
 * against a full price of 400, 10 in stock, rendered on the homepage. Anyone who
 * buys it creates a real order and a real payment with nothing to supply."
 *
 * Measured against production on 2026-09-09, that row is `status = 'draft'` with
 * `stock_quantity = 0`. It cannot be bought and it does not render. The specific
 * alarm was out of date.
 *
 * The KIND of defect it described was not. The same measurement found template
 * rows, copies, duplicates and scrambled slugs among the 44 products that are
 * live right now, and none of it was recorded anywhere. A ledger that names one
 * row is worse than no ledger, because fixing that row reads as fixing the
 * problem.
 *
 * WHAT THESE RULES ARE NOT. None of them decides whether a price is correct or
 * whether a product should exist. That is a business judgement and this file
 * deliberately does not make it. Every rule here fires on something that is
 * true regardless of intent: a slug that cannot survive a URL, a name that
 * still says `copy`, two live rows a customer cannot tell apart.
 */

export type CatalogueProduct = {
  id: string
  name_he: string
  slug: string
  type: string
  kenyon_price: string | null
  full_price: string | null
  coupon_price_ils: string | null
  stock_quantity: number | null
  platform_percent: string | null
  supplier_id: string | null
  category_slug: string | null
}

export type CatalogueFinding = {
  rule: CatalogueRule
  productId: string
  detail: string
}

export type CatalogueRule =
  | 'template-name'
  | 'template-slug'
  | 'unsafe-slug'
  | 'opaque-slug'
  | 'duplicate-name'
  | 'price-contradicts-text'
  | 'missing-platform-percent'

/**
 * Words that mean "this row was never finished": an admin duplicate, a seed
 * template, or a scratch row. Matched on the raw string, so the Hebrew and the
 * English forms both count.
 *
 * `מאסטר` is here because production carries `! צימר מאסטר` and two rows called
 * `עיסוי מאסטר`, all live, and because three more slugs are `צימר-מאסטר-copy`,
 * `צימר-מאסטר-copy-copy` and `עיסוי-מאסטר` under entirely different names.
 */
const TEMPLATE_MARKERS = [
  'מאסטר',
  'master',
  'העתק',
  'copy',
  'לדוגמא',
  'לדוגמה',
  'דוגמא',
  'test',
  'בדיקה',
  'demo',
  'placeholder',
]

/**
 * Operational state written into a customer-facing name. `קוסמטיקאית.   אזל
 * המלאי` ("Cosmetician.   OUT OF STOCK") is live with 10 in stock, so the name
 * and the stock column disagree and the name is what the shopper reads.
 */
const OPERATIONAL_MARKERS = ['אזל המלאי', 'לא זמין', 'out of stock', 'לא למכירה']

/** Letters (any script), digits and hyphens. Everything else breaks a URL. */
const SAFE_SLUG = /^[\p{L}\p{N}-]+$/u

function has(haystack: string, needles: string[]): string | null {
  const lower = haystack.toLowerCase()
  for (const needle of needles) {
    if (lower.includes(needle.toLowerCase())) return needle
  }
  return null
}

/** Collapses whitespace and strips punctuation, so two "the same" names match. */
export function normalizeName(name: string): string {
  return name
    .replace(/[!.,'"()־-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/**
 * A price the TEXT claims, as opposed to the price the row charges.
 *
 * Two live slugs say `רק-108` and `רק-ב108` ("only 108") on rows that charge 9
 * and 20. The pattern is deliberately narrow: only a number introduced by
 * `רק` ("only"), which is a price claim and not a size, a duration or a model
 * number. `45-דקות` in the same slug must not match, and does not.
 */
export function claimedPrice(text: string): number | null {
  const match = text.match(/רק-?ב?-?(\d{2,5})/)
  if (!match?.[1]) return null
  return Number(match[1])
}

function money(value: string | null): number | null {
  if (value == null) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export function findCatalogueProblems(products: CatalogueProduct[]): CatalogueFinding[] {
  const findings: CatalogueFinding[] = []
  const add = (rule: CatalogueRule, productId: string, detail: string) =>
    findings.push({ rule, productId, detail })

  for (const p of products) {
    const nameMarker = has(p.name_he, TEMPLATE_MARKERS) ?? has(p.name_he, OPERATIONAL_MARKERS)
    if (nameMarker) add('template-name', p.id, `name contains "${nameMarker}": ${p.name_he}`)

    const slugMarker = has(p.slug, TEMPLATE_MARKERS)
    if (slugMarker) add('template-slug', p.id, `slug contains "${slugMarker}": ${p.slug}`)

    if (!SAFE_SLUG.test(p.slug)) {
      // Which character, not just "invalid": ₪ in a slug is a very different
      // fix from a stray space, and the reader should not have to hunt.
      const bad = [...p.slug].filter((c) => !/[\p{L}\p{N}-]/u.test(c)).join('')
      add('unsafe-slug', p.id, `slug carries ${JSON.stringify(bad)}: ${p.slug}`)
    }

    // A slug that is only digits is an import id that escaped. It carries no
    // search value and cannot be guessed or read aloud.
    if (/^\d+$/.test(p.slug)) add('opaque-slug', p.id, `slug is a bare number: ${p.slug}`)

    const price = money(p.kenyon_price)
    const claimed = claimedPrice(p.slug) ?? claimedPrice(p.name_he)
    if (price != null && claimed != null && Math.abs(price - claimed) > 0.01) {
      add(
        'price-contradicts-text',
        p.id,
        `text says ${claimed} and the row charges ${price}: ${p.slug}`,
      )
    }

    // Commission has no default anywhere in this project, so a null here is a
    // product that cannot be split at settlement.
    if (money(p.platform_percent) == null) {
      add('missing-platform-percent', p.id, `no platform_percent: ${p.name_he}`)
    }
  }

  // Same name, live twice. The shopper sees one product listed twice and the
  // two rows can belong to different suppliers, which is what makes it a
  // fulfilment problem rather than a cosmetic one.
  const byName = new Map<string, CatalogueProduct[]>()
  for (const p of products) {
    const key = normalizeName(p.name_he)
    byName.set(key, [...(byName.get(key) ?? []), p])
  }
  for (const [name, group] of byName) {
    if (group.length < 2) continue
    const suppliers = new Set(group.map((p) => p.supplier_id))
    for (const p of group) {
      add(
        'duplicate-name',
        p.id,
        `"${name}" is live ${group.length} times across ${suppliers.size} supplier(s)`,
      )
    }
  }

  return findings.sort(
    (a, b) => a.rule.localeCompare(b.rule) || a.productId.localeCompare(b.productId),
  )
}

/** `rule:productId`, the stable key the ledger is written in. */
export function findingKey(finding: CatalogueFinding): string {
  return `${finding.rule}:${finding.productId}`
}
