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
    <section aria-label="יתרונות" dir="rtl" className="w-full border-y border-gray-200 bg-white font-sans">
      <div className="max-w-page mx-auto">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5">
          {BENEFITS.map((item, i) => (
            <div
              key={item.label}
              className={`flex flex-col items-center justify-center gap-2 px-4 py-5 text-center ${
                i < BENEFITS.length - 1 ? 'border-e border-gray-200' : ''
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
    </section>
  )
}
