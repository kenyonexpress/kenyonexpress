'use client'

import WishlistCard from '@/components/account/WishlistCard'
import type { WishlistEntry } from '@/server/queries/wishlist'
import { useState } from 'react'

interface WishlistPageClientProps {
  initialEntries: WishlistEntry[]
}

export default function WishlistPageClient({ initialEntries }: WishlistPageClientProps) {
  const [entries, setEntries] = useState<WishlistEntry[]>(initialEntries)

  const handleRemoveEntry = (productId: string) => {
    setEntries((prev) => prev.filter((entry) => entry.product_id !== productId))
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {entries.map((entry) => (
        <WishlistCard
          key={entry.product_id}
          entry={entry}
          onRemove={() => handleRemoveEntry(entry.product_id)}
        />
      ))}
    </ul>
  )
}
