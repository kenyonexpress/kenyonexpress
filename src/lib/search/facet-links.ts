import { type CategoryNode, categorySubtree } from '@/lib/category-tree'
import {
  DISCOUNT_STEPS,
  type FacetDistribution,
  type FacetedSearchParams,
  type FacetedSort,
} from '@/lib/search/faceted'

/**
 * Facet navigation as links, and nothing but links.
 *
 * The site ships no search input (layout/no-search-ui.test.ts), and faceted
 * navigation does not need one: every facet value is a URL, the current
 * selection is the URL the page was rendered from, and choosing or clearing
 * a value is a navigation. That makes the whole thing crawlable, shareable,
 * back-button-safe and free of client state -- the results page stays a
 * server component that reads `searchParams`.
 *
 * Pure functions over URLSearchParams so every rule is a unit test away.
 */

/** URL parameter per facet, the same names `parseFacetedParams` reads. */
const FACET_PARAM: Record<FacetName, string> = {
  type: 'type',
  category_slug: 'category',
  discount_bp: 'discount_min',
  city: 'city',
  supplier_id: 'supplier',
  brand: 'brand',
  tags: 'tag',
  in_stock: 'in_stock',
}

export type FacetName =
  | 'type'
  | 'category_slug'
  | 'discount_bp'
  | 'city'
  | 'supplier_id'
  | 'brand'
  | 'tags'
  | 'in_stock'

/** Section headings, in the order the navigation renders them. */
const FACET_LABELS: readonly { name: FacetName; label: string }[] = [
  { name: 'type', label: 'סוג' },
  { name: 'category_slug', label: 'קטגוריה' },
  { name: 'discount_bp', label: 'הנחה' },
  { name: 'city', label: 'עיר' },
  { name: 'supplier_id', label: 'ספק' },
  { name: 'brand', label: 'מותג' },
  { name: 'tags', label: 'תגיות' },
  { name: 'in_stock', label: 'זמינות' },
]

/**
 * What the labels need and the distribution does not carry: a facet value is
 * a slug or an id, and a shopper reads a name. Both are optional. Without the
 * category index the category facet is the flat list of slugs it was; without
 * a supplier's name that supplier is left out, because an id is not a label.
 */
export type FacetContext = {
  categoryIndex?: readonly CategoryNode[]
  supplierNames?: Readonly<Record<string, string>>
}

/** Values that have a display name of their own; everything else is shown as-is. */
const VALUE_LABELS: Record<string, Record<string, string>> = {
  type: { coupon: 'קופונים', physical: 'מוצרים פיזיים', service: 'שירותים', recurring: 'מנויים' },
  in_stock: { true: 'במלאי', false: 'אזל מהמלאי' },
}

function facetValueLabel(name: FacetName, value: string, context: FacetContext = {}): string {
  if (name === 'discount_bp') return `${value}% ומעלה`
  if (name === 'supplier_id') return context.supplierNames?.[value] ?? 'ספק'
  if (name === 'category_slug') {
    return context.categoryIndex?.find((node) => node.slug === value)?.name_he ?? value
  }
  return VALUE_LABELS[name]?.[value] ?? value
}

/** The parameters that survive a facet change: the query and the sort, never the page. */
const CARRIED = ['q', 'sort', 'price_min', 'price_max', 'min', 'max'] as const

/**
 * The href for choosing `value` under `name`, or for clearing it when `value`
 * is the one already selected. One facet holds one value at a time; the
 * offset is dropped because page three of the previous result set means
 * nothing in the new one.
 */
export function facetHref(
  current: URLSearchParams,
  name: FacetName,
  value: string,
  pathname = '/search',
): string {
  const next = new URLSearchParams()
  for (const key of CARRIED) {
    const carried = current.get(key)
    if (carried) next.set(key, carried)
  }
  for (const facet of Object.keys(FACET_PARAM) as FacetName[]) {
    if (facet === name) continue
    const kept = current.get(FACET_PARAM[facet])
    if (kept) next.set(FACET_PARAM[facet], kept)
  }
  const selected = current.get(FACET_PARAM[name]) === value
  if (!selected) next.set(FACET_PARAM[name], value)
  const qs = next.toString()
  return qs ? `${pathname}?${qs}` : pathname
}

/** The href with every facet cleared and the query kept. */
export function clearFacetsHref(current: URLSearchParams, pathname = '/search'): string {
  const next = new URLSearchParams()
  for (const key of CARRIED) {
    const carried = current.get(key)
    if (carried) next.set(key, carried)
  }
  const qs = next.toString()
  return qs ? `${pathname}?${qs}` : pathname
}

/**
 * The sort control, as links for the same reason the facets are links. The
 * first entry has no value: no `sort` parameter is the engine's own relevance
 * order. Labels are the listing pages' wording (`category-tokens.ts`), so the
 * same order reads the same on /search as on a category.
 */
const SORT_LABELS: readonly { value: FacetedSort | null; label: string }[] = [
  { value: null, label: 'סידור ברירת מחדל' },
  { value: 'newest', label: 'למיין לפי המעודכן ביותר' },
  { value: 'price_asc', label: 'למיין מהזול ליקר' },
  { value: 'price_desc', label: 'למיין מהיקר לזול' },
  { value: 'discount_desc', label: 'למיין לפי גובה ההנחה' },
]

/**
 * The href for ordering the current result set by `sort`, or by relevance
 * when `sort` is null. The query, the price bounds and every facet are kept;
 * the offset is dropped, because page three of one order is not page three
 * of another.
 */
export function sortHref(
  current: URLSearchParams,
  sort: FacetedSort | null,
  pathname = '/search',
): string {
  const next = new URLSearchParams()
  for (const key of CARRIED) {
    if (key === 'sort') continue
    const carried = current.get(key)
    if (carried) next.set(key, carried)
  }
  for (const facet of Object.keys(FACET_PARAM) as FacetName[]) {
    const kept = current.get(FACET_PARAM[facet])
    if (kept) next.set(FACET_PARAM[facet], kept)
  }
  if (sort) next.set('sort', sort)
  const qs = next.toString()
  return qs ? `${pathname}?${qs}` : pathname
}

export type SortOption = {
  value: FacetedSort | null
  label: string
  selected: boolean
  href: string
}

/**
 * One option per order. Relevance is the selected one when the URL names no
 * sort; a sort the engine does not know selects nothing, since that URL is
 * answered with an error and no order was applied.
 */
export function buildSortOptions(current: URLSearchParams, pathname = '/search'): SortOption[] {
  const active = current.get('sort')
  return SORT_LABELS.map(({ value, label }) => ({
    value,
    label,
    selected: value === null ? !active : value === active,
    href: sortHref(current, value, pathname),
  }))
}

export type FacetOption = {
  value: string
  label: string
  count: number
  selected: boolean
  href: string
  /** Levels below the top of a tree facet; 0 everywhere else. */
  depth: number
}

export type FacetSection = {
  name: FacetName
  label: string
  options: FacetOption[]
}

/** How many values a section shows; the long tail is noise in a sidebar. */
export const MAX_OPTIONS_PER_FACET = 12

/** How many nodes the category tree shows. */
const MAX_TREE_OPTIONS = 24

type FacetEntry = { value: string; count: number; depth: number }

/**
 * "At least N% off" counts from the per-value counts the engine reports for
 * `discount_bp`. A product 60% off is counted under 10, 25 and 50 alike: the
 * options are thresholds, so they nest, and a count is what the grid shows
 * after the click. A threshold nothing reaches is not offered.
 */
export function discountBuckets(bucket: Readonly<Record<string, number>>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const step of DISCOUNT_STEPS) {
    let count = 0
    for (const [value, n] of Object.entries(bucket)) {
      if (Number(value) >= step * 100) count += n
    }
    if (count > 0) out[String(step)] = count
  }
  return out
}

/**
 * The category facet as a tree: every category that has a matching product
 * somewhere under it, parents before children, each with the count of its
 * whole subtree. That count is honest because the engine filters a parent the
 * same way (`withCategorySubtree`). Siblings are ordered by count, then name.
 * A slug the index does not know keeps its own row at the top level rather
 * than vanishing with its products.
 */
export function categoryTreeEntries(
  bucket: Readonly<Record<string, number>>,
  index: readonly CategoryNode[],
): FacetEntry[] {
  const ids = new Set(index.map((node) => node.id))
  const rolled = new Map<string, number>()
  for (const node of index) {
    let count = 0
    for (const member of categorySubtree(index, node.id)) count += bucket[member.slug] ?? 0
    if (count > 0) rolled.set(node.id, count)
  }

  const bySize = (a: CategoryNode, b: CategoryNode) =>
    (rolled.get(b.id) ?? 0) - (rolled.get(a.id) ?? 0) || a.name_he.localeCompare(b.name_he, 'he')
  const out: FacetEntry[] = []
  const seen = new Set<string>()
  const walk = (node: CategoryNode, depth: number) => {
    if (seen.has(node.id)) return
    seen.add(node.id)
    out.push({ value: node.slug, count: rolled.get(node.id) ?? 0, depth })
    for (const child of index
      .filter((n) => n.parent_id === node.id && rolled.has(n.id))
      .sort(bySize)) {
      walk(child, depth + 1)
    }
  }
  const roots = index.filter(
    (node) => rolled.has(node.id) && (!node.parent_id || !ids.has(node.parent_id)),
  )
  for (const root of roots.sort(bySize)) walk(root, 0)

  const known = new Set(index.map((node) => node.slug))
  for (const [slug, count] of Object.entries(bucket)) {
    if (slug !== '' && !known.has(slug)) out.push({ value: slug, count, depth: 0 })
  }
  return out
}

function facetEntries(
  name: FacetName,
  bucket: Readonly<Record<string, number>>,
  context: FacetContext,
): FacetEntry[] {
  if (name === 'category_slug' && context.categoryIndex) {
    return categoryTreeEntries(bucket, context.categoryIndex).slice(0, MAX_TREE_OPTIONS)
  }
  if (name === 'discount_bp') {
    // Smallest threshold first: the list reads as a scale, not a ranking.
    return Object.entries(discountBuckets(bucket)).map(([value, count]) => ({
      value,
      count,
      depth: 0,
    }))
  }
  return Object.entries(bucket)
    .filter(([value]) => value !== '')
    .filter(([value]) => name !== 'supplier_id' || Boolean(context.supplierNames?.[value]))
    .sort(([a, ca], [b, cb]) => cb - ca || a.localeCompare(b, 'he'))
    .slice(0, MAX_OPTIONS_PER_FACET)
    .map(([value, count]) => ({ value, count, depth: 0 }))
}

/**
 * The navigation model: one section per facet that has at least one value,
 * options ordered by count (then name, for a stable render), the selected
 * value always kept even when it fell outside the top N.
 *
 * A facet whose only value is the one already selected still renders, so
 * the shopper can see what they narrowed by and clear it.
 */
export function buildFacetSections(
  distribution: FacetDistribution,
  current: URLSearchParams,
  pathname = '/search',
  context: FacetContext = {},
): FacetSection[] {
  const sections: FacetSection[] = []
  for (const { name, label } of FACET_LABELS) {
    const bucket = distribution[name]
    if (!bucket) continue
    const selectedValue = current.get(FACET_PARAM[name]) ?? undefined
    const entries = facetEntries(name, bucket, context)
    if (selectedValue && !entries.some((entry) => entry.value === selectedValue)) {
      // The count under a threshold is the nested one, never the raw bucket's.
      const counts = name === 'discount_bp' ? discountBuckets(bucket) : bucket
      entries.push({ value: selectedValue, count: counts[selectedValue] ?? 0, depth: 0 })
    }
    if (entries.length === 0) continue
    sections.push({
      name,
      label,
      options: entries.map(({ value, count, depth }) => ({
        value,
        label: facetValueLabel(name, value, context),
        count,
        selected: value === selectedValue,
        href: facetHref(current, name, value, pathname),
        depth,
      })),
    })
  }
  return sections
}

/** The facets the URL currently narrows by, for the "active filters" strip. */
export function activeFacetChips(
  current: URLSearchParams,
  pathname = '/search',
  context: FacetContext = {},
): { name: FacetName; label: string; value: string; valueLabel: string; href: string }[] {
  const chips = []
  for (const { name, label } of FACET_LABELS) {
    const value = current.get(FACET_PARAM[name])
    if (!value) continue
    chips.push({
      name,
      label,
      value,
      valueLabel: facetValueLabel(name, value, context),
      href: facetHref(current, name, value, pathname),
    })
  }
  return chips
}

/**
 * The facet parameters the page passes to the engine, from the page's own
 * `searchParams`. The listing sidebar writes whole-shekel `min`/`max`, the
 * facet API reads `price_min`/`price_max`; both are the catalogue column's
 * own units (numeric shekels, see admin/bulk-price.ts), so the page carries
 * the sidebar's names across as integers and the engine sees one vocabulary.
 */
export function toFacetSearchParams(
  sp: Record<string, string | string[] | undefined>,
): URLSearchParams {
  const params = new URLSearchParams()
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
  for (const key of [
    'q',
    'type',
    'category',
    'city',
    'brand',
    'tag',
    'in_stock',
    'supplier',
    'discount_min',
    'sort',
  ]) {
    const value = first(sp[key])?.trim()
    if (value) params.set(key, value)
  }
  const wholeShekels = (raw: string | undefined) => {
    if (!raw) return undefined
    const n = Number.parseFloat(raw)
    return Number.isFinite(n) && n >= 0 ? String(Math.floor(n)) : undefined
  }
  const min = wholeShekels(first(sp.price_min) ?? first(sp.min))
  const max = wholeShekels(first(sp.price_max) ?? first(sp.max))
  if (min !== undefined) params.set('price_min', min)
  if (max !== undefined) params.set('price_max', max)
  params.set('limit', '48')
  return params
}

/** Whether the URL narrows by anything beyond the query itself. */
export function hasActiveFacets(params: FacetedSearchParams): boolean {
  return Boolean(
    params.type ||
      params.category ||
      params.supplier ||
      params.discountMin !== undefined ||
      params.city ||
      params.brand ||
      params.tag ||
      params.inStock !== undefined ||
      params.priceMin !== undefined ||
      params.priceMax !== undefined,
  )
}
