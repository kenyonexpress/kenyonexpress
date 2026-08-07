// Client-safe: no node built-ins, no sharp. Same constraint as validate.ts,
// because the upload UI is a client component and imports this.

/**
 * The Hebrew alt text an upload starts with.
 *
 * WHAT "AUTOMATIC" CAN HONESTLY MEAN HERE
 *
 * It cannot mean describing what is in the picture. Nothing on this path looks
 * at pixels, and a sentence invented about an image is worse than no sentence:
 * a screen reader reads it as fact, and a wrong one is not recoverable by the
 * person relying on it.
 *
 * What IS known at upload time is the entity the image belongs to and its
 * Hebrew name - the product being edited, the supplier whose logo this is, the
 * category getting an icon. That is a true statement about the image, in
 * Hebrew, and it is what this builds. It is a STARTING POINT, not a lock: the
 * field stays editable and `isValidHebrewAlt` still gates the upload, so an
 * admin who writes something better wins.
 *
 * The alternative that was rejected: leaving the field empty and mandatory. It
 * is what the pipeline did, and it makes the honest path (a real description)
 * and the lazy path (whatever passes the three-character check) equally easy,
 * while making the common case - one product, five photos - five identical
 * typings.
 */

export type AltSubjectKind = 'product' | 'supplier' | 'category' | 'deal'

const PREFIX: Record<AltSubjectKind, (subject: string) => string> = {
  product: (subject) => `תמונה של ${subject}`,
  supplier: (subject) => `הלוגו של ${subject}`,
  category: (subject) => `אייקון הקטגוריה ${subject}`,
  deal: (subject) => `תמונה של הדיל ${subject}`,
}

const HEBREW = /[\u0590-\u05FF]/

export interface AltSuggestionInput {
  kind: AltSubjectKind
  /** The entity's Hebrew name, as typed in the form next to the uploader. */
  subject: string | null | undefined
  /** 0-based position among the images being staged together. */
  index?: number
  /** How many are being staged together. */
  total?: number
}

/**
 * A Hebrew alt, or null when there is nothing true to say.
 *
 * Null rather than a generic filler: "תמונת מוצר" for every image in the
 * catalogue is what a screen reader user hears as silence with extra steps, and
 * it would pass the validator, which is exactly how a mandatory field becomes a
 * formality. A form with no name typed yet gets no suggestion and the admin
 * writes one.
 */
export function suggestAltHe(input: AltSuggestionInput): string | null {
  const subject = (input.subject ?? '').trim().replace(/\s+/g, ' ')
  if (subject.length < 2) return null
  // A Latin-only product name would produce an "alt in Hebrew" with no Hebrew
  // in it, which the validator would then reject - so it is refused here, where
  // the reason is visible, rather than silently prefilling an invalid value.
  if (!HEBREW.test(subject)) return null

  const base = PREFIX[input.kind](subject)
  const total = input.total ?? 1
  if (total <= 1 || input.index === undefined) return base
  // Several images of one thing are not the same image. The number is the only
  // thing that distinguishes them without claiming to know what they show.
  return `${base} — תמונה ${input.index + 1} מתוך ${total}`
}
