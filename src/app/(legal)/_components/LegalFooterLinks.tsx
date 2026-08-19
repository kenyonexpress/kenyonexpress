import Link from 'next/link'
import { LEGAL_DOCS } from '../_content'

/**
 * The four legal pages, as one link list.
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
      <ul className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        {LEGAL_DOCS.map((doc) => {
          const isCurrent = doc.slug === current
          return (
            <li key={doc.slug}>
              {isCurrent ? (
                <span aria-current="page" className="font-semibold text-heading">
                  {doc.title}
                </span>
              ) : (
                <Link
                  href={`/legal/${doc.slug}`}
                  title={doc.description}
                  className="text-heading/80 underline underline-offset-4 hover:text-heading"
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
