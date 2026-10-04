import Link from 'next/link'
import { CANONICAL_PATH, LEGAL_DOCS } from '../_content'

/**
 * The five legal pages, as one link list.
 *
 * One component rather than a copied `<ul>` per page, because the failure mode
 * of a copied list is a legal page that does not link to the policy it defers
 * to. The terms hand the cancellation question to the returns policy and the
 * privacy question to the privacy policy; if one of those links is missing on
 * one page, the deferral goes nowhere.
 *
 * It reads `LEGAL_DOCS`, so a fifth document appears here by existing.
 *
 * `current` drops the page's own link from the list and marks it, which is what
 * keeps it useful as a site-wide footer block too: rendered inside
 * `SiteFooter` (see docs/legal/README.md for the wiring) it needs no argument.
 */
export default function LegalFooterLinks({
  current,
  className,
}: {
  current?: string
  className?: string
}) {
  return (
    <nav aria-label="מסמכים משפטיים" className={className}>
      <ul className="legal-footer-links">
        {LEGAL_DOCS.map((doc) => {
          const isCurrent = doc.slug === current
          return (
            <li key={doc.slug}>
              {isCurrent ? (
                <span aria-current="page" className="legal-footer-links__current">
                  {doc.title}
                </span>
              ) : (
                <Link
                  href={CANONICAL_PATH[doc.slug]}
                  title={doc.description}
                  className="legal-footer-links__link"
                >
                  {doc.title}
                </Link>
              )}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
