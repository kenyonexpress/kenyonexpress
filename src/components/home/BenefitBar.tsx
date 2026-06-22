'use client'

import { Headphones, ShieldCheck, Truck, Wallet } from 'lucide-react'

const benefits = [
  {
    icon: Truck,
    title: 'משלוח מהיר חינם',
    subtitle: 'לכל חלקי הארץ',
  },
  {
    icon: Headphones,
    title: 'שירות לקוחות',
    subtitle: 'זמינים 24/7',
  },
  {
    icon: ShieldCheck,
    title: 'קנייה בטוחה',
    subtitle: 'תשלום מאובטח',
  },
  {
    icon: Wallet,
    title: 'מחירים משתלמים',
    subtitle: 'הזולים בארץ',
  },
]

export default function BenefitBar() {
  return (
    <section dir="rtl" className="w-full bg-white border-t border-b border-[#ededed]">
      <div className="max-w-[1430px] mx-auto px-4">
        <ul className="grid grid-cols-2 md:grid-cols-4 divide-x divide-x-reverse divide-[#ededed]">
          {benefits.map((b) => {
            const Icon = b.icon
            return (
              <li key={b.title} className="flex items-center justify-center gap-4 py-7 px-4">
                <Icon className="w-9 h-9 text-[#333e48] flex-shrink-0" strokeWidth={1.5} />
                <div className="text-right">
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
