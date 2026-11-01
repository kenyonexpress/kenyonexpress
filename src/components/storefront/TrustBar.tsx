import { Headphones, RotateCcw, ShieldCheck } from 'lucide-react'
import Link from 'next/link'

/**
 * Three reassurances next to the decision to pay: how the payment is taken,
 * what the cancellation terms are, and how to reach a person.
 *
 * EVERY LINE IS A FACT THE SITE ALREADY STATES ELSEWHERE, and that is the
 * rule for adding a fourth. `InfoBar.tsx` is the cautionary copy of this
 * component: five claims, four of them invented, two of them quantified
 * ("99%", "הזולים בארץ"). Here:
 *
 *   payment       The checkout form says the same sentence where the card is
 *                 entered (`CheckoutForm.tsx`).
 *   cancellation  Links to the policy page. It names the page and promises
 *                 nothing the page does not.
 *   service       Links to the contact page. NO HOURS: no opening hours are
 *                 recorded anywhere in this repository, and a bar that prints
 *                 "09:00-17:00" from a guess is a promise somebody has to
 *                 keep. When the real hours exist they go here.
 *
 * A server component with no state. It sits at the foot of the product page
 * and of the cart, below everything the comparison gate measures against the
 * reference, so it adds height at the end and moves nothing above it.
 */

const ITEMS = [
  {
    Icon: ShieldCheck,
    title: 'תשלום מאובטח',
    text: 'באשראי, באמצעות Cardcom',
    href: null,
  },
  {
    Icon: RotateCcw,
    title: 'ביטול והחזרים',
    text: 'למדיניות הביטול המלאה',
    href: '/refund_returns',
  },
  {
    Icon: Headphones,
    title: 'שירות לקוחות',
    text: 'לפנייה אלינו',
    href: '/contact',
  },
] as const

export default function TrustBar() {
  return (
    <section dir="rtl" aria-label="מידע על תשלום, ביטול ושירות" data-testid="trust-bar">
      <ul className="mx-auto mt-8 grid max-w-page grid-cols-1 border-t border-border-alt sm:grid-cols-3">
        {ITEMS.map(({ Icon, title, text, href }) => (
          <li key={title} className="flex items-center gap-3 px-4 py-4">
            <Icon size={28} strokeWidth={1.5} className="shrink-0 text-muted" aria-hidden="true" />
            <div>
              <p className="text-sm font-bold leading-tight text-ink">{title}</p>
              {href ? (
                <Link href={href} className="text-sm leading-tight text-muted underline">
                  {text}
                </Link>
              ) : (
                <p className="text-sm leading-tight text-muted">{text}</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
