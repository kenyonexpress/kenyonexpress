// scripts/seed/data/categories.mjs
//
// The eight departments, taken from the live site rather than invented.
//
// WHICH EIGHT, AND WHY NOT THE OTHER FOUR
//
// src/components/store/CategoryNav.tsx renders eleven entries and the live
// database holds twelve category rows. Three of them are merchandising
// collections rather than departments: `hot-deals` (דיל חם), `under-99`
// (עד ₪99) and `new` (החדשים) describe a price or a date, and a product enters
// them by being cheap or recent, not by being what it is. A seed that assigned
// products to those rows would be inventing a taxonomy the site derives.
// `electronics` is the twelfth: it duplicates `phones-computers`, is absent
// from the live navigation, and exists in the database as a leftover.
//
// What remains is exactly eight, and it is the taxonomy every seeded product
// can be placed in honestly. slug, name_he, name_en and sort_order are copied
// from the live rows (read-only introspection of the hosted project on
// 2026-07-29), so seeding a database that already carries the live categories
// updates them in place instead of creating near-duplicates. Where the live
// navigation label differs from the stored name_he, the label is noted; the
// stored value wins, because that is what the database holds.

export const CATEGORIES = [
  {
    key: 'restaurants-cafes',
    slug: 'restaurants-cafes',
    name_he: 'מסעדות ובתי קפה',
    name_en: 'Restaurant & coffee',
    description_he:
      'ארוחות זוגיות, ארוחות עסקיות, בתי קפה ומאפיות ברחבי הארץ. כל הקופונים ניתנים למימוש ישירות בבית העסק.',
    sort_order: 4,
  },
  {
    key: 'beauty-health',
    slug: 'beauty-health',
    // Live navigation label: "יופי בריאות וטיפוח". The stored name_he is the
    // other word order; both appear on the live site.
    name_he: 'טיפוח בריאות ויופי',
    name_en: 'Health and Beauty Care',
    description_he:
      'טיפולי פנים, הסרת שיער בלייזר, מספרות, ציפורניים ותוספי תזונה. טיפולים במכונים מאושרים בלבד.',
    sort_order: 5,
  },
  {
    key: 'phones-computers',
    slug: 'phones-computers',
    // Live navigation label: "טלפונים מחשבים ואביזרים".
    name_he: 'טלפונים ואלקטרוניקה',
    name_en: 'phones electronics',
    description_he:
      'סמארטפונים, מחשבים ניידים, אוזניות, מטענים ואביזרים נלווים. אחריות יבואן רשמי על כל מוצר.',
    sort_order: 6,
  },
  {
    key: 'baby-kids',
    slug: 'baby-kids',
    name_he: 'תינוקות וילדים',
    name_en: 'Baby & Kids',
    description_he:
      'עגלות, כיסאות בטיחות, ריהוט לחדר ילדים, צעצועי התפתחות וחוגים. מוצרים בתקן ישראלי.',
    sort_order: 7,
  },
  {
    key: 'vacation',
    slug: 'vacation',
    // Live navigation label: "צימרים ובתי מלון".
    name_he: 'צימרים מלונות ונופש',
    name_en: 'Vacation',
    description_he:
      'צימרים בצפון ובדרום, מלונות בוטיק, ספא זוגי וחבילות סופ״ש. כפוף לזמינות ולתיאום מראש מול בית העסק.',
    sort_order: 8,
  },
  {
    key: 'pets',
    slug: 'pets',
    name_he: 'ציוד ומזון לבעלי חיים',
    name_en: 'Pets',
    description_he:
      'מזון יבש ורטוב, מיטות, כלובים, אביזרי טיפוח ומספרות לחיות מחמד. משלוח עד הבית.',
    sort_order: 9,
  },
  {
    key: 'professionals',
    slug: 'professionals',
    name_he: 'בעלי מקצוע',
    name_en: 'Professionals',
    description_he:
      'חשמלאים, אינסטלטורים, הובלות, ניקיון, צילום אירועים ושירותי משרד. בעלי מקצוע מדורגים בלבד.',
    sort_order: 10,
  },
  {
    key: 'courses',
    slug: 'courses',
    // Live navigation shows this one greyed out, labelled
    // "קורסים Express – בקרוב . . .". The row exists and carries products.
    name_he: 'קורסים Express בקרוב',
    name_en: 'Courses',
    description_he:
      'קורסים דיגיטליים והדרכות מקצועיות בעברית, בגישה מיידית לאחר הרכישה. המדור בהרצה.',
    sort_order: 11,
  },
]

export const CATEGORY_KEYS = CATEGORIES.map((category) => category.key)
