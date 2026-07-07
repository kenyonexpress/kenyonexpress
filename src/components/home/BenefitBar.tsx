import { HandCoins, Headphones, Tag, ThumbsUp, Truck } from 'lucide-react'

const benefits = [
  { icon: Truck, title: 'לכל חלקי', subtitle: 'הארץ' },
  { icon: ThumbsUp, title: 'קנייה', subtitle: 'חכמה' },
  { icon: Headphones, title: 'שירות', subtitle: 'לקוחות' },
  { icon: HandCoins, title: 'מחירים', subtitle: 'מנצחים' },
  { icon: Tag, title: 'מותגי יוקרה', subtitle: 'מובילים !' },
]

export default function BenefitBar() {
  return (
    <section dir="rtl" className="w-full bg-white font-sans">
      <div className="mx-auto max-w-page px-4">
        <ul className="flex flex-nowrap justify-between rounded-lg border border-[#ddd]">
          {benefits.map((b) => {
            const Icon = b.icon
            return (
              <li
                key={b.title}
                className="w-1/5 flex items-center justify-center gap-2.5 px-4 pt-[1.357em] pb-[0.929em] border-l border-[#ddd] last:border-l-0"
              >
                <Icon className="w-9 h-9 text-[#fed700] flex-shrink-0" strokeWidth={1.5} />
                <div className="text-center">
                  <div className="text-[15px] font-bold text-[#333e48] leading-tight">
                    {b.title}
                  </div>
                  <div className="text-[13px] text-[#7e7e7e] leading-tight mt-0.5">
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
