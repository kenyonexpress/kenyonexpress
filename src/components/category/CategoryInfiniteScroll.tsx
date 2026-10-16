'use client'

import { useRouter } from 'next/navigation'
import { useCallback } from 'react'
import InfiniteScrollLoader from './InfiniteScrollLoader'

type Props = {
  pathname: string
  linkParams: Record<string, string | undefined>
  currentPage: number
}

export default function CategoryInfiniteScroll({ pathname, linkParams, currentPage }: Props) {
  const router = useRouter()

  const handleLoadMore = useCallback(() => {
    const nextPage = currentPage + 1
    const params = new URLSearchParams()

    // Build query string with all current filters
    for (const [key, value] of Object.entries(linkParams)) {
      if (value) {
        params.set(key, value)
      }
    }
    params.set('page', String(nextPage))

    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [currentPage, linkParams, pathname, router])

  return <InfiniteScrollLoader onLoadMore={handleLoadMore} hasMore={true} />
}
