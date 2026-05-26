import Link from 'next/link'

const categories: ReadonlyArray<{ label: string; href: string }> = [
  { label: 'דילים חמים 🔥', href: '#' },
  { label: 'עד 99₪', href: '#' },
  { label: 'החדשים', href: '#' },
  { label: 'מסעדות ובתי קפה', href: '#' },
  { label: 'יופי בריאות וטיפוח', href: '#' },
  { label: 'טלפונים מחשבים ואביזרים', href: '#' },
  { label: 'תינוקות וילדים', href: '#' },
  { label: 'צימרים ובתי מלון', href: '#' },
  { label: 'ציוד ומזון לבעלי חיים', href: '#' },
  { label: 'בעלי מקצוע', href: '#' },
  { label: 'קורסים Express - בקרוב...', href: '#' },
]

const promoBanners: ReadonlyArray<{ id: string; tagline: string }> = [
  { id: 'hottest', tagline: 'SHOP THE HOTTEST PRODUCTS' },
  { id: 'consoles', tagline: 'CATCH BIG DEALS ON THE CONSOLES' },
  { id: 'laptops', tagline: 'LAPTOPS NOTEBOOKS AND MORE' },
]

export default function HomeThreeColumnSection() {
  return (
    <section dir="rtl" className="flex flex-row w-full bg-white" style={{ height: 500 }}>
      {/* Right column — categories mega menu (280px) */}
      <aside
        className="shrink-0 flex flex-col bg-white border-l border-gray-200"
        style={{ width: 280 }}
      >
        <div className="bg-yellow-400" style={{ height: 60 }} />
        <ul className="flex-1 flex flex-col">
          {categories.map((cat) => (
            <li key={cat.label} className="border-b border-gray-200 last:border-b-0">
              <Link
                href={cat.href}
                className="flex items-center h-10 pr-4 text-right text-sm text-gray-800 bg-white hover:bg-gray-50 transition-colors"
              >
                {cat.label}
              </Link>
            </li>
          ))}
        </ul>
      </aside>

      {/* Middle column — main carousel (flex-1) */}
      <div className="relative flex-1 flex flex-col" style={{ backgroundColor: '#E8F4F8' }}>
        <div className="flex-1 flex flex-row items-center px-10">
          {/* Right side — Hebrew & English text */}
          <div className="flex-1 flex flex-col justify-center gap-3 text-right">
            <h2 className="text-5xl font-bold leading-tight text-gray-900">
              ברוכים הבאים לקניון Express
            </h2>
            <p className="text-2xl text-gray-700">מסדרים לך בילוי...</p>
            <p className="text-sm tracking-widest text-gray-600 mt-4">SIMPLY THE BEST</p>
            <p className="text-7xl font-bold leading-none text-gray-900">BEST</p>
          </div>

          {/* Left side — product image placeholder */}
          <div className="flex-1 h-full" aria-hidden="true" />
        </div>

        {/* Indicator dots */}
        <div className="absolute bottom-4 left-0 right-0 flex justify-center items-center gap-2">
          {[0, 1, 2, 3, 4].map((i) => {
            const isActive = i === 2
            return (
              <span
                key={i}
                className={
                  isActive
                    ? 'block h-2 w-6 rounded-full bg-yellow-400'
                    : 'block h-2 w-2 rounded-full bg-gray-300'
                }
              />
            )
          })}
        </div>
      </div>

      {/* Left column — promo banners (200px) */}
      <aside
        className="shrink-0 flex flex-col border-r border-gray-200 bg-white"
        style={{ width: 200 }}
      >
        {promoBanners.map((banner, idx) => (
          <Link
            key={banner.id}
            href="#"
            className={`group flex flex-col bg-white p-3 ${
              idx < promoBanners.length - 1 ? 'border-b border-gray-200' : ''
            }`}
            style={{ height: 500 / 3 }}
          >
            <p className="text-xs uppercase font-semibold text-gray-800 leading-tight">
              {banner.tagline}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-yellow-400 text-gray-900 text-xs font-bold">
                ←
              </span>
              <span className="text-xs font-medium text-gray-700 group-hover:underline">
                Shop now
              </span>
            </div>
            <div className="mt-2 flex-1 bg-gray-100 rounded-sm" aria-hidden="true" />
          </Link>
        ))}
      </aside>
    </section>
  )
}
