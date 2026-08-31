import { permanentRedirect } from 'next/navigation'

/**
 * Permanently moved to `/accessibility`.
 *
 * This route group held the better-sourced legal text on paths nothing linked
 * to, while the linked, indexed paths served an older second set. Two indexable
 * sets of terms is the exact failure `legal-routes.test.ts` was written to
 * prevent, and `(legal)/layout.tsx` had been holding the line with `noindex`
 * rather than deciding which text binds.
 *
 * It is decided now, and in the direction that costs nothing: the newer text
 * moved to the older URL. A 308 rather than a soft link, so a search engine
 * that indexed `/legal/accessibility` while it was briefly reachable transfers to the
 * canonical path instead of holding a second copy.
 */
export default function Page() {
  permanentRedirect('/accessibility')
}
