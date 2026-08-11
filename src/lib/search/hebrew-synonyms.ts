/**
 * Hebrew synonyms for the product index.
 *
 * WHY THIS FILE HAS TO EXIST AT ALL. Meilisearch has no Hebrew morphology.
 * There is no stemmer, no lemmatiser, and no awareness that מסעדה and מסעדות
 * are one word. Typo tolerance does not cover it either: מסעדה → מסעדות is two
 * edits on a five-letter word, which is outside the budget on purpose, because
 * a two-edit budget on short Hebrew words matches half the catalogue. So plural
 * forms and the prefixes Hebrew glues onto a word have to be declared.
 *
 * SYNONYMS IN MEILISEARCH ARE ONE-WAY. `{"מסעדה": ["מסעדות"]}` means a search
 * for מסעדה also matches מסעדות, and NOT the reverse. Declaring one direction
 * is the mistake this file is built to make impossible: `buildSynonyms` expands
 * every group into every ordered pair, so a group of four terms produces four
 * entries each listing the other three.
 *
 * THE PREFIX PROBLEM. Hebrew writes ה, ו, ב, ל, מ, ש and כ as letters attached
 * to the front of the word: המסעדה is "the restaurant", למסעדה is "to the
 * restaurant". A shopper types them without thinking. Rather than a general
 * stripper - which would turn משהו into שהו and ברזל into רזל, both real words
 * - the prefixed forms are generated only for the terms in these groups, where
 * we know what the base word is.
 *
 * WHAT IS DELIBERATELY NOT HERE. No brand names, no supplier names, and no
 * "restaurant = pizza" style narrowing. A synonym that is not a synonym makes
 * results confidently wrong, and a shopper who searched for one thing and got
 * another cannot tell whether the catalogue lacks it.
 */

/**
 * The prefixes worth generating. Attached letters that change grammar, not
 * meaning.
 *
 * ה  the        ו  and       ב  in
 * ל  to         מ  from      ש  that
 * כ  as
 */
export const HEBREW_PREFIXES = ['ה', 'ו', 'ב', 'ל', 'מ', 'ש', 'כ'] as const

/**
 * Groups of terms that mean the same thing to a shopper.
 *
 * Each group is fully interchangeable IN BOTH DIRECTIONS - that is the test to
 * apply before adding a term. "מסעדה" and "אוכל" pass: somebody searching
 * either would be glad to see the other's results. "מסעדה" and "פיצה" would
 * not: pizza results for a restaurant search are a narrowing the shopper did
 * not ask for.
 */
export const SYNONYM_GROUPS: readonly (readonly string[])[] = [
  // Eating out. `ארוחה` earns its place because half the coupon catalogue is
  // named "ארוחה זוגית" while shoppers search מסעדה.
  ['מסעדה', 'מסעדות', 'אוכל', 'ארוחה', 'ארוחות', 'מסעדן'],
  ['בית קפה', 'בתי קפה', 'קפה', 'קפיטריה'],
  ['בר', 'ברים', 'פאב', 'פאבים'],

  // Pampering. The single largest coupon category in this catalogue.
  ['ספא', 'ספאים', 'עיסוי', 'עיסויים', 'פינוק', 'מסאז', 'מסאז׳'],
  ['טיפוח', 'קוסמטיקה', 'יופי'],
  ['מספרה', 'מספרות', 'תספורת', 'תספורות'],

  // Getting away.
  ['נופש', 'חופשה', 'חופשות', 'מלון', 'מלונות', 'צימר', 'צימרים'],
  ['אטרקציה', 'אטרקציות', 'חוויה', 'חוויות', 'בילוי', 'בילויים'],

  // Movement.
  ['כושר', 'חדר כושר', 'ספורט', 'אימון', 'אימונים'],

  // Occasions, which is how a lot of coupon shopping actually starts.
  ['מתנה', 'מתנות', 'שובר', 'שוברים', 'גיפט', 'קופון', 'קופונים'],
  ['יום הולדת', 'יומולדת', 'הולדת'],
  ['זוגי', 'זוגית', 'רומנטי', 'רומנטית', 'לזוג'],
] as const

/**
 * A term plus every prefixed spelling of it.
 *
 * Multi-word terms are prefixed on the FIRST word only, because that is where
 * Hebrew attaches: "בבית קפה", never "בית בקפה".
 */
export function withHebrewPrefixes(term: string): string[] {
  const trimmed = term.trim()
  if (!trimmed) return []

  const [head, ...rest] = trimmed.split(/\s+/)
  if (!head) return []
  const tail = rest.length > 0 ? ` ${rest.join(' ')}` : ''

  // Only for words long enough that a prefixed form is not just another word.
  // At two letters, ב + ר is בר, which is a term in this very file.
  if (head.length < 3) return [trimmed]

  return [trimmed, ...HEBREW_PREFIXES.map((prefix) => `${prefix}${head}${tail}`)]
}

/**
 * Expands the groups into the map Meilisearch wants.
 *
 * Every term maps to every OTHER term in its group, and to every prefixed
 * spelling of them. The term's own prefixed spellings also become keys, so a
 * shopper typing המסעדה gets the whole group rather than only exact matches on
 * that one spelling.
 */
export function buildSynonyms(
  groups: readonly (readonly string[])[] = SYNONYM_GROUPS,
): Record<string, string[]> {
  const map: Record<string, Set<string>> = {}

  for (const group of groups) {
    for (const term of group) {
      const others = group.filter((other) => other !== term)
      // Every spelling of the term is a key, so the prefixed forms a shopper
      // actually types resolve too.
      for (const key of withHebrewPrefixes(term)) {
        if (!map[key]) map[key] = new Set<string>()
        const bucket = map[key] as Set<string>
        for (const other of others) {
          for (const spelling of withHebrewPrefixes(other)) {
            // A key must never list itself: Meilisearch treats that as a
            // no-op at best, and it makes the settings diff unreadable.
            if (spelling !== key) bucket.add(spelling)
          }
        }
      }
    }
  }

  const out: Record<string, string[]> = {}
  for (const [key, values] of Object.entries(map)) {
    // Sorted so the settings payload is stable between deploys and a real
    // change is visible in a diff.
    out[key] = [...values].sort()
  }
  return out
}
