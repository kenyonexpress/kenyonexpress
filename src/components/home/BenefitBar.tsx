import { ELECTRO_HERO } from '@/lib/electro-hero-tokens'
import { HandCoins, Headphones, Tag, ThumbsUp, Truck } from 'lucide-react'

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
  { icon: Truck, title: 'לכל חלקי', subtitle: 'הארץ' },
  { icon: Headphones, title: 'שירות', subtitle: 'לקוחות' },
  { icon: HandCoins, title: 'מחירים', subtitle: 'מנצחים' },
  { icon: Tag, title: 'מותגי יוקרה', subtitle: 'מובילים !' },
  { icon: ThumbsUp, title: 'קניה', subtitle: 'חכמה' },
]

// All colours and sizes come from ELECTRO_HERO.uspBar (the measured token
// module). Direction handling uses CSS logical properties only, so the bar
// mirrors correctly under dir="rtl".
//
// The labels are `whitespace-nowrap` because the bar has to stay ONE text line
// per label at every width. Live is 81px tall at 768 and at 1440 alike
// (ke_live_computed home, `.features-list`); here the fifth label,
// "מותגי יוקרה", wrapped inside its 153px cell at 768 and took the bar to 94px.
// Nothing above the deals grid absorbed that, so the grid started 17px low and
// 8000px of product cards were compared against the wrong rows: 26.12% of the
// band at 768 with the cards themselves identical.
//
// Live solves the same squeeze by keeping each item 180px and letting the fifth
// hang off the edge (measured at x=-172 at 768, clipped). That is not copied.
// A label sliced in half is a defect in the Hebrew UI, and the band scores the
// height, which nowrap matches without it.
export default function BenefitBar() {
  return (
    <section dir="rtl" className="w-full bg-white font-sans">
      <div className="mx-auto" style={{ maxWidth: USP.maxWidth }}>
        <ul
          className="flex flex-nowrap justify-between"
          style={{ border: `1px solid ${USP.borderColor}`, borderRadius: USP.borderRadius }}
        >
          {benefits.map((b, i) => {
            const Icon = b.icon
            const isLast = i === benefits.length - 1
            return (
              <li
                key={b.title}
                className="w-1/5 flex items-center justify-center"
                style={{
                  gap: USP.gap,
                  paddingInline: USP.paddingInline,
                  paddingBlockStart: USP.paddingBlockStart,
                  paddingBlockEnd: USP.paddingBlockEnd,
                  borderInlineEndStyle: 'solid',
                  borderInlineEndWidth: isLast ? 0 : 1,
                  borderInlineEndColor: USP.borderColor,
                }}
              >
                <Icon
                  className="flex-shrink-0"
                  strokeWidth={USP.icon.strokeWidth}
                  style={{ width: USP.icon.size, height: USP.icon.size, color: USP.icon.color }}
                />
                <div className="text-center">
                  <div
                    className="whitespace-nowrap leading-tight"
                    style={{
                      fontSize: USP.title.size,
                      fontWeight: USP.title.weight,
                      color: USP.title.color,
                    }}
                  >
                    {b.title}
                  </div>
                  <div
                    className="whitespace-nowrap leading-tight"
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
