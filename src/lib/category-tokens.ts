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
    strikeColor: '#768b9e',
    saleColor: '#dc3545',
    badgeBackground: '#44b81b',
    badgeColor: '#ffffff',
    badgeFontSize: '11.998px',
    categoryColor: '#768b9e',
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
