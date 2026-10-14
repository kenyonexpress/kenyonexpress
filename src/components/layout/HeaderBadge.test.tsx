import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import HeaderBadge from './HeaderBadge'

/**
 * The count badge's one piece of logic: WHEN it pops. The shape is CSS and is
 * measured in e2e/header.spec.ts; this pins the trigger, because the obvious
 * trigger ("the count changed") pops on every page load as the cart mirror
 * rehydrates, and that is the version a screenshot cannot catch.
 */
describe('HeaderBadge', () => {
  it('renders nothing at zero, the count otherwise, and caps at 99+', () => {
    const { container, rerender } = render(<HeaderBadge count={0} armed />)
    expect(container.querySelector('.header-badge')).toBeNull()
    rerender(<HeaderBadge count={3} armed />)
    expect(container.querySelector('.header-badge')).toHaveTextContent('3')
    rerender(<HeaderBadge count={120} armed />)
    expect(container.querySelector('.header-badge')).toHaveTextContent('99+')
    expect(container.querySelector('.header-badge')).toHaveAttribute('aria-hidden', 'true')
  })

  it('does not pop on mount, and not on the change that arms the store', () => {
    const { container, rerender } = render(<HeaderBadge count={3} armed />)
    expect(container.querySelector('.header-badge--bump')).toBeNull()
    // The cart mirror's 0 -> N lands before the server has confirmed: unarmed.
    const unarmed = render(<HeaderBadge count={0} armed={false} />)
    unarmed.rerender(<HeaderBadge count={3} armed={false} />)
    expect(unarmed.container.querySelector('.header-badge--bump')).toBeNull()
    // The server confirming the same count does not pop either.
    unarmed.rerender(<HeaderBadge count={3} armed />)
    expect(unarmed.container.querySelector('.header-badge--bump')).toBeNull()
    // Nor a count that arrives in the same render as the arming.
    rerender(<HeaderBadge count={3} armed={false} />)
    rerender(<HeaderBadge count={5} armed />)
    expect(container.querySelector('.header-badge--bump')).toBeNull()
  })

  it('pops on a change after the store is armed, once, and settles on animationend', () => {
    const { container, rerender } = render(<HeaderBadge count={3} armed />)
    rerender(<HeaderBadge count={4} armed />)
    const badge = container.querySelector('.header-badge')
    expect(badge).toHaveClass('header-badge--bump')
    expect(badge).toHaveAttribute('data-bump', '')
    expect(badge).toHaveTextContent('4')
    fireEvent.animationEnd(badge as Element)
    expect(container.querySelector('.header-badge')).not.toHaveClass('header-badge--bump')
    expect(container.querySelector('.header-badge')).not.toHaveAttribute('data-bump')
    // A removal that leaves items pops too; emptying the cart removes the badge.
    rerender(<HeaderBadge count={2} armed />)
    expect(container.querySelector('.header-badge')).toHaveClass('header-badge--bump')
    rerender(<HeaderBadge count={0} armed />)
    expect(container.querySelector('.header-badge')).toBeNull()
  })
})
