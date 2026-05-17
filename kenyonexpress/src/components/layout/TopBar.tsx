import { MapPin, ShoppingBag, Truck, User } from 'lucide-react'
import Link from 'next/link'

export default function TopBar() {
  return (
    <nav
      dir="rtl"
      lang="he"
      aria-label="top utility bar"
      className="w-full bg-white border-b border-[#E5E5E5] h-12 px-8 flex justify-between items-center text-sm text-[#4A4A4A]"
    >
      <span className="hidden lg:block">ברוך הבא לעולמו של קניון Express</span>

      <div className="flex items-center">
        <span className="flex items-center gap-1.5">
          <MapPin size={18} strokeWidth={1.5} aria-hidden="true" />
          בפריסה ארצית
        </span>

        <span className="mx-4 h-[18px] w-px bg-[#D9D9D9]" aria-hidden="true" />

        <span className="flex items-center gap-1.5">
          <Truck size={18} strokeWidth={1.5} aria-hidden="true" />
          משלוח מהיר חינם
        </span>

        <span className="mx-4 h-[18px] w-px bg-[#D9D9D9]" aria-hidden="true" />

        <span className="flex items-center gap-1.5 hidden md:flex">
          <ShoppingBag size={18} strokeWidth={1.5} aria-hidden="true" />
          קניה בטוחה
        </span>

        <span className="mx-4 h-[18px] w-px bg-[#D9D9D9] hidden md:block" aria-hidden="true" />

        <Link
          href="/auth/login"
          className="flex items-center gap-1.5 hover:text-[#F5C518] transition-colors duration-150"
        >
          <User size={18} strokeWidth={1.5} aria-hidden="true" />
          התחברות
        </Link>
      </div>
    </nav>
  )
}
