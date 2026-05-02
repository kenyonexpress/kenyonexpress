import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-zinc-200 bg-zinc-950 text-zinc-300 dark:border-zinc-800">
      <div className="mx-auto max-w-7xl px-4 py-12 lg:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-lg font-bold text-white">קניון אקספרס</p>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">
              אגרגטור קופונים ודילים לצרכן הישראלי — מהיר, נקי, ומעודכן כל יום.
            </p>
          </div>
          <div>
            <p className="text-sm font-bold text-white">קישורים</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <Link href="#deals" className="hover:text-white">
                  כל המבצעים
                </Link>
              </li>
              <li>
                <Link href="#categories" className="hover:text-white">
                  קטגוריות
                </Link>
              </li>
              <li>
                <Link href="#brands" className="hover:text-white">
                  מותגים
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-bold text-white">מידע</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <span className="cursor-not-allowed text-zinc-500">תנאי שימוש (בקרוב)</span>
              </li>
              <li>
                <span className="cursor-not-allowed text-zinc-500">מדיניות פרטיות (בקרוב)</span>
              </li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-bold text-white">התראות מבצעים</p>
            <p className="mt-2 text-sm text-zinc-400">הירשמו לניוזלטר (בקרוב)</p>
            <div className="mt-3 flex gap-2">
              <input
                type="email"
                disabled
                placeholder="האימייל שלכם"
                className="h-10 min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-500"
              />
              <button
                type="button"
                disabled
                className="shrink-0 rounded-lg bg-zinc-800 px-3 text-sm font-semibold text-zinc-500"
              >
                שליחה
              </button>
            </div>
          </div>
        </div>
        <p className="mt-10 border-t border-zinc-800 pt-8 text-center text-xs text-zinc-500">
          © {new Date().getFullYear()} קניון אקספרס · דמו לצורכי עיצוב
        </p>
      </div>
    </footer>
  );
}
