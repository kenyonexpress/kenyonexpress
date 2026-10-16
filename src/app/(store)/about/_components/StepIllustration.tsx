import type { TrustStep } from '../_content/trust'

/**
 * The drawings for the step flows.
 *
 * INLINE SVG, NOT AN IMAGE FILE AND NOT AN ICON PACKAGE. Three reasons, in
 * order of how much they cost when ignored:
 *
 * 1. `currentColor` on every stroke. These sit on a brand-yellow disc where the
 *    ink is `--color-heading`, and the a11y gate in
 *    `src/lib/a11y/brand-contrast.test.ts` exists because white on the brand
 *    yellow measures 1.41:1 and shipped twice. A drawing that inherits the text
 *    colour cannot drift away from the colour that was checked. The hex is
 *    deliberately not quoted here: `src/styles/tokens.test.ts` fails any
 *    component carrying a raw one, comments included, and it is right to.
 * 2. No network request and no layout shift. These are above the fold on both
 *    flow pages, and six PNGs would be six requests for six small line drawings.
 * 3. `lucide-react` has no glyph for "a voucher being scanned at a counter",
 *    which is the one drawing on the page that carries any meaning. Half a set
 *    from a package and half drawn here would look like two sets.
 *
 * `aria-hidden` on all of them: each one repeats the step title that sits
 * beside it, and a screen reader that announced both would read every step
 * twice. The number in the corner is decorative for the same reason, the
 * ordered list already conveys the order.
 */

const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

/** Keyed by `TrustStep['icon']`, so an unknown key is a type error, not a blank. */
const PATHS: Record<TrustStep['icon'], React.ReactNode> = {
  // A tag with a price hole: choosing a deal.
  browse: (
    <>
      <path d="M20.5 13.5 13.4 20.6a2 2 0 0 1-2.8 0l-7.2-7.2a2 2 0 0 1-.6-1.4V4.4a2 2 0 0 1 2-2h7.6a2 2 0 0 1 1.4.6l6.7 6.7a2 2 0 0 1 0 2.8Z" />
      <circle cx="8" cy="8" r="1.6" />
    </>
  ),
  // A card entering a shielded slot: paying on the processor's page.
  pay: (
    <>
      <rect x="2.5" y="5.5" width="19" height="13" rx="2.5" />
      <path d="M2.5 10h19" />
      <path d="M6.5 14.5h4" />
      <path d="M17 12.2v2.1c0 1.5 1 2.6 2.2 3.1 1.2-.5 2.2-1.6 2.2-3.1v-2.1l-2.2-.9Z" />
    </>
  ),
  // A voucher with a QR corner under a scan beam: redeeming at the counter.
  scan: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <rect x="6" y="9" width="4" height="4" rx="1" />
      <path d="M6 15.5h4" />
      <path d="M13.5 10h4.5" />
      <path d="M13.5 13h4.5" />
      <path d="M2 12h20" opacity="0.35" />
    </>
  ),
  // A storefront with an open door: a business joining.
  join: (
    <>
      <path d="M3.5 9.5 5 4.5h14l1.5 5" />
      <path d="M4 9.5v10h16v-10" />
      <path d="M3.5 9.5a2.6 2.6 0 0 0 5.2 0 2.6 2.6 0 0 0 5.2 0 2.6 2.6 0 0 0 5.2 0" />
      <path d="M10 19.5v-5.5h4v5.5" />
    </>
  ),
  // A listing sheet with an upload arrow: publishing a deal.
  publish: (
    <>
      <path d="M6 21.5h12a1.5 1.5 0 0 0 1.5-1.5V8.5L14 3H6a1.5 1.5 0 0 0-1.5 1.5V20A1.5 1.5 0 0 0 6 21.5Z" />
      <path d="M13.5 3v5.5h5.5" />
      <path d="M12 18v-6" />
      <path d="m9.5 14.5 2.5-2.5 2.5 2.5" />
    </>
  ),
  // A coin over an open palm: the supplier's share.
  settle: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M12 6.3v3.4" />
      <path d="M10.7 7.1h2.6" opacity="0.6" />
      <path d="M3.5 15.5c2.4 0 3.6 1.2 5.2 2.4h3.6a1.4 1.4 0 0 1 0 2.8H9.2" />
      <path d="M12.3 18h3.1l4-2.2a1.5 1.5 0 0 1 1.6 2.5l-5.1 3.2H8.7" />
    </>
  ),
}

export default function StepIllustration({ icon }: { icon: TrustStep['icon'] }) {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" {...STROKE}>
      {PATHS[icon]}
    </svg>
  )
}
