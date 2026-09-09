/**
 * The golden query set (marathon step 9).
 *
 * Each entry is a canonical shopper journey: WHAT a real person types and
 * WHICH product must come back. The offline harness
 * (golden-queries.test.ts) runs the set in CI against a local matcher built
 * from the very pieces this repo ships to Meilisearch -- the synonym map,
 * the searchable-attribute order, the document projection -- so an edit to
 * any of them that breaks a canonical journey breaks the build, with no
 * index and no network. The same set is the acceptance list to replay
 * against the real index when one exists (ops runbook, stage 2).
 *
 * Keep entries SHOPPER-SHAPED. "מסעדה" finding a meal deal is a journey;
 * "name_he substring" is a unit test and belongs elsewhere.
 */

export type GoldenQuery = {
  /** Exactly what the shopper types. */
  query: string
  /** The slug that must be among the results. */
  expectSlug: string
  /** Why this journey is canonical -- shown when it fails. */
  reason: string
}

export type GoldenAbsence = {
  query: string
  /** A slug that must NOT match, guarding against over-broad synonyms. */
  absentSlug: string
  reason: string
}

export const GOLDEN_QUERIES: readonly GoldenQuery[] = [
  {
    query: 'מסעדה',
    expectSlug: 'dinner-for-two',
    reason: 'חצי מהקטלוג נקרא "ארוחה ..." בזמן שקונים מחפשים מסעדה; זו קבוצת הסינונים המרכזית',
  },
  {
    query: 'ארוחה זוגית',
    expectSlug: 'dinner-for-two',
    reason: 'השם המילולי של הדיל חייב להימצא כמו שהוא',
  },
  {
    query: 'המסעדה',
    expectSlug: 'dinner-for-two',
    reason: 'תחילית ה: הסינונים מכסים גם איות עם תחיליות עברית',
  },
  {
    query: 'עיסוי',
    expectSlug: 'spa-day',
    reason: 'ספא הוא קטגוריית הקופונים הגדולה ביותר, ועיסוי הוא איך מחפשים אותה',
  },
  {
    query: 'מסאז',
    expectSlug: 'spa-day',
    reason: 'איות לועזי נפוץ של אותה בקשה',
  },
  {
    query: 'חדר כושר',
    expectSlug: 'gym-membership',
    reason: 'ביטוי דו-מילי עם תחילית על המילה הראשונה בלבד',
  },
  {
    query: 'מתנה',
    expectSlug: 'gift-card-200',
    reason: 'שובר/קופון/מתנה הם מסלול הכניסה של קניית מתנות',
  },
  {
    query: 'צימר',
    expectSlug: 'weekend-getaway',
    reason: 'נופש/מלון/צימר מתלכדים; הדיל נקרא "סופ״ש נופש"',
  },
  {
    query: 'קפה תל אביב',
    expectSlug: 'coffee-tlv',
    reason: 'שאילתת מקום-ודבר: העיר היא אות חזק יותר מפסקת שיווק',
  },
] as const

export const GOLDEN_ABSENCES: readonly GoldenAbsence[] = [
  {
    query: 'עיסוי',
    absentSlug: 'gym-membership',
    reason: 'פינוק וכושר הן קבוצות סינונים נפרדות; זליגה ביניהן היא סינון רחב מדי',
  },
  {
    query: 'מסעדה',
    absentSlug: 'spa-day',
    reason: 'אוכל וספא לא באותה קבוצה; דיל ספא על שאילתת מסעדה הוא רעש',
  },
] as const
