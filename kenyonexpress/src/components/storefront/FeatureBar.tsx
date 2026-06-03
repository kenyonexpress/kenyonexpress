import { Award, Headphones, MapPin, ShieldCheck, Tag } from 'lucide-react'

const FEATURES = [
  {
    Icon: Award,
    title: 'מותגי יוקרה מובילים',
    sub: 'המוצרים הכי מבוקשים',
  },
  {
    Icon: Tag,
    title: 'מחירים מנצחים',
    sub: 'זול יותר מהמתחרים',
  },
  {
    Icon: Headphones,
    title: 'שירות לקוחות',
    sub: 'זמינים 7 ימים בשבוע',
  },
  {
    Icon: ShieldCheck,
    title: 'קניה חכמה 99%',
    sub: 'מאובטח ומוגן',
  },
  {
    Icon: MapPin,
    title: 'לכל חלקי הארץ',
    sub: 'משלוח מהיר ואמין',
  },
]

export default function FeatureBar() {
  return (
    <div className="bg-white border-y border-gray-200">
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
          {FEATURES.map((f, i) => (
            <div
              key={f.title}
              className={`flex items-center gap-3 py-2 flex-1 min-w-[140px] ${
                i < FEATURES.length - 1 ? 'border-e border-gray-200' : ''
              }`}
            >
              <div className="shrink-0 w-10 h-10 rounded-full border-2 border-brand-primary flex items-center justify-center">
                <f.Icon size={18} className="text-brand-primary" strokeWidth={1.8} aria-hidden="true" />
              </div>
              <div>
                <p className="text-xs font-bold text-gray-900 leading-snug">{f.title}</p>
                <p className="text-[11px] text-gray-500">{f.sub}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
