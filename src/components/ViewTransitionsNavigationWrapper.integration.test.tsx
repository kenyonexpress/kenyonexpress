import { render } from '@testing-library/react'
import { useRouter } from 'next/navigation'
import { describe, expect, it, vi } from 'vitest'
import ViewTransitionsNavigationWrapper from './ViewTransitionsNavigationWrapper'

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}))

const mockUseRouter = useRouter as unknown as ReturnType<typeof vi.fn>

/**
 * Integration test: verify that the wrapper actually modifies the global router
 * instance so that any component calling useRouter() gets the wrapped version.
 */
describe('ViewTransitionsNavigationWrapper integration', () => {
  it('wraps router globally so a child component calling useRouter gets the wrapped router', () => {
    // Create a shared mock router that all calls to useRouter will return
    const originalPush = vi.fn()
    const sharedMockRouter = {
      push: originalPush,
      replace: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
    }
    mockUseRouter.mockReturnValue(sharedMockRouter)

    const startViewTransitionMock = vi.fn((callback: () => void) => {
      callback()
      return Promise.resolve()
    })
    Object.defineProperty(document, 'startViewTransition', {
      value: startViewTransitionMock,
      writable: true,
      configurable: true,
    })

    // Component that calls useRouter AFTER wrapper is mounted
    function ChildComponent() {
      const router = useRouter()
      return (
        <button type="button" onClick={() => router.push('/test')} data-testid="nav-button">
          Navigate
        </button>
      )
    }

    const { getByTestId } = render(
      <ViewTransitionsNavigationWrapper>
        <ChildComponent />
      </ViewTransitionsNavigationWrapper>,
    )

    // Click the button to trigger navigation
    const button = getByTestId('nav-button')
    button.click()

    // Verify startViewTransition was called (proving the wrapper intercepted the navigation)
    expect(startViewTransitionMock).toHaveBeenCalled()

    // Verify the original push was called (inside the transition callback)
    expect(originalPush).toHaveBeenCalled()
    // Check what arguments were passed
    const firstCall = originalPush.mock.calls[0]
    expect(firstCall?.[0]).toBe('/test')
  })
})
