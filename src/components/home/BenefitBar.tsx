import { ELECTRO_HERO } from '@/lib/electro-hero-tokens'
import { BadgePercent, HandCoins, Headphones, Tag, Truck } from 'lucide-react'

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
  { icon: Truck, title: 'לכל חלקי', subtitle: 'הארץ' },
  { icon: BadgePercent, title: 'קניה', subtitle: 'חכמה' },
  { icon: Headphones, title: 'שירות', subtitle: 'לקוחות' },
  { icon: HandCoins, title: 'מחירים', subtitle: 'מנצחים' },
  { icon: Tag, title: 'מותגי יוקרה', subtitle: 'מובילים !' },
]

// All colours and sizes come from ELECTRO_HERO.uspBar (the measured token
// module). Direction handling uses CSS logical properties only, so the bar
// mirrors correctly under dir="rtl".
export default function BenefitBar() {
  return (
    <section dir="rtl" className="w-full bg-white font-sans">
      <div className="mx-auto" style={{ maxWidth: USP.maxWidth }}>
        <ul
          className="flex flex-wrap justify-between lg:flex-nowrap"
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
                className="benefit-bar__item w-full sm:w-1/2 lg:w-1/5 flex items-center justify-center"
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
                  strokeWidth={USP.icon.strokeWidth}
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
