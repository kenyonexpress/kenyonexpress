import { CreditCard, Headphones, MapPin, Tag, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

type Benefit = {
  Icon: LucideIcon
  bold: string
  rest: string
}

/** refs/ke_live_singlefile.html — .features-list (DOM order). Bold first word, regular second line. */
const BENEFITS: Benefit[] = [
  { Icon: MapPin, bold: 'לכל', rest: 'חלקי הארץ' },
  { Icon: Users, bold: 'קניה', rest: 'חכמה' },
  { Icon: Headphones, bold: 'שירות', rest: 'לקוחות' },
  { Icon: CreditCard, bold: 'מחירים', rest: 'מנצחים' },
  { Icon: Tag, bold: 'מותגי', rest: 'יוקרה מובילים !' },
]

export default function BenefitBar() {
  return (
    <section aria-label="יתרונות" dir="rtl" className="w-full bg-white py-4 font-sans">
      <div className="mx-auto max-w-page px-4">
        <div
          className="flex flex-wrap lg:flex-nowrap lg:justify-between"
          style={{ marginBottom: '1.643em' }}
        >
          {BENEFITS.map((item, i) => (
            <div
              key={item.bold}
              className={`flex min-w-[50%] flex-1 items-center gap-2.5 px-4 lg:min-w-0 ${
                i < BENEFITS.length - 1 ? 'border-e border-[#ddd]' : ''
              }`}
              style={{ paddingTop: '1.357em', paddingBottom: '0.929em' }}
            >
              <item.Icon
                size={36}
                strokeWidth={1.5}
                className="shrink-0 text-brand-secondary"
                aria-hidden="true"
              />
              <p className="m-0 text-sm leading-tight text-[#333e48]">
                <strong className="font-bold">{item.bold}</strong>
                <span className="block font-normal">{item.rest}</span>
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
