import { HandCoins, Headphones, Tag, ThumbsUp, Truck } from 'lucide-react'

const ITEMS = [
  {
    Icon: Truck,
    title: 'לכל חלקי הארץ',
    subtitle: 'משלוח מהיר',
  },
  {
    Icon: ThumbsUp,
    title: 'קניה חכמה',
    subtitle: '99%',
  },
  {
    Icon: Headphones,
    title: 'שירות לקוחות',
    subtitle: 'זמינים תמיד',
  },
  {
    Icon: HandCoins,
    title: 'מחירים מנצחים',
    subtitle: 'הזולים בארץ',
  },
  {
    Icon: Tag,
    title: 'מותגי יוקרה',
    subtitle: 'מובילים!',
  },
] as const

export default function InfoBar() {
  return (
    <div dir="rtl" className="w-full bg-white border-t border-gray-200">
      <div className="max-w-[1320px] mx-auto">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5">
          {ITEMS.map((item, i) => (
            <div
              key={item.title}
              className={`flex items-center gap-3 px-4 py-4 ${
                i < ITEMS.length - 1 ? 'border-e border-gray-200' : ''
              }`}
            >
              <item.Icon
                size={28}
                strokeWidth={1.5}
                className="text-brand-secondary shrink-0"
                aria-hidden="true"
              />
              <div>
                <p className="text-xs font-bold text-gray-900 leading-tight">{item.title}</p>
                <p className="text-[11px] text-gray-500 leading-tight mt-0.5">{item.subtitle}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
