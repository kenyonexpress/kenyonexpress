import { HandCoins, Headphones, MapPin, Percent, Sparkles } from 'lucide-react'

const BENEFITS = [
  { Icon: Sparkles, label: 'קנייה חכמה' },
  { Icon: HandCoins, label: 'מחירים מנצחים' },
  { Icon: Headphones, label: 'שירות ללקוחות' },
  { Icon: Percent, label: '99% חכמה' },
  { Icon: MapPin, label: 'לכל חלקי הארץ' },
] as const

export default function BenefitBar() {
  return (
    <section aria-label="יתרונות" dir="rtl" className="w-full bg-white py-4 font-sans">
      <div className="max-w-page mx-auto px-4">
        <div className="overflow-hidden rounded-[8px] border border-[#e5e7eb]">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5">
            {BENEFITS.map((item, i) => (
              <div
                key={item.label}
                className={`flex flex-col items-center justify-center gap-2 px-4 py-5 text-center ${
                  i < BENEFITS.length - 1 ? 'border-e border-[#e5e7eb]' : ''
                }`}
              >
                <item.Icon
                  size={32}
                  strokeWidth={1.5}
                  className="shrink-0 text-brand-secondary"
                  aria-hidden="true"
                />
                <p className="text-xs font-bold leading-tight text-heading">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
