import { ELECTRO_HERO } from '@/lib/electro-hero-tokens'
import { HandCoins, Headphones, Tag, ThumbsUp, Truck } from 'lucide-react'

const USP = ELECTRO_HERO.uspBar

const benefits = [
  { icon: Truck, title: 'לכל חלקי', subtitle: 'הארץ' },
  { icon: ThumbsUp, title: 'קנייה', subtitle: 'חכמה' },
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
