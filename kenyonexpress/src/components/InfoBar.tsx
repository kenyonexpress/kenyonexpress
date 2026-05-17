import Link from 'next/link'

export default function InfoBar() {
  return (
    <div className="text-white text-xs" style={{ background: '#1a1a2e' }}>
      <div className="max-w-7xl mx-auto px-6 h-9 flex items-center justify-between">
        {/* Welcome text — first in DOM = visual RIGHT in RTL */}
        <span className="text-gray-400 font-medium">ברוך הבא לעולם של קניון Express</span>

        {/* 4 items — last in DOM = visual LEFT in RTL */}
        <div className="flex items-center gap-5">
          {/* בפריסה ארצית */}
          <span className="flex items-center gap-1.5 text-gray-400">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-3.5 h-3.5"
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
            <span>בפריסה ארצית</span>
          </span>

          {/* משלוח מהיר חינם */}
          <span className="flex items-center gap-1.5 text-gray-400">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 17a2 2 0 11-4 0 2 2 0 014 0zm10 0a2 2 0 11-4 0 2 2 0 014 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M1 1h4l2.5 11.5h10L20 6H6"
              />
            </svg>
            <span>משלוח מהיר חינם</span>
          </span>

          {/* קניה בטוחה */}
          <span className="flex items-center gap-1.5 text-gray-400">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
            <span>קניה בטוחה</span>
          </span>

          {/* התחברות — last in group = visual leftmost */}
          <Link
            href="/login"
            className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
            <span>התחברות</span>
          </Link>
        </div>
      </div>
    </div>
  )
}
