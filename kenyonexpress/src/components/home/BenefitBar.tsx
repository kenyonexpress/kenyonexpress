import { CreditCard, Headphones, MapPin, Tag, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

type Benefit = {
  Icon: LucideIcon
  strong: string
  rest: string
}

/** refs/ke_live_singlefile.html — .features-list (DOM order) */
const BENEFITS: Benefit[] = [
  { Icon: MapPin, strong: ' לכל חלקי ', rest: 'הארץ' },
  { Icon: Users, strong: ' קניה ', rest: 'חכמה' },
  { Icon: Headphones, strong: 'שירות', rest: ' לקוחות' },
  { Icon: CreditCard, strong: 'מחירים ', rest: 'מנצחים' },
  { Icon: Tag, strong: 'מותגי יוקרה', rest: ' מובילים !' },
]

export default function BenefitBar() {
  return (
    <section aria-label="יתרונות" dir="rtl" className="w-full bg-white py-4 font-sans">
      <div className="mx-auto max-w-page px-4">
        <div
          className="overflow-hidden rounded-[8px] border border-[#ddd]"
          style={{ marginBottom: '1.643em' }}
        >
          <div className="flex flex-wrap lg:flex-nowrap lg:justify-between">
            {BENEFITS.map((item, i) => (
              <div
                key={item.strong}
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
                  <strong className="font-bold">{item.strong}</strong>
                  {item.rest}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
