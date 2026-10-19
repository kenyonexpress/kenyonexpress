import { permanentRedirect } from 'next/navigation'

/**
 * Permanently moved to `/cookie-policy`.
 *
 * Same arrangement as the other four documents in this route group: the text
 * lives in `(legal)/_content` and is rendered once, at the canonical path
 * under `(store)`. This stub exists so that `LegalFooterLinks`, which builds
 * every href as `/legal/<slug>`, keeps working without knowing which documents
 * have a legacy URL and which do not.
 */
export default function Page() {
  permanentRedirect('/cookie-policy')
}
