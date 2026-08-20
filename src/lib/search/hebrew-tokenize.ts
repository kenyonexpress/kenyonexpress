/**
 * Normalising and splitting a Hebrew search query before it reaches an engine.
 *
 * WHAT ACTUALLY GOES WRONG WITHOUT THIS, and none of it is theoretical:
 *
 *   BIDI CONTROL CHARACTERS. A shopper who copies a product name out of a
 *   WhatsApp message or an RTL PDF brings U+200F (RLM), U+202B (RLE) or
 *   U+2067 (RLI) along with the words. They are invisible, they have zero
 *   width, and they are not whitespace: `"‏מסעדה"` is one token that is
 *   not equal to `"מסעדה"`, so the search returns nothing and the shopper sees
 *   a catalogue that does not contain a word they can see on the screen.
 *
 *   NIQQUD AND CANTILLATION. The Hebrew block's combining marks. They appear in
 *   anything copied from a liturgical or children's text, and מִסְעָדָה shares no
 *   token with מסעדה.
 *
 *   GERSHAYIM. Hebrew acronyms are written with U+05F4: צה"ל, ר"ג, ק"ג. The
 *   mark is punctuation, so a tokeniser splits the acronym in two and the
 *   halves match nothing. Removing it joins the letters back into one word.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO:
 *
 *   NO FINAL-LETTER FOLDING. ם/מ, ן/נ, ץ/צ, ף/פ, ך/כ are different letters in
 *   the index too, because Meilisearch does not fold them either. Folding here
 *   and not there would make the query and the documents disagree, which is
 *   worse than both being strict.
 *
 *   NO PREFIX STRIPPING. Hebrew glues ה, ו, ב, ל, מ, ש, כ onto the front of a
 *   word, and a general stripper turns משהו into שהו and ברזל into רזל - real
 *   words, wrong ones. The prefixed forms are declared per term in
 *   lib/search/hebrew-synonyms.ts, where the base word is known.
 */

/**
 * Zero-width and bidi formatting characters. Every one of these can sit inside
 * a pasted query without being visible anywhere.
 *
 * U+200B..U+200D  zero-width space / non-joiner / joiner
 * U+200E, U+200F  LRM, RLM
 * U+202A..U+202E  the embedding/override run: LRE RLE PDF LRO RLO
 * U+2066..U+2069  the isolate run: LRI RLI FSI PDI
 * U+FEFF          BOM, which arrives at the head of anything pasted from a file
 */
const BIDI_AND_ZERO_WIDTH = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g

/**
 * Hebrew combining marks: cantillation, niqqud, dagesh, meteg, rafe, sin/shin
 * dots and qamats qatan.
 *
 * The range is written out rather than given as U+0591-U+05C7 because that span
 * also holds maqaf (U+05BE), paseq (U+05C0) and sof pasuq (U+05C3), which are
 * PUNCTUATION. Maqaf in particular joins two words the way a hyphen does;
 * deleting it would glue them into one token that matches nothing. They fall
 * through to NON_TOKEN below and become boundaries, which is what they are.
 */
const HEBREW_POINTS = /[\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]/g

/**
 * Geresh and gershayim, the Hebrew punctuation forms, plus the ASCII quotes
 * people type instead of them.
 *
 * Removed rather than replaced with a space: they sit INSIDE a word (צה"ל,
 * ג'ינס), so replacing them with a separator produces two fragments where the
 * shopper meant one word.
 */
const HEBREW_PUNCTUATION = /[\u05F3\u05F4'"`\u2018\u2019\u201C\u201D]/g

/** Anything that is not a letter, a digit or a space is a token boundary. */
const NON_TOKEN = /[^\p{L}\p{N}\s]+/gu

/** Long enough for any real product name; past it, a query is an attack or a paste. */
export const MAX_QUERY_LENGTH = 80

/**
 * The canonical form of a typed query.
 *
 * Order matters: points are stripped only after the invisible characters are
 * gone, because a bidi mark between a letter and its point would otherwise
 * survive as a token of its own.
 */
export function normalizeSearchQuery(input: string): string {
  return input
    .normalize('NFC')
    .replace(BIDI_AND_ZERO_WIDTH, '')
    .replace(HEBREW_POINTS, '')
    .replace(HEBREW_PUNCTUATION, '')
    .replace(NON_TOKEN, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_QUERY_LENGTH)
}

/**
 * The normalised query split into words.
 *
 * Used by the Postgres fallback, which builds one ILIKE per token and has to
 * know where the words are; the engine does its own tokenising and only needs
 * `normalizeSearchQuery`.
 */
export function tokenizeSearchQuery(input: string): string[] {
  const normalized = normalizeSearchQuery(input)
  if (!normalized) return []
  return normalized.split(' ').filter((token) => token.length > 0)
}

/** True when the string contains at least one Hebrew letter (U+05D0-U+05EA). */
export function hasHebrew(input: string): boolean {
  return /[\u05D0-\u05EA]/.test(input)
}

/**
 * The `dir` an input should carry for this value.
 *
 * The UI is RTL throughout, so 'rtl' is the default and the only case worth
 * detecting is a value that is entirely Latin - a SKU, a brand, an email -
 * where an RTL box puts the caret and the punctuation on the wrong side.
 */
export function queryDirection(input: string): 'rtl' | 'ltr' {
  const trimmed = input.trim()
  if (!trimmed) return 'rtl'
  if (hasHebrew(trimmed)) return 'rtl'
  return /[A-Za-z]/.test(trimmed) ? 'ltr' : 'rtl'
}
