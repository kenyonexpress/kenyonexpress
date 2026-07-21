import type { Metadata } from 'next'
import Link from 'next/link'
import '@/styles/checkout-page.css'

export const metadata: Metadata = {
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
