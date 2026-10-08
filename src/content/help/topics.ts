import type { FaqEntry } from '@/content/legal/faq'

/**
 * The shelves of the help centre (`/help`, STEP 50).
 *
 * A topic is a TypeScript union and not a database row for the same reason the
 * notification categories are (STEP 49): the FAQ it groups is a committed
 * array, the contact form that names it is a server action, and the mail it
 * produces is read by a person. Nothing would ever query it. The order below
 * is the order the page renders, and the order the form's `<select>` lists.
 *
 * `other` has no FAQ of its own. It exists so the form never forces a reader
 * to misfile a question, and `groupFaqByTopic` omits an empty shelf.
 */
export const HELP_TOPICS = [
  {
    id: 'orders',
    label: 'הזמנות ותשלום',
    blurb: 'מה משלמים באתר, מה משלמים בבית העסק, ואיך התשלום מאובטח.',
  },
  {
    id: 'coupons',
    label: 'קופונים ומימוש',
    blurb: 'איך מקבלים את הקופון, איפה הוא נמצא, ומה עושים עם התוקף.',
  },
  {
    id: 'refunds',
    label: 'ביטולים והחזרים',
    blurb: 'איך מבטלים, מה קורה אחרי מימוש, ואיך מקבלים את הכסף בחזרה.',
  },
  {
    id: 'account',
    label: 'חשבון, ארנק וחשבוניות',
    blurb: 'הארנק, הזיכויים, החשבוניות וההזמנות שלכם באזור האישי.',
  },
  {
    id: 'business',
    label: 'בתי עסק וספקים',
    blurb: 'מי מספק את השירות, ואיך בית עסק מצטרף לאתר.',
  },
  {
    id: 'other',
    label: 'משהו אחר',
    blurb: 'כל שאלה שלא מצאה לעצמה מדף.',
  },
] as const

export type HelpTopicId = (typeof HELP_TOPICS)[number]['id']

export type HelpTopic = (typeof HELP_TOPICS)[number]

const TOPIC_IDS: ReadonlySet<string> = new Set(HELP_TOPICS.map((t) => t.id))

export function isHelpTopicId(value: unknown): value is HelpTopicId {
  return typeof value === 'string' && TOPIC_IDS.has(value)
}

export function helpTopic(id: HelpTopicId): HelpTopic {
  const found = HELP_TOPICS.find((t) => t.id === id)
  if (!found) throw new Error(`unknown help topic: ${id}`)
  return found
}

export function helpTopicLabel(id: HelpTopicId): string {
  return helpTopic(id).label
}

/** The `id` attribute of a topic's shelf on `/help`, so a link can land on it. */
export function helpTopicAnchor(id: HelpTopicId): string {
  return `topic-${id}`
}

export interface HelpShelf {
  topic: HelpTopic
  entries: readonly FaqEntry[]
}

/**
 * The FAQ, one shelf per topic, in `HELP_TOPICS` order, with the empty shelves
 * dropped. The entries keep their order within a shelf, so `/faq` and `/help`
 * never disagree about which answer comes first.
 */
export function groupFaqByTopic(entries: readonly FaqEntry[]): HelpShelf[] {
  return HELP_TOPICS.map((topic) => ({
    topic,
    entries: entries.filter((entry) => entry.topic === topic.id),
  })).filter((shelf) => shelf.entries.length > 0)
}
