import Link from 'next/link'

/**
 * The three trust pages, linked from each other.
 *
 * A person who lands on "how it works" from a search result and then wants to
 * know what happens to their card has, without this, only the footer to get
 * there. These three pages answer one question between them and a reader
 * arrives in the middle of it.
 *
 * The current page is rendered as `aria-current="page"` and is NOT a link:
 * a link to the page you are on is a control that does nothing, and marking it
 * is what tells a screen reader where in the set it is.
 */

export const ABOUT_PAGES = [
  { href: '/about', label: 'אודות' },
  { href: '/about/how-it-works', label: 'איך זה עובד' },
  { href: '/about/payment-security', label: 'אבטחת תשלומים' },
] as const

export type AboutPath = (typeof ABOUT_PAGES)[number]['href']

export default function AboutNav({ current }: { current: AboutPath }) {
  return (
    <nav aria-label="עמודי אודות" className="mb-8">
      <ul className="flex flex-wrap gap-2">
        {ABOUT_PAGES.map((page) => {
          const isCurrent = page.href === current
          return (
            <li key={page.href}>
              {isCurrent ? (
                <span
                  aria-current="page"
                  className="inline-block rounded-full bg-brand px-4 py-2 text-sm font-semibold text-heading"
                >
                  {page.label}
                </span>
              ) : (
                <Link
                  href={page.href}
                  className="inline-block rounded-full border border-heading/15 px-4 py-2 text-sm font-medium text-heading/80 transition-colors hover:border-heading/30 hover:text-heading"
                >
                  {page.label}
                </Link>
              )}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
