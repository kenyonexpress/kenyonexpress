'use client'

import { Search } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

/** Standalone search box for the search results page. */
export default function SearchBox({ defaultValue = '' }: { defaultValue?: string }) {
  const router = useRouter()
  const [q, setQ] = useState(defaultValue)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const term = q.trim()
    router.push(term ? `/search?q=${encodeURIComponent(term)}` : '/search')
  }

  return (
    <form onSubmit={submit} className="flex max-w-xl items-stretch" aria-label="חיפוש מוצרים">
      <div className="flex w-full items-stretch overflow-hidden rounded-lg border-2 border-brand-primary bg-white">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="מה בא לך למצוא היום?"
          className="min-w-0 flex-1 px-4 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-black/40"
        />
        <button
          type="submit"
          aria-label="חיפוש"
          className="flex items-center justify-center bg-brand-primary px-5 text-brand-dark transition-colors hover:bg-brand-primary-hover"
        >
          <Search size={18} />
        </button>
      </div>
    </form>
  )
}
