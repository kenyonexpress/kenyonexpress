import Image from 'next/image'
import Link from 'next/link'
import {
  ChevronDown,
  Clock,
  Heart,
  MapPin,
  Search,
  ShoppingBag,
  User,
} from 'lucide-react'

const REGIONS = [
  { value: '', label: 'בחר אזור' },
  { value: 'all', label: 'כל הארץ' },
  { value: 'center', label: 'מרכז' },
  { value: 'north', label: 'צפון' },
  { value: 'south', label: 'דרום' },
  { value: 'jerusalem', label: 'ירושלים' },
  { value: 'haifa', label: 'חיפה' },
]

export default function SiteHeader() {
  return (
    <header dir="rtl" className="w-full bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="max-w-screen-xl mx-auto px-4 py-5 flex items-center gap-5">

        <Link
          href="/"
          aria-label="קניון אקספרס, לדף הבית"
          className="shrink-0"
        >
          <Image
            src="/logo.png"
            alt="קניון EXPRESS"
            width={133}
            height={102}
            className="h-16 w-auto object-contain"
            priority
          />
        </Link>

        <form
          method="GET"
          action="/products"
          className="flex flex-1 min-w-0 items-stretch gap-0"
        >
          <div className="flex flex-1 min-w-0 h-12 items-stretch rounded-full border-[3px] border-brand-secondary overflow-hidden bg-white">
            <button
              type="submit"
              aria-label="חיפוש"
              className="shrink-0 w-12 bg-brand-secondary text-brand-dark flex items-center justify-center hover:opacity-90 transition-opacity rounded-full -me-px"
            >
              <Search size={20} strokeWidth={2} aria-hidden="true" />
            </button>

            <input
              type="search"
              name="q"
              placeholder="חפש מוצרים"
              aria-label="חיפוש מוצרים"
              className="flex-1 min-w-0 border-0 bg-white px-4 text-sm focus:outline-none"
            />
          </div>

          <label className="sr-only" htmlFor="region-select">
            בחר אזור
          </label>
          <div className="relative shrink-0 ms-2 flex items-center">
            <MapPin
              size={16}
              className="absolute start-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              aria-hidden="true"
            />
            <select
              id="region-select"
              name="region"
              defaultValue=""
              className="h-12 appearance-none rounded-lg border border-gray-300 bg-gray-50 ps-9 pe-8 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-primary cursor-pointer min-w-[130px]"
            >
              {REGIONS.map((r) => (
                <option key={r.value} value={r.value} disabled={r.value === ''}>
                  {r.label}
                </option>
              ))}
            </select>
            <ChevronDown
              size={16}
              className="absolute end-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              aria-hidden="true"
            />
          </div>
        </form>

        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            className="relative p-2.5 hover:bg-gray-100 rounded-full transition-colors text-gray-700"
            aria-label="עגלת קניות, 0 פריטים"
          >
            <ShoppingBag size={22} strokeWidth={1.8} aria-hidden="true" />
            <span
              className="absolute top-1 end-1 w-4 h-4 rounded-full bg-brand-secondary text-brand-dark text-[10px] font-bold flex items-center justify-center"
              aria-hidden="true"
            >
              0
            </span>
          </button>

          <Link
            href="/login"
            className="p-2.5 hover:bg-gray-100 rounded-full transition-colors text-gray-700"
            aria-label="החשבון שלי"
          >
            <User size={22} strokeWidth={1.8} aria-hidden="true" />
          </Link>

          <button
            type="button"
            className="p-2.5 hover:bg-gray-100 rounded-full transition-colors text-gray-700"
            aria-label="מועדפים"
          >
            <Heart size={22} strokeWidth={1.8} aria-hidden="true" />
          </button>

          <button
            type="button"
            className="p-2.5 hover:bg-gray-100 rounded-full transition-colors text-gray-700"
            aria-label="היסטוריה"
          >
            <Clock size={22} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>
  )
}
