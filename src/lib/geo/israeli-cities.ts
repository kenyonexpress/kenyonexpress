import { CITIES } from '@/lib/geo/cities'

/**
 * Israeli localities for the checkout city field, and the matcher behind its
 * suggestions.
 *
 * WHY A SECOND LIST NEXT TO `cities.ts`. That table is fifteen cities WITH
 * coordinates, and every entry in it is load bearing: the hero tags, "deals
 * near me" and the delivery estimate all compute from its lat/lng. A shopper
 * typing an address lives in one of about 1,200 localities, and inventing a
 * coordinate for each of them so they could share that table would put a
 * guessed number under a distance calculation. So this list carries NAMES
 * only, which is all a suggestion needs, and the fifteen are members of it
 * (pinned by test) so a picked city still attaches to the estimate through
 * `cityByName`.
 *
 * WHY SUGGEST AND NOT RESTRICT. The list is the larger municipalities and
 * local councils, not the whole country. A shopper in a moshav the list does
 * not know must still be able to type it and buy; the field stays free text,
 * `validateAddressStep` requires only that it is not blank, and the courier
 * reads what was typed. A closed list would turn "your village is not in our
 * dropdown" into "you cannot order", which is the wrong failure for a shop.
 *
 * The names are the official Hebrew spellings as the Central Bureau of
 * Statistics publishes them (public geographic fact, not business data), with
 * the spellings people actually type carried as aliases so "פתח תקוה" and
 * "פ"ת" both land on the one canonical row.
 */

export type IsraeliCity = {
  /** The canonical name, as it is inserted into the field and stored. */
  name: string
  /** Other spellings and abbreviations that resolve to this row. */
  aliases: readonly string[]
}

const ENTRY = (name: string, ...aliases: string[]): IsraeliCity => ({ name, aliases })

/**
 * Roughly by population, so the ties in a prefix search (both "רמת גן" and
 * "רמת השרון" match "רמת") come out in the order a shopper would expect.
 */
export const ISRAELI_CITIES: readonly IsraeliCity[] = [
  ENTRY('ירושלים', 'י-ם', 'ירושלם'),
  ENTRY('תל אביב', 'תל אביב-יפו', 'תל אביב יפו', 'ת"א', 'יפו'),
  ENTRY('חיפה'),
  ENTRY('ראשון לציון', 'ראשל"צ', 'ראשון'),
  ENTRY('פתח תקווה', 'פתח תקוה', 'פ"ת'),
  ENTRY('אשדוד'),
  ENTRY('נתניה'),
  ENTRY('באר שבע', 'ב"ש'),
  ENTRY('בני ברק', 'ב"ב'),
  ENTRY('חולון'),
  ENTRY('רמת גן', 'ר"ג'),
  ENTRY('אשקלון'),
  ENTRY('רחובות'),
  ENTRY('בת ים'),
  ENTRY('בית שמש'),
  ENTRY('כפר סבא', 'כ"ס'),
  ENTRY('הרצליה'),
  ENTRY('חדרה'),
  ENTRY('מודיעין-מכבים-רעות', 'מודיעין', 'מודיעין מכבים רעות'),
  ENTRY('נצרת'),
  ENTRY('לוד'),
  ENTRY('רמלה'),
  ENTRY('רעננה'),
  ENTRY('רהט'),
  ENTRY('הוד השרון'),
  ENTRY('גבעתיים'),
  ENTRY('קריית אתא'),
  ENTRY('נהריה'),
  ENTRY('קריית גת'),
  ENTRY('אום אל-פחם', 'אום אל פחם'),
  ENTRY('אילת'),
  ENTRY('עכו'),
  ENTRY('אלעד'),
  ENTRY('ראש העין'),
  ENTRY('עפולה'),
  ENTRY('נס ציונה'),
  ENTRY('רמת השרון'),
  ENTRY('כרמיאל'),
  ENTRY('טבריה'),
  ENTRY('יבנה'),
  ENTRY('קריית מוצקין'),
  ENTRY('טייבה'),
  ENTRY('מודיעין עילית', 'קריית ספר'),
  ENTRY('ביתר עילית'),
  ENTRY('שפרעם'),
  ENTRY('אור יהודה'),
  ENTRY('מעלה אדומים'),
  ENTRY('נוף הגליל', 'נצרת עילית'),
  ENTRY('קריית ביאליק'),
  ENTRY('קריית ים'),
  ENTRY('קריית אונו'),
  ENTRY('דימונה'),
  ENTRY('צפת'),
  ENTRY('טמרה'),
  ENTRY('נתיבות'),
  ENTRY('סחנין'),
  ENTRY('יהוד-מונוסון', 'יהוד', 'יהוד מונוסון'),
  ENTRY('באקה אל-גרבייה', 'באקה אל גרבייה', 'באקה'),
  ENTRY('אופקים'),
  ENTRY('גבעת שמואל'),
  ENTRY('טירה'),
  ENTRY('ערד'),
  ENTRY('מגדל העמק'),
  ENTRY('שדרות'),
  ENTRY('עראבה'),
  ENTRY('כפר קאסם'),
  ENTRY('קלנסווה'),
  ENTRY('נשר'),
  ENTRY('קריית שמונה', 'ק"ש'),
  ENTRY('כפר יונה'),
  ENTRY('אריאל'),
  ENTRY('טירת כרמל'),
  ENTRY('אור עקיבא'),
  ENTRY('מעלות-תרשיחא', 'מעלות', 'מעלות תרשיחא'),
  ENTRY('יקנעם עילית', 'יקנעם'),
  ENTRY('קריית מלאכי'),
  ENTRY('בית שאן'),
  ENTRY('גני תקווה'),
  ENTRY('פרדס חנה-כרכור', 'פרדס חנה', 'פרדס חנה כרכור'),
  ENTRY('שוהם'),
  ENTRY('גדרה'),
  ENTRY('מבשרת ציון'),
  ENTRY('באר יעקב'),
  ENTRY('זכרון יעקב'),
  ENTRY('קדימה-צורן', 'קדימה', 'צורן'),
  ENTRY('אבן יהודה'),
  ENTRY('תל מונד'),
  ENTRY('בנימינה-גבעת עדה', 'בנימינה', 'גבעת עדה'),
  ENTRY('גן יבנה'),
  ENTRY('מזכרת בתיה'),
  ENTRY('קריית עקרון'),
  ENTRY('גבעת זאב'),
  ENTRY('אפרת'),
  ENTRY('עומר'),
  ENTRY('להבים'),
  ENTRY('מיתר'),
  ENTRY('ירוחם'),
  ENTRY('מצפה רמון'),
  ENTRY('ראש פינה'),
  ENTRY('קצרין'),
  ENTRY('חצור הגלילית'),
  ENTRY('כוכב יאיר-צור יגאל', 'כוכב יאיר', 'צור יגאל'),
  ENTRY('אורנית'),
  ENTRY('אלפי מנשה'),
  ENTRY('קרני שומרון'),
  ENTRY('סביון'),
  ENTRY('בית דגן'),
  ENTRY('עתלית'),
  ENTRY('קיסריה'),
  ENTRY('כפר ורדים'),
  ENTRY('שלומי'),
  ENTRY('מטולה'),
  ENTRY('כפר תבור'),
  ENTRY('יבנאל'),
  ENTRY('מגדל'),
  ENTRY('דאלית אל-כרמל', 'דלית אל כרמל'),
  ENTRY('עספיא'),
  ENTRY('אבו גוש'),
  ENTRY('כפר כנא'),
  ENTRY('ריינה'),
  ENTRY('יפיע'),
  ENTRY('כפר מנדא'),
  ENTRY("מג'ד אל-כרום", "מג'ד אל כרום"),
  ENTRY("ג'לג'וליה"),
  ENTRY('כפר קרע'),
  ENTRY('ערערה'),
  ENTRY('ירכא'),
  ENTRY('אבו סנאן'),
  ENTRY('כפר יאסיף'),
  ENTRY("ג'דיידה-מכר", "ג'דיידה מכר"),
  ENTRY('טורעאן'),
  ENTRY('זרזיר'),
  ENTRY('כפר ברא'),
  ENTRY("ג'ת"),
  ENTRY('זמר'),
  ENTRY('פוריידיס'),
  ENTRY("ג'סר א-זרקא", "ג'סר א זרקא"),
  ENTRY('חורפיש'),
  ENTRY("ג'וליס"),
  ENTRY('מזרעה'),
  ENTRY('כאבול'),
  ENTRY('נחף'),
  ENTRY('דיר אל-אסד', 'דיר אל אסד'),
  ENTRY('בענה'),
  ENTRY("מג'אר"),
  ENTRY('בית אל'),
  ENTRY('הר אדר'),
  ENTRY('יסוד המעלה'),
]

/**
 * What two spellings have to agree on to be the same place.
 *
 * Hyphen, maqaf and any run of spaces collapse to one space; the geresh and
 * gershayim in abbreviations (ראשל"צ, ג'ת) are kept as a plain apostrophe or
 * dropped when they are a double quote, because a phone keyboard offers
 * three different glyphs for each. "קרית" and "קריית" are one word.
 */
export function normalizeCityQuery(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[״"]/g, '')
    .replace(/[׳’`]/g, "'")
    .replace(/[\s\-־–—]+/g, ' ')
    .replace(/(^| )קרית /g, '$1קריית ')
    .replace(/^עיר /, '')
}

type Indexed = { city: IsraeliCity; norm: string; words: string[]; rank: number }

const INDEX: readonly Indexed[] = ISRAELI_CITIES.flatMap((city, rank) =>
  [city.name, ...city.aliases].map((label) => {
    const norm = normalizeCityQuery(label)
    return { city, norm, words: norm.split(' '), rank }
  }),
)

const BY_NORM = new Map<string, IsraeliCity>()
for (const entry of INDEX) {
  if (!BY_NORM.has(entry.norm)) BY_NORM.set(entry.norm, entry.city)
}

/** The canonical row a typed value names, or null when it names nothing known. */
export function resolveIsraeliCity(value: string | null | undefined): IsraeliCity | null {
  if (!value) return null
  return BY_NORM.get(normalizeCityQuery(value)) ?? null
}

export const CITY_SUGGESTION_LIMIT = 8

/**
 * The cities to offer under the field for what has been typed so far.
 *
 * Prefix of the whole name first, then prefix of any later word ("סבא" finds
 * כפר סבא), each group in list order. Aliases match but the NAME is what is
 * offered, once per city, so "פתח תקוה" typed old-style suggests the one
 * canonical spelling rather than two rows that mean the same place. An empty
 * query offers nothing: the list is not a dropdown to scroll, it is an
 * answer to typing.
 */
export function suggestCities(query: string, limit = CITY_SUGGESTION_LIMIT): IsraeliCity[] {
  const needle = normalizeCityQuery(query)
  if (needle === '' || limit <= 0) return []

  const scored: { city: IsraeliCity; score: number; rank: number }[] = []
  const seen = new Set<string>()

  for (const entry of INDEX) {
    let score: number | null = null
    if (entry.norm.startsWith(needle)) score = 0
    else if (entry.words.some((word, index) => index > 0 && word.startsWith(needle))) score = 1
    if (score === null) continue
    if (seen.has(entry.city.name)) {
      const existing = scored.find((row) => row.city === entry.city)
      if (existing && score < existing.score) existing.score = score
      continue
    }
    seen.add(entry.city.name)
    scored.push({ city: entry.city, score, rank: entry.rank })
  }

  return scored
    .sort((a, b) => a.score - b.score || a.rank - b.rank)
    .slice(0, limit)
    .map((row) => row.city)
}

/** The fifteen from `cities.ts`, so a test can pin that each is offered here too. */
export function estimateCityNames(): string[] {
  return CITIES.map((city) => city.name)
}
