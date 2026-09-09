/**
 * DEAD CODE. Nothing imports this; the trust band the site renders is
 * `src/components/home/BenefitBar.tsx`, which the homepage mounts and which was
 * matched 1:1 to the live site on 2026-08-10.
 *
 * Left in place rather than deleted because deleting a file is a stop condition
 * in this project, not because it is worth keeping. It is actively misleading:
 * the five subtitles below -- "משלוח מהיר", "99%", "זמינים תמיד", "הזולים בארץ"
 * -- appear NOWHERE on the live site. Four of them are invented claims, and
 * "99%" and "הזולים בארץ" are the kind a consumer regulator reads as a
 * quantified promise. Do not revive this file; if a second trust band is ever
 * needed, copy BenefitBar. **Safe to delete on Ofir's word.**
 */
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
    <div dir="rtl" className="w-full bg-white border-t border-border-alt">
      <div className="max-w-page mx-auto">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5">
          {ITEMS.map((item, i) => (
            <div
              key={item.title}
              className={`flex items-center gap-3 px-4 py-4 ${
                i < ITEMS.length - 1 ? 'border-e border-border-alt' : ''
              }`}
            >
              <item.Icon
                size={28}
                strokeWidth={1.5}
                className="text-brand-secondary shrink-0"
                aria-hidden="true"
              />
              <div>
                <p className="text-xs font-bold text-ink leading-tight">{item.title}</p>
                <p className="text-micro text-muted leading-tight mt-0.5">{item.subtitle}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
