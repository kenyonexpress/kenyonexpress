import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CategoryFilterSidebar from './CategoryFilterSidebar'

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
  usePathname: vi.fn(),
  useSearchParams: vi.fn(),
}))

describe('CategoryFilterSidebar', () => {
  const mockPush = vi.fn()
  const mockSearchParams = new URLSearchParams()

  beforeEach(() => {
    vi.clearAllMocks()
    // biome-ignore lint/suspicious/noExplicitAny: test mocks require any casting
    ;(useRouter as any).mockReturnValue({ push: mockPush })
    // biome-ignore lint/suspicious/noExplicitAny: test mocks require any casting
    ;(usePathname as any).mockReturnValue('/category/test')
    // biome-ignore lint/suspicious/noExplicitAny: test mocks require any casting
    ;(useSearchParams as any).mockReturnValue(mockSearchParams)
  })

  it('renders filter sections', () => {
    render(
      <CategoryFilterSidebar
        categoryMinPrice={100}
        categoryMaxPrice={5000}
        suppliers={[]}
        tags={[]}
      />,
    )

    expect(screen.getByText('טווח מחירים')).toBeInTheDocument()
  })

  it('renders suppliers filter with counts', () => {
    const suppliers = [
      { supplier_id: '1', supplier_name_he: 'ספק א', product_count: 15 },
      { supplier_id: '2', supplier_name_he: 'ספק ב', product_count: 8 },
    ]

    render(
      <CategoryFilterSidebar
        categoryMinPrice={100}
        categoryMaxPrice={5000}
        suppliers={suppliers}
        tags={[]}
      />,
    )

    expect(screen.getByText('ספק א')).toBeInTheDocument()
    expect(screen.getByText('ספק ב')).toBeInTheDocument()
    expect(screen.getByText('15')).toBeInTheDocument()
    expect(screen.getByText('8')).toBeInTheDocument()
  })

  it('renders tags filter with counts', () => {
    const tags = [
      { tag: 'hot-sale', product_count: 20 },
      { tag: 'new', product_count: 12 },
    ]

    render(
      <CategoryFilterSidebar
        categoryMinPrice={100}
        categoryMaxPrice={5000}
        suppliers={[]}
        tags={tags}
      />,
    )

    expect(screen.getByText('hot-sale')).toBeInTheDocument()
    expect(screen.getByText('new')).toBeInTheDocument()
  })

  it('toggles supplier section visibility', () => {
    const suppliers = [{ supplier_id: '1', supplier_name_he: 'ספק א', product_count: 15 }]

    render(
      <CategoryFilterSidebar
        categoryMinPrice={100}
        categoryMaxPrice={5000}
        suppliers={suppliers}
        tags={[]}
      />,
    )

    const supplierHeaderElements = screen.getAllByText('ספקים')
    expect(supplierHeaderElements.length).toBeGreaterThan(0)
    const supplierHeader = supplierHeaderElements[0]?.closest('button') as HTMLButtonElement | null
    expect(supplierHeader).toBeInTheDocument()

    if (supplierHeader) {
      fireEvent.click(supplierHeader)
      expect(screen.queryByText('ספק א')).not.toBeInTheDocument()

      fireEvent.click(supplierHeader)
      expect(screen.getByText('ספק א')).toBeInTheDocument()
    }
  })

  it('triggers router.push when supplier is clicked', async () => {
    const suppliers = [
      { supplier_id: 'supplier-123', supplier_name_he: 'ספק א', product_count: 15 },
    ]

    render(
      <CategoryFilterSidebar
        categoryMinPrice={100}
        categoryMaxPrice={5000}
        suppliers={suppliers}
        tags={[]}
      />,
    )

    const supplierButton = screen.getByText('ספק א').closest('button') as HTMLButtonElement | null
    expect(supplierButton).not.toBeNull()
    if (supplierButton) {
      fireEvent.click(supplierButton)

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalled()
        const callArgs = mockPush.mock.calls[0]?.[0] as string | undefined
        expect(callArgs).toBeTruthy()
        if (callArgs) {
          expect(callArgs).toContain('supplier=supplier-123')
        }
      })
    }
  })

  it('toggles tags section visibility', () => {
    const tags = [{ tag: 'hot-sale', product_count: 20 }]

    render(
      <CategoryFilterSidebar
        categoryMinPrice={100}
        categoryMaxPrice={5000}
        suppliers={[]}
        tags={tags}
      />,
    )

    const tagsHeader = screen.getByText('תגיות').closest('button') as HTMLButtonElement | null
    expect(tagsHeader).toBeInTheDocument()

    if (tagsHeader) {
      fireEvent.click(tagsHeader)
      expect(screen.queryByText('hot-sale')).not.toBeInTheDocument()

      fireEvent.click(tagsHeader)
      expect(screen.getByText('hot-sale')).toBeInTheDocument()
    }
  })

  it('triggers router.push when tag is clicked', async () => {
    const tags = [{ tag: 'hot-sale', product_count: 20 }]

    render(
      <CategoryFilterSidebar
        categoryMinPrice={100}
        categoryMaxPrice={5000}
        suppliers={[]}
        tags={tags}
      />,
    )

    const tagButton = screen.getByText('hot-sale').closest('button') as HTMLButtonElement | null
    expect(tagButton).not.toBeNull()
    if (tagButton) {
      fireEvent.click(tagButton)

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalled()
        const callArgs = mockPush.mock.calls[0]?.[0] as string | undefined
        expect(callArgs).toBeTruthy()
        if (callArgs) {
          expect(callArgs).toContain('tag=hot-sale')
        }
      })
    }
  })

  it('hides suppliers section when empty', () => {
    render(
      <CategoryFilterSidebar
        categoryMinPrice={100}
        categoryMaxPrice={5000}
        suppliers={undefined}
        tags={[]}
      />,
    )

    expect(screen.queryByText('ספקים')).not.toBeInTheDocument()
  })

  it('hides tags section when empty', () => {
    render(
      <CategoryFilterSidebar
        categoryMinPrice={100}
        categoryMaxPrice={5000}
        suppliers={[]}
        tags={undefined}
      />,
    )

    expect(screen.queryByText('תגיות')).not.toBeInTheDocument()
  })

  it('passes dynamic price bounds to slider', () => {
    const { container } = render(
      <CategoryFilterSidebar
        categoryMinPrice={200}
        categoryMaxPrice={8000}
        suppliers={[]}
        tags={[]}
      />,
    )

    const minInput = container.querySelector(
      'input[aria-label="מחיר מינימלי"]',
    ) as HTMLInputElement | null
    const maxInput = container.querySelector(
      'input[aria-label="מחיר מקסימלי"]',
    ) as HTMLInputElement | null

    expect(minInput).not.toBeNull()
    expect(maxInput).not.toBeNull()
    if (minInput && maxInput) {
      expect(minInput.min).toBe('200')
      expect(maxInput.max).toBe('8000')
    }
  })
})
