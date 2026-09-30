/**
 * Category page design tokens from refs/category-tokens.json
 * (extracted from kenyonexpress.co.il/product-category/hot-deals/).
 */
export const CATEGORY_TOKENS = {
  breadcrumb: {
    fontSize: '14px',
    color: '#333e48',
    paddingTop: '25.004px',
    paddingBottom: '22.4px',
    homeLabel: 'עמוד הבית',
  },
  h1: {
    fontSize: '25.004px',
    fontWeight: 500,
    lineHeight: '40.0064px',
    color: '#333e48',
    marginBottom: '14px',
  },
  controlBar: {
    backgroundColor: '#efefef',
    padding: '2.8px 20.006px',
    fontSize: '14px',
    color: '#333e48',
    resultCountTemplate: (total: number) => `מציגים את כל ⁦${total}⁩ התוצאות`,
  },
  sortOptions: [
    { value: 'menu_order', label: 'סידור ברירת מחדל' },
    { value: 'popularity', label: 'למיין לפי פופולריות' },
    { value: 'rating', label: 'למיין לפי דירוג ממוצע' },
    { value: 'date', label: 'למיין לפי המעודכן ביותר' },
    { value: 'price', label: 'למיין מהזול ליקר' },
    { value: 'price-desc', label: 'למיין מהיקר לזול' },
  ] as const,
  grid: {
    cardWidth: 234,
    display: 'flex',
  },
  card: {
    titleFontSize: '14px',
    titleFontWeight: 700,
    titleColor: '#0062bd',
    titleLineHeight: '18.0001px',
    priceFontSize: '20.006px',
    strikeColor: '#657888',
    saleColor: '#dc3545',
    badgeBackground: '#328614',
    badgeColor: '#ffffff',
    badgeFontSize: '11.998px',
    categoryColor: '#657888',
  },
  layout: {
    contentWidth: 1170,
    outerWidth: 1200,
    innerPadding: 15,
  },
} as const

/** Map live WooCommerce orderby values to our searchParams sort keys. */
export const SORT_TO_ORDERBY: Record<string, string> = {
  newest: 'date',
  relevance: 'menu_order',
  price_asc: 'price',
  price_desc: 'price-desc',
  name: 'menu_order',
  menu_order: 'menu_order',
  popularity: 'popularity',
  rating: 'rating',
}

export const ORDERBY_TO_SORT: Record<string, string> = {
  date: 'newest',
  price: 'price_asc',
  'price-desc': 'price_desc',
  menu_order: 'menu_order',
  popularity: 'popularity',
  rating: 'rating',
}

/**
 * `relevance` is an accepted URL value and an alias of the default order:
 * featured pinned first, then Hebrew-alphabetical, which is what live's
 * "סידור ברירת מחדל" is. It reads as `menu_order` in the select, so a link
 * that says `?sort=relevance` lands on the same page as no sort at all.
 */
export type SortValue =
  | 'newest'
  | 'price_asc'
  | 'price_desc'
  | 'name'
  | 'menu_order'
  | 'relevance'
  | 'popularity'
  | 'rating'

const VALID_SORTS = new Set<string>([
  'newest',
  'price_asc',
  'price_desc',
  'name',
  'menu_order',
  'relevance',
  'popularity',
  'rating',
])

/** The sorts that mean "the default order" and therefore leave the URL bare. */
export function isDefaultSort(sort: SortValue): boolean {
  return sort === 'menu_order' || sort === 'relevance'
}

export function parseSort(raw: string | string[] | undefined): SortValue {
  if (typeof raw === 'string' && VALID_SORTS.has(raw)) return raw as SortValue
  return 'menu_order'
}
