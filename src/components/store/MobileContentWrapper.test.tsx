import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import MobileContentWrapper from './MobileContentWrapper'

describe('MobileContentWrapper', () => {
  it('renders the same wrapper on every path, so server and client trees match', () => {
    for (const path of ['/', '/product/x', '/category/y']) {
      window.history.pushState({}, '', path)
      const { container, unmount } = render(
        <MobileContentWrapper>
          <p>page</p>
        </MobileContentWrapper>,
      )
      expect(container.firstElementChild).toHaveAttribute('data-pull-to-refresh')
      expect(container.firstElementChild).toHaveClass('contents')
      unmount()
    }
  })

  it('does not start a pull off the home and category pages', () => {
    window.history.pushState({}, '', '/product/x')
    const { container } = render(
      <MobileContentWrapper>
        <p>page</p>
      </MobileContentWrapper>,
    )
    const wrapper = container.firstElementChild as HTMLElement
    fireEvent.touchStart(wrapper, { touches: [{ clientY: 0 }] })
    fireEvent.touchMove(wrapper, { changedTouches: [{ clientY: 200 }] })
    expect(screen.getByText('page').previousElementSibling).toBeNull()
  })

  it('shows the pull indicator on the home page', () => {
    window.history.pushState({}, '', '/')
    const { container } = render(
      <MobileContentWrapper>
        <p>page</p>
      </MobileContentWrapper>,
    )
    const wrapper = container.firstElementChild as HTMLElement
    fireEvent.touchStart(wrapper, { touches: [{ clientY: 10 }] })
    fireEvent.touchMove(wrapper, { changedTouches: [{ clientY: 200 }] })
    expect(screen.getByText('page').previousElementSibling).not.toBeNull()
  })
})
