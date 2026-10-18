import PageTransition from '@/components/motion/PageTransition'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(),
}))

describe('PageTransition', () => {
  it('renders children', async () => {
    const { usePathname } = await import('next/navigation')
    vi.mocked(usePathname).mockReturnValue('/products')

    render(
      <PageTransition>
        <div>Test Content</div>
      </PageTransition>,
    )

    expect(screen.getByText('Test Content')).toBeInTheDocument()
  })

  it('applies motion div wrapper', async () => {
    const { usePathname } = await import('next/navigation')
    vi.mocked(usePathname).mockReturnValue('/products')

    const { container } = render(
      <PageTransition>
        <div>Test</div>
      </PageTransition>,
    )

    const motionDiv = container.firstChild
    expect(motionDiv).toBeInTheDocument()
  })

  it('has correct full width class', async () => {
    const { usePathname } = await import('next/navigation')
    vi.mocked(usePathname).mockReturnValue('/products')

    const { container } = render(
      <PageTransition>
        <div>Test</div>
      </PageTransition>,
    )

    const motionDiv = container.firstChild as HTMLElement
    expect(motionDiv.classList.contains('w-full')).toBe(true)
  })

  it('renders multiple children', async () => {
    const { usePathname } = await import('next/navigation')
    vi.mocked(usePathname).mockReturnValue('/account')

    render(
      <PageTransition>
        <div>Header</div>
        <div>Content</div>
        <div>Footer</div>
      </PageTransition>,
    )

    expect(screen.getByText('Header')).toBeInTheDocument()
    expect(screen.getByText('Content')).toBeInTheDocument()
    expect(screen.getByText('Footer')).toBeInTheDocument()
  })
})
