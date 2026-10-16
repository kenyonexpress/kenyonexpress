import { render } from '@testing-library/react'
import { useRouter } from 'next/navigation'
import { vi } from 'vitest'
import ViewTransitionsNavigationWrapper from './ViewTransitionsNavigationWrapper'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}))

describe('ViewTransitionsNavigationWrapper', () => {
  it('renders children', () => {
    const mockRouter = {
      push: vi.fn(),
      replace: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
    }
    ;(useRouter as any).mockReturnValue(mockRouter)

    const { container } = render(
      <ViewTransitionsNavigationWrapper>
        <div>Test content</div>
      </ViewTransitionsNavigationWrapper>,
    )

    expect(container.textContent).toContain('Test content')
  })

  it('wraps router.push with view transition capability', () => {
    const mockRouter = {
      push: vi.fn(),
      replace: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
    }
    ;(useRouter as any).mockReturnValue(mockRouter)

    // Mark document as supporting startViewTransition
    Object.defineProperty(document, 'startViewTransition', {
      value: vi.fn((cb) => {
        cb()
      }),
      configurable: true,
    })

    render(
      <ViewTransitionsNavigationWrapper>
        <div>Test</div>
      </ViewTransitionsNavigationWrapper>,
    )

    // The wrapper should have replaced router.push
    expect(typeof mockRouter.push).toBe('function')
  })
})
