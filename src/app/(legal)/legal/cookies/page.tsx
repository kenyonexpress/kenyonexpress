import { permanentRedirect } from 'next/navigation'

/**
 * `/legal/cookies` never served a document, and never will: the cookie policy
 * was born at `/cookies` (W02, 05.10.2026). This stub exists only so the five
 * `/legal/*` paths behave alike, which is what `legal-duplication.test.ts`
 * and `legal-pages.test.ts` check: one redirect per document, one page per
 * document, and nothing that renders twice.
 */
export default function Page() {
  permanentRedirect('/cookies')
}
