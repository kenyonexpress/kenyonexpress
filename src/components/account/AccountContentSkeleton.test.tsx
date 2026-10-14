import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import AccountLoading from '../../app/(account)/account/loading'
import AccountContentSkeleton, {
  ACCOUNT_LOADING_LABEL,
  ACCOUNT_SKELETON_CARDS,
} from './AccountContentSkeleton'

/**
 * UX27: the account column while a page streams. Measured before: an empty
 * column for ~2s on a direct load and the previous page held for 2.3-2.6s on
 * a tab press. The body is one component, and it is both the instant state
 * (account/loading.tsx) and what the first flush carries, so the composition
 * is pinned here as well as the shape.
 */
describe('AccountContentSkeleton', () => {
  it('is a busy region with one hidden sentence and nothing else for a screen reader', () => {
    render(<AccountContentSkeleton />)
    const region = document.querySelector('[data-account-skeleton]')
    expect(region).not.toBeNull()
    expect(region?.getAttribute('aria-busy')).toBe('true')
    expect(screen.getByText(ACCOUNT_LOADING_LABEL)).toHaveClass('sr-only')
    // Every bar is decorative: no heading, no list, no link to land on.
    expect(screen.queryByRole('heading')).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
    for (const bar of document.querySelectorAll('.ke-skeleton')) {
      expect(bar.closest('[aria-hidden="true"]')).not.toBeNull()
    }
  })

  it('draws the column at its own sizes: the title line, the subtitle, then cards in the card frame', () => {
    render(<AccountContentSkeleton />)
    expect(document.querySelector('.account-title .ke-skeleton')).not.toBeNull()
    expect(document.querySelector('.account-subtitle .ke-skeleton')).not.toBeNull()
    const cards = document.querySelectorAll('.account-card.account-pending__card')
    expect(cards).toHaveLength(ACCOUNT_SKELETON_CARDS)
    for (const card of cards) {
      expect(card.querySelectorAll('.ke-skeleton')).toHaveLength(4)
    }
  })

  it('takes the number of cards from the caller', () => {
    render(<AccountContentSkeleton cards={1} />)
    expect(document.querySelectorAll('.account-pending__card')).toHaveLength(1)
  })

  it('is what account/loading.tsx renders, so a navigation into any /account page paints it at once', () => {
    render(<AccountLoading />)
    expect(document.querySelector('[data-account-skeleton]')).not.toBeNull()
    expect(document.querySelectorAll('.account-pending__card')).toHaveLength(ACCOUNT_SKELETON_CARDS)
  })

  it('is the ONLY boundary over the column: the layout carries no Suspense of its own round children', () => {
    // Two boundaries were 23 account shells refused by the csp gate: the outer
    // one completes during the prerender and Fizz writes its nonce-less
    // reveal runtime into the static HTML (logs/ux27/build.log). The layout
    // hands the children straight to the column and loading.tsx is the one
    // boundary. A render cannot see this; the source can.
    const layout = readFileSync(resolve(process.cwd(), 'src/app/(account)/layout.tsx'), 'utf8')
    expect(layout).toContain('<div className="account-content">{children}</div>')
    expect(layout).not.toMatch(/<Suspense[^>]*>\{children\}<\/Suspense>/)
    expect(layout).not.toContain('AccountContentSkeleton')
  })
})
