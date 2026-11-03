'use client'

import dynamic from 'next/dynamic'

/**
 * ProductCard for the product page's related-products row, which sits below
 * the fold. Server-rendered exactly as before; `next/dynamic` from a client
 * module (a server-side `dynamic()` did not split, measured C183) moves the
 * card, its heart, badge and location code out of the page's first-load
 * scripts.
 */
const LazyProductCard = dynamic(() => import('@/components/ProductCard'))

export default LazyProductCard
