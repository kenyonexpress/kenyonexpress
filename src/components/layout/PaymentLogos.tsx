/**
 * The footer's payment marks (UX13).
 *
 * BEFORE: the desktop copyright bar carried four TEXT badges ("Visa",
 * "Mastercard", "Discover", "American Express") and the handheld bar carried
 * none, so a phone never saw which cards the store takes. Live's own strip is
 * Electro's demo `patment-icon.webp` (Discover, MasterCard, PayPal, Skrill,
 * Visa): two of those five are not schemes an Israeli card acquirer charges
 * through at all, so the image is template decoration and not content, which
 * is why it is not sourced from live (docs/SOURCING-RULES.md).
 *
 * WHAT IS DRAWN. The five schemes an Israeli acquirer settles: Visa,
 * Mastercard, American Express, Isracard and Diners Club, each as a small
 * white badge with a simplified mark in the scheme's own colour. The colours
 * are tokens (`--color-payment-*`), so the raw-value gate holds and nothing
 * here is recoloured when `brand.*` moves. Inline SVG, not image files: the
 * marks are ~5 nodes each, paint with no request, and the blur manifest and
 * the template-asset scan never have to learn about them.
 *
 * ACCESSIBILITY. Each mark is `role="img"` with a Hebrew `aria-label` and a
 * `<title>`; `role="img"` makes the SVG's children presentational, so a screen
 * reader hears "ויזה" once and not "V I S A". The list itself is labelled
 * אמצעי תשלום.
 */

type Mark = { label: string; glyph: React.ReactNode }

const MARKS: Mark[] = [
  {
    label: 'ויזה',
    glyph: (
      <text
        x="20"
        y="17.5"
        textAnchor="middle"
        fontSize="12"
        fontStyle="italic"
        fontWeight="800"
        letterSpacing="-0.5"
        className="fill-payment-visa"
      >
        VISA
      </text>
    ),
  },
  {
    label: 'מאסטרקארד',
    glyph: (
      <>
        <circle cx="15" cy="13" r="8" className="fill-payment-mastercard-red" />
        <circle cx="25" cy="13" r="8" className="fill-payment-mastercard-orange" />
        {/* the lens where the two circles overlap */}
        <path
          d="M20 6.755A8 8 0 0 1 20 19.245A8 8 0 0 1 20 6.755Z"
          className="fill-payment-mastercard-overlap"
        />
      </>
    ),
  },
  {
    label: 'אמריקן אקספרס',
    glyph: (
      <>
        <rect x="4" y="4" width="32" height="18" rx="2" className="fill-payment-amex" />
        <text
          x="20"
          y="16.5"
          textAnchor="middle"
          fontSize="9"
          fontWeight="800"
          letterSpacing="0.5"
          className="fill-payment-badge"
        >
          AMEX
        </text>
      </>
    ),
  },
  {
    label: 'ישראכרט',
    glyph: (
      <>
        <text
          x="20"
          y="15"
          textAnchor="middle"
          fontSize="7.5"
          fontWeight="800"
          letterSpacing="0.2"
          className="fill-payment-isracard"
        >
          ISRACARD
        </text>
        <rect x="9" y="18" width="22" height="2" rx="1" className="fill-payment-isracard" />
      </>
    ),
  },
  {
    label: 'דיינרס קלאב',
    glyph: (
      <>
        <circle cx="20" cy="13" r="9" className="fill-payment-diners" />
        <circle cx="20" cy="13" r="6.2" className="fill-payment-badge" />
        <rect x="17.3" y="6.8" width="5.4" height="12.4" rx="2.7" className="fill-payment-diners" />
      </>
    ),
  },
]

export const PAYMENT_MARK_LABELS = MARKS.map((m) => m.label)

export default function PaymentLogos({ className = '' }: { className?: string }) {
  return (
    <ul
      className={`flex flex-wrap items-center justify-center gap-2 ${className}`.trim()}
      aria-label="אמצעי תשלום"
    >
      {MARKS.map((mark) => (
        <li key={mark.label} className="flex">
          <svg
            viewBox="0 0 40 26"
            width="40"
            height="26"
            role="img"
            aria-label={mark.label}
            className="rounded border border-black/15 bg-payment-badge"
          >
            <title>{mark.label}</title>
            {mark.glyph}
          </svg>
        </li>
      ))}
    </ul>
  )
}
