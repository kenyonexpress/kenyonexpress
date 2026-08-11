/**
 * The most recent of a set of timestamps, or undefined when there is none.
 *
 * WHY THE SITEMAP NEEDED THIS
 *
 * The four static entries carried `lastModified: new Date()`. A lastmod that is
 * always "now" carries no information: every fetch of the sitemap claims all
 * four pages changed since the last one. Google states the consequence plainly
 * — an inaccurate lastmod is ignored, and it is ignored for the WHOLE FILE, not
 * per URL, so four dishonest dates cost the accurate ones on every product too.
 *
 * `undefined` rather than a fallback of `new Date()`: an empty catalogue with a
 * lastmod of now is the same claim, made about nothing. Omitting the field says
 * "I do not know", which is both true and what the format is for.
 *
 * Lives in its own module because `sitemap.ts` is a `use cache` default export
 * and cannot be imported by a test without dragging `next/cache` in — which is
 * why its existing test reads the file as text.
 */
export function newestTimestamp(
  values: readonly (string | Date | null | undefined)[],
): Date | undefined {
  let best: number | null = null
  for (const value of values) {
    if (!value) continue
    const time = value instanceof Date ? value.getTime() : new Date(value).getTime()
    if (!Number.isNaN(time) && (best === null || time > best)) best = time
  }
  return best === null ? undefined : new Date(best)
}
