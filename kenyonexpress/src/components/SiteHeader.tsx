import Link from 'next/link'

type Props = { user: { email?: string } | null }

export default function SiteHeader({ user }: Props) {
  return (
    <header className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-6 flex items-center gap-8" style={{ height: 80 }}>
        {/* ── LOGO — first in DOM = visual RIGHT in RTL ── */}
        <Link href="/" className="flex items-center gap-3 shrink-0">
          {/* Yellow circle with cart — rightmost part of logo */}
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center shrink-0 shadow-sm"
            style={{ background: '#F5C518' }}
          >
            <svg
              aria-hidden="true"
              xmlns="http://www.w3.org/2000/svg"
              className="w-7 h-7 text-gray-900"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
          </div>
          {/* Text */}
          <div className="leading-tight">
            <div className="font-black text-lg text-gray-900 tracking-tight">קניון EXPRESS</div>
            <div className="text-[11px] text-gray-500 font-normal">מסדרים לך בילוי</div>
          </div>
        </Link>

        {/* ── LOCATION SELECTOR — center ── */}
        <div className="flex-1 flex justify-center">
          <button
            type="button"
            className="border border-gray-300 rounded-lg px-4 py-2.5 text-sm text-gray-600 flex items-center gap-2 hover:border-gray-400 transition-colors min-w-[200px]"
          >
            {/* Pin icon — first in button = visual RIGHT in RTL */}
            <svg
              aria-hidden="true"
              xmlns="http://www.w3.org/2000/svg"
              className="w-4 h-4 text-gray-500 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 2C8.686 2 6 4.686 6 8c0 4.5 6 11 6 11s6-6.5 6-11c0-3.314-2.686-6-6-6zm0 8a2 2 0 110-4 2 2 0 010 4z"
              />
            </svg>
            <span className="flex-1 text-center">בחר אזור</span>
            {/* Chevron — last in button = visual LEFT in RTL */}
            <svg
              aria-hidden="true"
              xmlns="http://www.w3.org/2000/svg"
              className="w-4 h-4 text-gray-400 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
        </div>

        {/* ── ACTION ICONS — last in DOM = visual LEFT in RTL ── */}
        {/* DOM order: cart → person → heart  →  visual left-to-right: heart | person | cart */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Cart with yellow badge — last in DOM = visual leftmost */}
          <button
            type="button"
            className="relative p-2.5 hover:bg-gray-100 rounded-full transition-colors"
            title="עגלת קניות"
          >
            <svg
              aria-hidden="true"
              xmlns="http://www.w3.org/2000/svg"
              className="w-6 h-6 text-gray-700"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.8}
                d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
            <span
              className="absolute top-1 right-1 text-[10px] font-black rounded-full w-4 h-4 flex items-center justify-center text-gray-900"
              style={{ background: '#F5C518' }}
            >
              0
            </span>
          </button>

          {/* Person/user */}
          <Link
            href={user ? '/profile' : '/login'}
            className="p-2.5 hover:bg-gray-100 rounded-full transition-colors"
            title="חשבון"
          >
            <svg
              aria-hidden="true"
              xmlns="http://www.w3.org/2000/svg"
              className="w-6 h-6 text-gray-700"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.8}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
          </Link>

          {/* Heart/wishlist — first in DOM = visual rightmost within group */}
          <button
            type="button"
            className="p-2.5 hover:bg-gray-100 rounded-full transition-colors"
            title="רשימת משאלות"
          >
            <svg
              aria-hidden="true"
              xmlns="http://www.w3.org/2000/svg"
              className="w-6 h-6 text-gray-700"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.8}
                d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
              />
            </svg>
          </button>
        </div>
      </div>
    </header>
  )
}
