/**
 * The cities row and the /c/<slug> pages. Hardcoded for now, in this order.
 *
 * `slug` is the URL segment; `name` is the exact value of products.city that
 * the page filters on. No illustrations: Electro v7 has none, so the cells are
 * text-only until city art is supplied (PENDING_ASSET in STATE.md).
 */
export interface City {
  slug: string
  name: string
}

export const CITIES: readonly City[] = [
  { slug: 'tel-aviv', name: 'תל אביב' },
  { slug: 'jerusalem', name: 'ירושלים' },
  { slug: 'haifa', name: 'חיפה' },
  { slug: 'rishon-lezion', name: 'ראשון לציון' },
  { slug: 'petah-tikva', name: 'פתח תקווה' },
  { slug: 'ashdod', name: 'אשדוד' },
  { slug: 'netanya', name: 'נתניה' },
  { slug: 'beer-sheva', name: 'באר שבע' },
  { slug: 'bnei-brak', name: 'בני ברק' },
  { slug: 'holon', name: 'חולון' },
  { slug: 'ramat-gan', name: 'רמת גן' },
  { slug: 'ashkelon', name: 'אשקלון' },
  { slug: 'rehovot', name: 'רחובות' },
  { slug: 'herzliya', name: 'הרצליה' },
  { slug: 'kfar-saba', name: 'כפר סבא' },
  { slug: 'hadera', name: 'חדרה' },
  { slug: 'modiin', name: 'מודיעין' },
  { slug: 'raanana', name: 'רעננה' },
  { slug: 'bat-yam', name: 'בת ים' },
  { slug: 'eilat', name: 'אילת' },
]

export function cityBySlugName(slug: string): City | null {
  return CITIES.find((c) => c.slug === slug) ?? null
}
