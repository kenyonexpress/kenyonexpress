import { categories } from "@/lib/data";
import { IconCategory } from "./icons";

export function CategoryRail() {
  return (
    <section
      id="categories"
      className="border-b border-zinc-100 bg-white dark:border-zinc-800 dark:bg-zinc-950"
      aria-labelledby="categories-heading"
    >
      <div className="mx-auto max-w-7xl px-4 py-4 lg:px-6">
        <h2 id="categories-heading" className="sr-only">
          ניווט קטגוריות
        </h2>
        <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1 sm:gap-3 sm:flex-wrap sm:overflow-visible">
          {categories.map((c) => (
            <a
              key={c.id}
              href={c.id === "all" ? "/#deals" : `/?cat=${encodeURIComponent(c.id)}#deals`}
              className="inline-flex shrink-0 items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3.5 py-2 text-sm font-semibold text-zinc-800 shadow-sm transition hover:border-[var(--accent)]/40 hover:bg-white hover:text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-[var(--accent)]/50 dark:hover:bg-zinc-800"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-zinc-600 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:text-zinc-300 dark:ring-zinc-700">
                <IconCategory icon={c.icon} className="h-4 w-4" />
              </span>
              {c.label}
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
