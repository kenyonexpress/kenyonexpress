import Link from "next/link";
import { SearchBar } from "./search-bar";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200/80 bg-white/90 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/90">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:py-3.5 lg:px-6">
        <div className="flex items-center justify-between gap-4 sm:justify-start">
          <Link
            href="/"
            className="group flex shrink-0 items-center gap-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-950"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-deep)] text-white shadow-md shadow-[var(--accent)]/25">
              <span className="text-sm font-black tracking-tight">כ</span>
            </span>
            <div className="flex flex-col leading-tight">
              <span className="text-base font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                קניון אקספרס
              </span>
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                קופונים ומבצעים מעודכנים
              </span>
            </div>
          </Link>
          <nav className="hidden items-center gap-1 text-sm font-medium text-zinc-600 md:flex dark:text-zinc-300">
            <Link
              href="#deals"
              className="rounded-lg px-3 py-2 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-white"
            >
              מבצעים
            </Link>
            <Link
              href="#categories"
              className="rounded-lg px-3 py-2 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-white"
            >
              קטגוריות
            </Link>
            <Link
              href="#brands"
              className="rounded-lg px-3 py-2 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-white"
            >
              מותגים
            </Link>
          </nav>
        </div>
        <div className="min-w-0 flex-1 sm:max-w-xl lg:max-w-2xl">
          <SearchBar />
        </div>
      </div>
    </header>
  );
}
