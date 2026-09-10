import type { Metadata } from 'next'
import Link from 'next/link'
import '@/styles/checkout-page.css'

export const metadata: Metadata = {
  // NOINDEX, and the canonical is the reason rather than the crawl budget.
  // The root layout declares `alternates.canonical: '/'` and Next inherits
  // metadata, so a page that sets neither tells Google it IS the home page -
  // measured 2026-09-10 on sixteen public routes, this one among them. A
  // duplicate-content signal pointing at the home page from a login form is
  // worse than the page being crawled at all. robots.txt disallows several of
  // these too, and that stops the crawl, not the indexing of a URL somebody
  // links to.
  robots: { index: false, follow: true },
  // A SELF-CANONICAL BESIDE THE NOINDEX, and the pair is deliberate. Without it
  // this page inherits the root layout's canonical of '/', and noindex plus a
  // canonical pointing at ANOTHER url is a contradiction Google resolves by
  // following the canonical - which would aim the noindex at the home page. The
  // same url in both fields says exactly one thing: do not index this, and it
  // stands for nothing else.
  alternates: { canonical: '/checkout/failed' },
  title: 'התשלום נכשל',
}

export default function CheckoutFailedPage() {
  return (
    <div className="checkout-page">
      <div className="checkout-pending">
        <h1 className="checkout-success__title">התשלום לא הושלם</h1>
        <p className="checkout-success__sub">החיוב לא בוצע. אפשר לנסות שוב, העגלה שלך נשמרה.</p>
        <p>
          <Link href="/cart" className="checkout-pay-btn" style={{ display: 'inline-flex' }}>
            חזרה לעגלה
          </Link>
        </p>
      </div>
    </div>
  )
}
