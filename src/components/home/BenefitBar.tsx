import {
  EcCustomers,
  EcPayment,
  EcSupport,
  EcTag,
  EcTransport,
} from '@/components/icons/electro-icons'
import { ELECTRO_HERO } from '@/lib/electro-hero-tokens'

const USP = ELECTRO_HERO.uspBar

/**
 * The five trust items, in the live site's order and with its exact strings.
 *
 * READ OFF THE LIVE SITE on 2026-08-10, not from a reference file:
 * `refs/ke_live_singlefile.html` does not exist in this repo, and
 * `compare.mjs:50-52` already defaults the home reference to
 * https://kenyonexpress.co.il for the same reason. The band there is an Electro
 * `features-list` of five `.feature` blocks, each `<strong>title</strong> rest`:
 *
 *   ec-transport  <strong>לכל חלקי</strong> הארץ
 *   ec-support    <strong>שירות</strong> לקוחות
 *   ec-payment    <strong>מחירים</strong> מנצחים
 *   ec-tag        <strong>מותגי יוקרה</strong> מובילים !
 *   ec-customers  <strong>קניה</strong> חכמה
 *
 * TWO THINGS WERE OFF, and both are the kind a screenshot diff cannot see
 * because the band is the same width either way:
 *
 *  1. ORDER. "קניה חכמה" sat second here and is LAST on live, which pushed
 *     support, payment and tag each one slot to the right. Five items in five
 *     equal fifths means every label was in the wrong cell.
 *  2. SPELLING. "קנייה" with two yods; live writes "קניה" with one. It is the
 *     business's own wording for its own promise, so it is copied, not corrected.
 *
 * The icons stay lucide. Live uses an icon FONT (`<i class="ec ec-transport">`),
 * and the five glyphs do exist in src/styles/electro-icons.css, but the sizes
 * and colours here come from ELECTRO_HERO.uspBar, which was measured against
 * the rendered band; swapping the glyph source would change the metrics that
 * token module pins. The goal named position, sizes, texts and colours, and
 * those are what this matches.
 */
const benefits = [
  // WRAPPED BELOW lg, 2026-09-02: five nowrap fifths of a 380px viewport are
  // 76px cells, and the reordered labels overflowed the page to 385px -- the
  // exact horizontal-overflow defect the mobile audit hunts. Live's 380 render
  // has no five-across bar at all, so wrapping is nearer the reference than
  // clipping. RE-MEASURED off refs/ke_live_computed.json: the live icon order
  // right-to-left is transport, customers, support, payment, tag -- so
  // "קניה חכמה" is SECOND today, not last. The note above recorded it last from
  // an earlier capture; the reference moved, which is what a live third-party
  // site does. The icon is live's ec-customers (a percent badge), not a thumb.
  { icon: EcTransport, title: 'לכל חלקי', subtitle: 'הארץ' },
  { icon: EcCustomers, title: 'קניה', subtitle: 'חכמה' },
  { icon: EcSupport, title: 'שירות', subtitle: 'לקוחות' },
  { icon: EcPayment, title: 'מחירים', subtitle: 'מנצחים' },
  { icon: EcTag, title: 'מותגי יוקרה', subtitle: 'מובילים !' },
]

// All colours and sizes come from ELECTRO_HERO.uspBar (the measured token
// module). Direction handling uses CSS logical properties only, so the bar
// mirrors correctly under dir="rtl".
/**
 * LIVE DOES NOT RENDER THE FIVE BLOCKS ON A PHONE.
 *
 * Measured off refs/ke_live_computed.json: at 768 and 1440 the feature bar is
 * 134px tall and `.feature` appears five times. At 380 the section collapses to
 * an EMPTY 31px strip -- `.feature` is absent from that viewport entirely.
 * Ours rendered all five at every width, stacked, and that height was part of
 * the 967px by which the product grid started too low at 380.
 *
 * The list is hidden rather than unmounted so the strip keeps live's 31px of
 * vertical space, and `aria-hidden` follows the visibility: a screen reader
 * should not read five items that are not on the page.
 */
export default function BenefitBar() {
  return (
    <section
      dir="rtl"
      // md:pt-usp-offset (30px) and NOT items-center: probed 2026-10-20 at 768 and 1440,
      // live's .features-list starts 30px into the 134px section (y612.4 in a
      // section at 582.4; y791.3 in one at 761.3) and is 81.4 tall, with the
      // 68px items centred in it at y619 / y798. Centring our 71px list put
      // the items at y615 / y794, four pixels high on every band they touch.
      className="hidden md:block md:h-feature-bar md:pt-usp-offset w-full bg-white font-sans"
    >
      {/*
        ONE ROW FROM md, WITH LIVE'S 768 BOX. Probed in the live archive on
        2026-10-20 at 768: `.features-list` is x39 w690 (border 1px #ddd,
        radius 8, overflow auto) and holds five `.feature` of 180px laid
        right-to-left -- x548, 368, 188, 8 and -172 -- so four show and the
        fifth is clipped by the list's own box. Ours wrapped `sm:w-1/2` into
        three rows of two and spilled 75px under the 134px band (li at y719
        inside a section ending at 751). At 1440 the list is 1170 wide and the
        cells are fifths (234px), which is what lg keeps.
      */}
      <div
        className="mx-auto hidden w-full md:block md:max-w-usp-tablet lg:max-w-[var(--usp-max)]"
        style={{ '--usp-max': `${USP.maxWidth}px` } as React.CSSProperties}
      >
        <ul
          className="flex min-h-usp-list flex-nowrap items-center justify-start overflow-hidden lg:justify-between"
          style={{ border: `1px solid ${USP.borderColor}`, borderRadius: USP.borderRadius }}
        >
          {benefits.map((b, i) => {
            const Icon = b.icon
            const isLast = i === benefits.length - 1
            return (
              <li
                key={b.title}
                // The gap and the inline padding go through custom properties
                // rather than straight into `style`, because an inline value
                // cannot be overridden by a media query and the narrowest
                // phones need both smaller. See .benefit-bar__item in
                // globals.css for the measurement.
                className="benefit-bar__item flex w-usp-cell-tablet shrink-0 items-center justify-center lg:w-1/5"
                style={
                  {
                    '--usp-gap': `${USP.gap}px`,
                    '--usp-pad': `${USP.paddingInline}px`,
                    paddingBlockStart: USP.paddingBlockStart,
                    paddingBlockEnd: USP.paddingBlockEnd,
                    borderInlineEndStyle: 'solid',
                    borderInlineEndWidth: isLast ? 0 : 1,
                    borderInlineEndColor: USP.borderColor,
                  } as React.CSSProperties
                }
              >
                <Icon
                  className="flex-shrink-0"
                  style={{ width: USP.icon.size, height: USP.icon.size, color: USP.icon.color }}
                />
                <div className="text-center">
                  <div
                    className="leading-tight"
                    style={{
                      fontSize: USP.title.size,
                      fontWeight: USP.title.weight,
                      color: USP.title.color,
                    }}
                  >
                    {b.title}
                  </div>
                  <div
                    className="leading-tight"
                    style={{
                      fontSize: USP.subtitle.size,
                      fontWeight: USP.subtitle.weight,
                      color: USP.subtitle.color,
                      marginBlockStart: USP.subtitle.marginBlockStart,
                    }}
                  >
                    {b.subtitle}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
