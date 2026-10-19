import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import CouponListSkeleton from './CouponListSkeleton'

describe('CouponListSkeleton', () => {
  it('renders default count of 3 skeletons', () => {
    const { container } = render(<CouponListSkeleton />)
    const items = container.querySelectorAll('.account-row')
    expect(items).toHaveLength(3)
  })

  it('renders custom count of skeletons', () => {
    const { container } = render(<CouponListSkeleton count={2} />)
    const items = container.querySelectorAll('.account-row')
    expect(items).toHaveLength(2)
  })

  it('has aria-busy attribute on list container', () => {
    const { container } = render(<CouponListSkeleton />)
    const list = container.querySelector('[aria-busy="true"]')
    expect(list).toBeInTheDocument()
  })

  it('has aria-label for accessibility', () => {
    const { container } = render(<CouponListSkeleton />)
    const list = container.querySelector('[aria-label="טוען רשימת קופונים"]')
    expect(list).toBeInTheDocument()
  })

  it('includes placeholder elements for content', () => {
    const { container } = render(<CouponListSkeleton />)
    const placeholders = container.querySelectorAll('[class*="bg-gray"]')
    expect(placeholders.length).toBeGreaterThan(0)
  })
})
