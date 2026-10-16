import { render } from '@testing-library/react'
import { useRouter } from 'next/navigation'
import { describe, expect, it, vi } from 'vitest'
import ViewTransitionsNavigationWrapper from './ViewTransitionsNavigationWrapper'

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}))

describe('ViewTransitionsNavigationWrapper', () => {
  it('calls startViewTransition when router.push is called with view transitions supported', () => {
    const originalPush = vi.fn()
    const mockRouter = {
      push: originalPush,
      replace: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
    }
    ;(useRouter as any).mockReturnValue(mockRouter)

    const startViewTransitionMock = vi.fn((callback: () => void) => {
      callback()
      return Promise.resolve()
    })
    Object.defineProperty(document, 'startViewTransition', {
      value: startViewTransitionMock,
      writable: true,
      configurable: true,
    })

    render(
      <ViewTransitionsNavigationWrapper>
        <div>Test</div>
      </ViewTransitionsNavigationWrapper>,
    )

    // Call the wrapped push
    mockRouter.push('/test')

    // Verify startViewTransition was called
    expect(startViewTransitionMock).toHaveBeenCalled()
  })

  it('calls startViewTransition when router.back is called', () => {
    const mockRouter = {
      push: vi.fn(),
      replace: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
    }
    ;(useRouter as any).mockReturnValue(mockRouter)

    const startViewTransitionMock = vi.fn((callback: () => void) => {
      callback()
      return Promise.resolve()
    })
    Object.defineProperty(document, 'startViewTransition', {
      value: startViewTransitionMock,
      writable: true,
      configurable: true,
    })

    render(
      <ViewTransitionsNavigationWrapper>
        <div>Test</div>
      </ViewTransitionsNavigationWrapper>,
    )

    mockRouter.back()

    expect(startViewTransitionMock).toHaveBeenCalled()
  })

  it('handles navigation without view transitions API support', () => {
    const mockPush = vi.fn()
    const mockRouter = {
      push: mockPush,
      replace: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
    }
    ;(useRouter as any).mockReturnValue(mockRouter)

    Object.defineProperty(document, 'startViewTransition', {
      value: undefined,
      writable: true,
      configurable: true,
    })

    render(
      <ViewTransitionsNavigationWrapper>
        <div>Test</div>
      </ViewTransitionsNavigationWrapper>,
    )

    mockRouter.push('/test')

    expect(mockPush).toHaveBeenCalled()
  })
})
