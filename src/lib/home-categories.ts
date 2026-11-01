/**
 * C137: the home categories row comes from a project file, not from whatever
 * rows the `categories` table holds (it also carries the orphan `electronics`
 * seed row and `e2e-test-category`). Source, verbatim and in order:
 * KE_LIVE_SPEC.md, "תפריט קטגוריות ... שמות מהאתר החי, לפי הסדר".
 * No name here is invented.
 */
export type HomeCategoryLink = { slug: string; name_he: string }

export const HOME_CATEGORIES: readonly HomeCategoryLink[] = [
  { slug: 'hot-deals', name_he: 'דילים חמים 🔥' },
  { slug: 'under-99', name_he: 'עד ₪99' },
  { slug: 'new', name_he: 'החדשים' },
  { slug: 'restaurants-cafes', name_he: 'מסעדות ובתי קפה' },
  { slug: 'beauty-health', name_he: 'יופי בריאות וטיפוח' },
  { slug: 'phones-computers', name_he: 'טלפונים מחשבים ואביזרים' },
  { slug: 'baby-kids', name_he: 'תינוקות וילדים' },
  { slug: 'vacation', name_he: 'צימרים ובתי מלון' },
  { slug: 'pets', name_he: 'ציוד ומזון לבעלי חיים' },
  { slug: 'professionals', name_he: 'בעלי מקצוע' },
  { slug: 'courses', name_he: 'קורסים Express – בקרוב . . .' },
]
