import { Search } from 'lucide-react'

// GET-form filter bar: submits straight into searchParams, zero client JS.
// Children are extra <select name=...> / hidden inputs specific to the page.

interface FilterBarProps {
  basePath: string
  searchPlaceholder?: string
  defaultQuery?: string
  children?: React.ReactNode
  // Params to preserve across a new search (rendered as hidden inputs).
  preserve?: Record<string, string | number | undefined>
}

export default function FilterBar({
  basePath,
  searchPlaceholder = 'חיפוש...',
  defaultQuery,
  children,
  preserve = {},
}: FilterBarProps) {
  return (
    <form method="get" action={basePath} className="flex flex-wrap items-center gap-3">
      {Object.entries(preserve).map(([key, value]) =>
        value === undefined || value === '' ? null : (
          <input key={key} type="hidden" name={key} value={String(value)} />
        ),
      )}
      <div className="relative min-w-[12rem] max-w-sm flex-1">
        <Search
          size={15}
          className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-black/40"
          aria-hidden
        />
        <input
          type="search"
          name="q"
          defaultValue={defaultQuery}
          placeholder={searchPlaceholder}
          className="h-9 w-full rounded-md border border-black/10 bg-[#FFFFFF] ps-9 pe-3 text-sm text-[#000000] outline-none focus-visible:ring-2 focus-visible:ring-[#fed700]"
        />
      </div>
      {children}
      <button
        type="submit"
        className="h-9 rounded-md bg-[#333e48] px-4 text-sm font-medium text-white transition-colors hover:bg-black"
      >
        סינון
      </button>
    </form>
  )
}
