'use client'

import Link from 'next/link'

export default function TransactionFilter({ currentFilter }: { currentFilter: string }) {
  const filters = [
    { key: 'all', label: 'הכל' },
    { key: 'credit', label: 'זיכויים' },
    { key: 'debit', label: 'חיובים' },
  ]

  return (
    <div className="flex gap-2">
      {filters.map((filter) => (
        <Link
          key={filter.key}
          href={`/account/wallet${filter.key !== 'all' ? `?filter=${filter.key}` : ''}`}
          className={`px-3 py-1 text-xs font-medium rounded ${
            currentFilter === filter.key
              ? 'bg-brand-dark text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          {filter.label}
        </Link>
      ))}
    </div>
  )
}
