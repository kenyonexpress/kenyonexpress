'use client'

import { Mail } from 'lucide-react'
import { useState } from 'react'

export default function Newsletter() {
  const [email, setEmail] = useState('')

  const handleSubmit = () => {
    if (!email) return
    // TODO: חיבור ל-Resend / API
    console.log('newsletter signup:', email)
  }

  return (
    <section dir="rtl" className="w-full bg-[#fed700]">
      <div className="max-w-[1430px] mx-auto px-4 py-8">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4 text-right">
            <Mail className="w-10 h-10 text-[#333e48] flex-shrink-0" strokeWidth={1.5} />
            <div>
              <h3 className="text-[20px] md:text-[23px] font-bold text-[#333e48] leading-tight">
                הירשמו לניוזלטר
              </h3>
              <p className="text-[15px] text-[#333e48] mt-1">וקבלו קופון של 20% להזמנה הראשונה</p>
            </div>
          </div>

          <div className="flex w-full lg:w-auto lg:min-w-[480px]">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="הזינו את כתובת האימייל שלכם"
              className="flex-1 h-[46px] px-6 bg-white border-0 text-right text-[14px] text-[#333e48] placeholder:text-[#919191] rounded-r-full focus:outline-none"
            />
            <button
              type="button"
              onClick={handleSubmit}
              className="h-[46px] px-8 bg-[#333e48] hover:bg-black text-white font-normal text-[14px] rounded-l-full transition-colors duration-200 whitespace-nowrap"
            >
              הרשמה
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
