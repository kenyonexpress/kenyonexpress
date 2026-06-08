import Link from 'next/link'
import { Lock, MapPin, Truck, User } from 'lucide-react'

export default function TopBar() {
  return (
    <div dir="rtl" className="w-full bg-white border-b border-gray-200">
      <div className="max-w-page mx-auto px-4 h-11 flex items-center justify-between text-[13px] text-gray-500">
        <span className="hidden lg:block">ברוך הבא לעולם של קניון Express</span>

        <nav className="flex items-center" aria-label="מידע שירות">
          <Link
            href="/login"
            className="flex items-center gap-1.5 hover:text-brand-primary transition-colors"
          >
            <User size={14} strokeWidth={1.5} aria-hidden="true" />
            התחברות
          </Link>

          <span className="w-px h-4 bg-gray-300 mx-3" aria-hidden="true" />

          <span className="flex items-center gap-1.5">
            <Lock size={14} strokeWidth={1.5} aria-hidden="true" />
            קנייה בטוחה
          </span>

          <span className="w-px h-4 bg-gray-300 mx-3" aria-hidden="true" />

          <span className="flex items-center gap-1.5">
            <Truck size={14} strokeWidth={1.5} aria-hidden="true" />
            משלוח מהיר חינם
          </span>

          <span className="w-px h-4 bg-gray-300 mx-3" aria-hidden="true" />

          <span className="flex items-center gap-1.5">
            <MapPin size={14} strokeWidth={1.5} aria-hidden="true" />
            בפריסה ארצית
          </span>
        </nav>
      </div>
    </div>
  )
}
