import Link from 'next/link'
import type { ReactNode } from 'react'

/**
 * The empty state of an account list: orders, coupons (S33, 06.11.2026).
 *
 * Until now an empty list was one grey sentence, and on the coupons page
 * nothing else: a customer who had bought nothing was told so and left on a
 * page with no way forward except the nav. An empty list is the one moment the
 * account area can usefully point back at the shop, so this says what will
 * appear here and offers the way to make it appear.
 *
 * The first line keeps the `account-empty` class the other account lists use,
 * so the copy reads the same weight everywhere, and the action is the account
 * area's own primary button (Electro's yellow, see account-electro.css). The
 * icon is decoration and is hidden from a screen reader; the sentence carries
 * the meaning.
 *
 * `role="status"` is deliberately NOT set: this is page content present on
 * first render, not an update, and announcing it as one makes a screen reader
 * read it twice.
 */
export default function AccountEmptyState({
  icon,
  title,
  hint,
  href,
  cta,
  testId,
}: {
  icon: ReactNode
  title: string
  hint: string
  href: string
  cta: string
  testId?: string
}) {
  return (
    <div className="account-empty-state" data-testid={testId}>
      <span className="account-empty-state__icon" aria-hidden="true">
        {icon}
      </span>
      <p className="account-empty account-empty-state__title">{title}</p>
      <p className="account-empty-state__hint">{hint}</p>
      <p className="account-empty-state__actions">
        <Link className="account-btn account-btn--primary" href={href}>
          {cta}
        </Link>
      </p>
    </div>
  )
}
