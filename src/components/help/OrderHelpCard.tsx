import { orderHelpLinks, orderShortId } from '@/lib/help/order-links'
import Link from 'next/link'

/**
 * The card at the top of `/help?order=<id>`: the order the customer came from,
 * named the way the rest of the site names it, and the places that answer the
 * usual questions about it without a message being written at all.
 */
export default function OrderHelpCard({ orderRef }: { orderRef: string }) {
  const links = orderHelpLinks(orderRef)

  return (
    <section
      aria-labelledby="order-help"
      data-testid="order-help"
      className="mb-8 max-w-3xl rounded-xl border border-heading/15 bg-heading/5 p-5"
    >
      <h2 id="order-help" className="text-lg font-bold text-heading">
        עזרה עם הזמנה{' '}
        <span dir="ltr" className="font-mono">
          {orderShortId(orderRef)}
        </span>
      </h2>
      <p className="mt-2 text-base leading-relaxed text-heading/85">
        רוב התשובות כבר נמצאות בעמוד ההזמנה. אם לא, הטופס למטה כבר ממולא במספר ההזמנה.
      </p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {links.map((link) =>
          link.external ? (
            <li key={link.href}>
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center rounded-lg border border-heading/20 bg-white px-4 py-2 text-sm font-medium text-heading hover:border-heading/40"
              >
                {link.label}
              </a>
            </li>
          ) : (
            <li key={link.href}>
              <Link
                href={link.href}
                className="inline-flex min-h-11 items-center rounded-lg border border-heading/20 bg-white px-4 py-2 text-sm font-medium text-heading hover:border-heading/40"
              >
                {link.label}
              </Link>
            </li>
          ),
        )}
      </ul>
    </section>
  )
}
