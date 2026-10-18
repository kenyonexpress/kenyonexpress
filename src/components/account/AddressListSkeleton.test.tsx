import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import AddressListSkeleton from './AddressListSkeleton'

describe('AddressListSkeleton', () => {
  it('renders default count of 3 skeletons', () => {
    const { container } = render(<AddressListSkeleton />)
    const items = container.querySelectorAll('[aria-hidden="true"]')
    expect(items).toHaveLength(3)
  })

  it('renders custom count of skeletons', () => {
    const { container } = render(<AddressListSkeleton count={2} />)
    const items = container.querySelectorAll('[aria-hidden="true"]')
    expect(items).toHaveLength(2)
  })

  it('has aria-busy attribute on list container', () => {
    const { container } = render(<AddressListSkeleton />)
    const list = container.querySelector('[aria-busy="true"]')
    expect(list).toBeInTheDocument()
  })

  it('has aria-label for accessibility', () => {
    const { container } = render(<AddressListSkeleton />)
    const list = container.querySelector('[aria-label="טוען רשימת כתובות"]')
    expect(list).toBeInTheDocument()
  })

  it('uses space-y-3 for item spacing', () => {
    const { container } = render(<AddressListSkeleton />)
    const list = container.querySelector('.space-y-3')
    expect(list).toBeInTheDocument()
  })

  it('includes placeholder elements for content', () => {
    const { container } = render(<AddressListSkeleton />)
    const placeholders = container.querySelectorAll('[class*="bg-gray"]')
    expect(placeholders.length).toBeGreaterThan(0)
  })
})
